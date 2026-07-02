// Copyright Jerome Benoit. 2021-2026. All Rights Reserved.

/**
 * @file Physics computation for coherent MeterValues.
 * @description Owns the physics chain V → P → I → ΔE → SoC that produces a
 *   single {@link CoherentSample} per emission tick. Extracted from
 *   {@link ./CoherentMeterValuesGenerator} as part of the file split in
 *   issue #1936 (item i) to keep each module under the 250 LOC ceiling.
 *
 * Invariants (enforced by construction):
 * - **INV-1**: AC: `P = V × I × phases`; DC: `P = V × I`. Emitted `powerW`
 *   is recomputed from the rounded emitted current and voltage so
 *   `|P - V·I·phases|` stays within the `ROUNDING_SCALE` half-width
 *   (≤ 0.005 W scalar bound) regardless of V or phases. Per-phase L-N
 *   `Power.Active.Import` emission is derived as
 *   `round(aggregate_P / phases, 2)`; the per-phase identity
 *   `|P_LxN - V_LxN · I_Lx|` therefore holds within `2 × ROUNDING_SCALE`
 *   half-width (≤ 0.01 W) — one half-width for the aggregate emit and
 *   one for the per-phase division.
 * - **INV-2**: `SoC(t+1) ≥ SoC(t)` and `ΔSoC = ΔE / batteryCapacityWh × 100`.
 *   SoC monotone non-decreasing during charging and saturates at 100 %.
 * - **INV-3**: `ΔE = P_clamped × Δt / MS_PER_HOUR` where `P_clamped` is the
 *   pre-emit-rounding capacity-clamped power. `E(t+1) ≥ E(t)`. A consumer
 *   integrating the post-rounding emitted `powerW` samples may diverge
 *   from the register by at most `ROUNDING_SCALE half-width × N × Δt /
 *   MS_PER_HOUR` Wh over `N` samples — bounded and invisible at
 *   `ROUNDING_SCALE` (~0.12 Wh over 24 h at 1 Hz).
 * - `P ≤ min(EVSE_max, EV_acceptance(SoC))`.
 * - `SoC ≥ 100 ⇒ P = 0, I = 0, ΔE = 0`.
 *
 * The energy register update lives in {@link advanceEnergyRegister}; the
 * caller (`buildCoherentMeterValue` in the builder module) invokes it once
 * per sample so `meterStop` stays correct even when
 * `Energy.Active.Import.Register` is not in the configured MeterValues.
 */

import type { ConnectorStatus } from '../../types/index.js'
import type { CoherentSession, ICoherentContext } from './types.js'

import { CurrentType } from '../../types/index.js'
import { Constants, roundTo } from '../../utils/index.js'
import { createStreamPrng, getSessionRuntime } from './CoherentMeterValuesGenerator.js'
import { interpolateChargingCurve } from './EvProfiles.js'

/**
 * Decimal places for all physics-quantity rounding (V, A, W, Wh, SoC).
 * The `roundTo` half-width bound is `0.5 × 10^-ROUNDING_SCALE = 0.005` on
 * each rounded quantity; INV-1 residual is bounded by this scalar.
 */
export const ROUNDING_SCALE = 2

/**
 * Coherent physics sample. All fields follow the `<quantity><Unit>` naming
 * convention (`currentA`, `powerW`, `voltageV`, ...).
 */
export interface CoherentSample {
  currentA: number
  deltaEnergyWh: number
  energyRegisterWh: number
  powerW: number
  socPercent: number
  voltageV: number
}

/**
 * Options for {@link computeCoherentSample}.
 */
export interface ComputeSampleOptions {
  /**
   * Sample interval in milliseconds. Drives energy accrual and the
   * remaining-capacity clamp. Non-positive/non-finite triggers the
   * zero-sample defensive branch.
   */
  intervalMs: number
  /**
   * Sample timestamp in milliseconds (typically `Date.now()`); combined
   * with `session.sessionStartMs` for ramp-up progress. Non-finite
   * triggers the zero-sample defensive branch.
   */
  nowMs: number
  /**
   * Root 32-bit seed for stream splitting; combined with
   * `session.transactionId` and per-measurand labels to derive
   * independent PRNG streams via FNV-1a stream splitting.
   */
  rootSeed: number
  /**
   * Enable or disable per-sample voltage noise. When `false`, `voltageV`
   * is exactly the nominal voltage with no PRNG-derived fluctuation.
   * Intended for deterministic unit tests. Defaults to `true` when
   * omitted (the `options.voltageNoise !== false` guard).
   */
  voltageNoise?: boolean
}

const buildZeroSample = (
  socPercent: number,
  voltageV: number,
  energyRegisterWh: number
): CoherentSample => ({
  currentA: 0,
  deltaEnergyWh: 0,
  energyRegisterWh,
  powerW: 0,
  socPercent: roundTo(socPercent, ROUNDING_SCALE),
  voltageV: voltageV > 0 && Number.isFinite(voltageV) ? roundTo(voltageV, ROUNDING_SCALE) : 0,
})

/**
 * Symmetric fluctuation helper: draws a uniform sample and maps it into
 * `[base * (1 - percent), base * (1 + percent))`.
 * @param base - Nominal value.
 * @param percent - Half-width of the symmetric interval (e.g. 0.01 = ±1 %).
 * @param prng - Seeded PRNG stream.
 * @returns Fluctuated value.
 */
const fluctuate = (base: number, percent: number, prng: () => number): number => {
  return base * (1 + (prng() * 2 - 1) * percent)
}

/**
 * Unconditionally advances the connector energy registers by `deltaEnergyWh`.
 * The coherent path owns register updates so `meterStop` stays correct even
 * when the `Energy.Active.Import.Register` measurand is not configured.
 * Negative or nullish register starting values are clamped to zero before
 * accrual.
 * @param connectorStatus - Target connector status (in-place update).
 * @param deltaEnergyWh - Energy delta (Wh).
 */
export const advanceEnergyRegister = (
  connectorStatus: ConnectorStatus | undefined,
  deltaEnergyWh: number
): void => {
  if (connectorStatus == null) {
    return
  }
  connectorStatus.energyActiveImportRegisterValue =
    Math.max(0, connectorStatus.energyActiveImportRegisterValue ?? 0) + deltaEnergyWh
  connectorStatus.transactionEnergyActiveImportRegisterValue =
    Math.max(0, connectorStatus.transactionEnergyActiveImportRegisterValue ?? 0) + deltaEnergyWh
}

/**
 * Computes a single coherent sample and mutates the caller-owned
 * `session.socPercent`. The energy register is NOT advanced here; the
 * caller (`buildCoherentMeterValue`) invokes {@link advanceEnergyRegister}
 * once per emitted sample so the semantics match the OCPP energy meter
 * model.
 *
 * Physics chain (INV-1/INV-2/INV-3 hold by construction):
 * 1. `rampFactor = min(1, elapsed / rampUp)` — immutable session start.
 * 2. `V` — nominal ± small seed-derived noise.
 * 3. `evAcceptanceW = curve(SoC) × profile.maxPowerW`.
 * 4. `powerW = rampFactor × min(EVSE_max, evAcceptance) × socCap`.
 *    EVSE cap already folds in charging profiles via
 *    {@link ICoherentContext.getConnectorMaximumAvailablePower}.
 * 5. `powerW` is then clamped to remaining battery capacity so a sample
 *    crossing 100 % SoC never over-charges the register.
 * 6. `currentAExact = powerW / (V_round · phases)` — exact fraction
 *    (phases=1 for DC). Emitted current is rounded to `ROUNDING_SCALE`.
 * 7. Emitted `powerW = round(V_round × currentA_round × phases)`;
 *    INV-1 holds within `ROUNDING_SCALE` half-width (≤ 0.005 W).
 * 8. `ΔE = P_clamped × Δt / MS_PER_HOUR` — uses the pre-emit-rounding
 *    `powerW` so the register integrates the capacity-clamped power
 *    exactly (INV-3).
 * 9. `ΔSoC = ΔE / capacity × 100`; `socPercent = min(100, soc + ΔSoC)`.
 * @param context - Charging-station context.
 * @param connectorStatus - Connector status.
 * @param session - Active coherent session (resolved by caller).
 * @param options - Per-sample parameters (interval, seed material, ...).
 * @returns The computed sample. `energyRegisterWh` reflects the projected
 *   register value AFTER `advanceEnergyRegister` is applied by the caller.
 */
export const computeCoherentSample = (
  context: ICoherentContext,
  connectorStatus: ConnectorStatus,
  session: CoherentSession,
  options: ComputeSampleOptions
): CoherentSample => {
  const transactionId = session.transactionId

  // Defensive guard bundle covering NaN/incoherence sources:
  // - intervalMs ≤ 0 or non-finite: divide-by-zero, negative Δt, or NaN/Infinity
  //   propagates through `maxPowerFromCapacityW = remainingWh · MS_PER_HOUR /
  //   intervalMs` and permanently poisons session.socPercent. `Number.isFinite`
  //   covers the NaN/±Infinity paths since `NaN <= 0 === false`.
  // - batteryCapacityWh ≤ 0 or non-finite: Zod (`EvProfileSchema`) enforces
  //   `.positive()` at file load, but `injectCoherentSession` bypasses Zod;
  //   `deltaSocPercent = ΔE / batteryCapacityWh × 100 = NaN` would poison SoC.
  // - nominal voltage ≤ 0 or non-finite: `Voltage` enum values are all-positive,
  //   but a template override or future dynamic supply could return 0.
  // - nowMs non-finite: pushes elapsedMs to NaN and destabilizes rampFactor.
  // - AC with numberOfPhases ≤ 0: divisor collapses to 0 (`V · 0 = 0`),
  //   currentA is guarded to zero, and P = 0 silently — a misconfigured
  //   multi-phase station would emit zeros for the whole session. Fail
  //   loudly with a zero sample so operators notice the misconfiguration.
  const batteryCapacityWh = session.profile.batteryCapacityWh
  const nominalV: number = session.voltageOutNominal
  const currentType = session.currentType
  const numberOfPhases = session.numberOfPhases
  if (
    options.intervalMs <= 0 ||
    !Number.isFinite(options.intervalMs) ||
    batteryCapacityWh <= 0 ||
    !Number.isFinite(batteryCapacityWh) ||
    nominalV <= 0 ||
    !Number.isFinite(nominalV) ||
    !Number.isFinite(options.nowMs) ||
    (currentType === CurrentType.AC && numberOfPhases <= 0)
  ) {
    const safeV = nominalV > 0 && Number.isFinite(nominalV) ? nominalV : 0
    return buildZeroSample(
      session.socPercent,
      safeV,
      Math.max(0, connectorStatus.transactionEnergyActiveImportRegisterValue ?? 0)
    )
  }

  const elapsedMs = Math.max(0, options.nowMs - session.sessionStartMs)
  // Non-positive or non-finite rampUpDurationMs would either divide by zero
  // (NaN) or produce rampFactor > 1 / negative. Treat any invalid value as
  // "no ramp" (immediate full-power), matching the existing semantic where
  // rampUpDurationMs = 0 means immediate full-power.
  // Sub-millisecond values (e.g. Number.EPSILON) pass the guard but yield
  // elapsedMs / rampUpDurationMs >> 1 for any real elapsed time, so
  // Math.min(1, …) = 1 — semantically equivalent to rampUpDurationMs = 0.
  const rampFactor =
    session.rampUpDurationMs > 0 && Number.isFinite(session.rampUpDurationMs)
      ? Math.min(1, elapsedMs / session.rampUpDurationMs)
      : 1

  // Voltage: nominal ± small seed-derived noise. The voltage PRNG lives on
  // module-scope runtime state (not on the serializable session) so its
  // stream advances across samples; constructing a new PRNG per sample
  // would restart from the same seed each draw and produce a stalled
  // (non-advancing) sequence.
  let sampledV = nominalV
  if (options.voltageNoise !== false) {
    const runtime = getSessionRuntime(session)
    runtime.voltagePrng ??= createStreamPrng(options.rootSeed, transactionId, 'VOLTAGE_NOISE')
    sampledV = fluctuate(
      nominalV,
      Constants.DEFAULT_COHERENT_VOLTAGE_NOISE_PERCENT,
      runtime.voltagePrng
    )
  }
  const roundedV = roundTo(sampledV, ROUNDING_SCALE)

  // EV acceptance from the curve at running SoC.
  const acceptanceFraction = interpolateChargingCurve(
    session.profile.chargingCurve,
    session.socPercent
  )
  const evAcceptanceW = acceptanceFraction * session.profile.maxPowerW

  // EVSE cap (already includes hardware/charging-profile clamps via ChargingStation).
  const evseLimitW = context.getConnectorMaximumAvailablePower(session.connectorId)

  const socCap = session.socPercent >= 100 ? 0 : 1
  const targetPowerW = rampFactor * Math.min(evseLimitW, evAcceptanceW) * socCap
  let powerW = Math.max(0, targetPowerW)

  // Clamp powerW to whatever the remaining battery capacity accepts over
  // this interval so a sample that crosses 100 % SoC cannot over-charge the
  // register. INV-3 is preserved because ΔE is computed from the clamped
  // power below.
  const remainingWh = Math.max(
    0,
    ((100 - session.socPercent) / 100) * session.profile.batteryCapacityWh
  )
  const maxPowerFromCapacityW = (remainingWh * Constants.MS_PER_HOUR) / options.intervalMs
  powerW = Math.min(powerW, maxPowerFromCapacityW)

  // Physics: derive per-phase current as an exact fraction so
  //   V_round · currentAExact · phases = powerW
  // holds identically. `numberOfPhases` is 1 for DC (line above) so a
  // single branch covers both currents. Using integer-rounded amps here
  // would inflate V·I·phases above the capacity-clamped powerW by up to
  // V·phases·0.5 W, breaking INV-1.
  const divisor = roundedV * numberOfPhases
  const currentAExact = divisor > 0 ? powerW / divisor : 0

  // Emission: round current to `ROUNDING_SCALE`, then derive emitted power
  // from the rounded current so INV-1 (P = V·I·phases) holds within
  // `ROUNDING_SCALE` half-width (≤ 0.005 W) regardless of V or phases.
  const roundedCurrent = roundTo(currentAExact, ROUNDING_SCALE)
  const roundedPower = roundTo(roundedV * roundedCurrent * numberOfPhases, ROUNDING_SCALE)

  // Energy accounting uses the clamped (pre-rounding) `powerW` so INV-3
  // holds within floating-point ε and the capacity budget is respected
  // exactly. `Math.max(0, ...)` on `preRegisterWh` mirrors the clamp
  // applied by `advanceEnergyRegister` so the reported `energyRegisterWh`
  // and the post-advance persisted state agree even if the persisted
  // register is corrupted to a negative value.
  const deltaEnergyWh = (powerW * options.intervalMs) / Constants.MS_PER_HOUR
  const preRegisterWh = Math.max(0, connectorStatus.transactionEnergyActiveImportRegisterValue ?? 0)
  const projectedRegisterWh = preRegisterWh + deltaEnergyWh

  // INV-2: SoC(t+1) ≥ SoC(t); ΔSoC = ΔE / batteryCapacityWh × 100. Saturates at 100 %.
  const deltaSocPercent = (deltaEnergyWh / session.profile.batteryCapacityWh) * 100
  session.socPercent = Math.min(100, session.socPercent + deltaSocPercent)

  return {
    currentA: roundedCurrent,
    deltaEnergyWh,
    energyRegisterWh: projectedRegisterWh,
    powerW: roundedPower,
    socPercent: roundTo(session.socPercent, ROUNDING_SCALE),
    voltageV: roundedV,
  }
}
