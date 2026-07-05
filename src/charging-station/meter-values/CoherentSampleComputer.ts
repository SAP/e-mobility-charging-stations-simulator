// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

/**
 * @file Physics computation for coherent MeterValues.
 * @description Owns the physics chain V → P → I → ΔE → SoC that produces a
 *   single {@link CoherentSample} per emission tick, the per-session
 *   runtime WeakMap that caches the voltage-noise PRNG across samples,
 *   and the `disposeCoherentSessionRuntime` teardown hook consumed by
 *   {@link ../CoherentMeterValuesManager}.
 *
 * Invariants (enforced by construction):
 * - **INV-1**: AC: `P = V × I × phases × powerFactor`; DC: `P = V × I × powerFactor`.
 *   `powerFactor` (cos φ) defaults to `1` (unity) so pre-M-09 profiles are
 *   unchanged. Emitted `powerW` is recomputed from the rounded emitted
 *   current, voltage, and `powerFactor` so `|P - V·I·phases·powerFactor|`
 *   stays within the `ROUNDING_SCALE` half-width (≤ 0.005 W scalar bound)
 *   regardless of V, phases, or `powerFactor`. Per-phase L-N
 *   `Power.Active.Import` emission is derived as
 *   `round(aggregate_P / phases, 2)`; the per-phase identity
 *   `|P_LxN - V_LxN · I_Lx · powerFactor|` therefore holds within
 *   `2 × ROUNDING_SCALE` half-width (≤ 0.01 W) - one half-width for the
 *   aggregate emit and one for the per-phase division.
 * - **INV-2**: `SoC(t+1) ≥ SoC(t)` and `ΔSoC = ΔE / batteryCapacityWh × 100`.
 *   SoC monotone non-decreasing during charging and saturates at 100 %.
 * - **INV-3**: `ΔE = P_clamped × Δt / MS_PER_HOUR` where `P_clamped` is the
 *   pre-emit-rounding capacity-clamped power. `E(t+1) ≥ E(t)`. A consumer
 *   integrating the post-rounding emitted `powerW` samples may diverge
 *   from the register by at most `ROUNDING_SCALE half-width × N × Δt /
 *   MS_PER_HOUR` Wh over `N` samples - bounded and invisible at
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
import { interpolateChargingCurve } from './EvProfiles.js'
import { createStreamPrng } from './PRNG.js'

/**
 * Runtime-only per-session state. Kept in a module-scope WeakMap keyed by
 * the {@link CoherentSession} object (rather than by transactionId) so
 * runtime state is scoped to the session's identity - no cross-station
 * coupling when two stations happen to share a transactionId - and is
 * auto-collected when the session becomes unreachable.
 */
interface SessionRuntime {
  voltagePrng?: () => number
}

const sessionRuntimes = new WeakMap<CoherentSession, SessionRuntime>()

/**
 * Retrieves the runtime bag for a session, creating it on first access.
 * Consumed by {@link computeCoherentSample} to cache the voltage-noise
 * PRNG across samples so the stream advances rather than restarting
 * from the same seed each draw.
 * @param session - Coherent session.
 * @returns Live runtime bag (mutated in place).
 */
const getSessionRuntime = (session: CoherentSession): SessionRuntime => {
  let runtime = sessionRuntimes.get(session)
  if (runtime == null) {
    runtime = {}
    sessionRuntimes.set(session, runtime)
  }
  return runtime
}

/**
 * Disposes runtime state for a session. Call from every session-teardown
 * path (stop/reset/disconnect) to release cached PRNG state eagerly.
 * The WeakMap makes eager disposal optional - unreachable sessions are
 * collected automatically - but eager disposal preserves determinism
 * across sequential transactions that reuse the same session identity.
 * Idempotent.
 * @param session - Coherent session (or `undefined` when the caller has
 *   no session at hand).
 * @returns `true` when runtime was removed, `false` otherwise.
 */
export const disposeCoherentSessionRuntime = (session: CoherentSession | undefined): boolean => {
  if (session == null) {
    return false
  }
  return sessionRuntimes.delete(session)
}

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
  /**
   * Transaction-scoped projected register value AFTER the delta from
   * {@link advanceEnergyRegister} is applied by the caller: derived from
   * `connectorStatus.transactionEnergyActiveImportRegisterValue +
   * deltaEnergyWh` at compute time. Exists to expose the transaction-scoped
   * projection to tests and other in-process introspection paths.
   *
   * NOT the value emitted for the `Energy.Active.Import.Register` measurand:
   * that measurand reads `connectorStatus.energyActiveImportRegisterValue`
   * (station-scoped, monotone-cumulative across the station's lifetime),
   * which diverges from this field whenever the station has non-zero
   * pre-transaction register history. Converges only when the transaction
   * begins on a station whose register was previously zero.
   */
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
   * Sample timestamp in milliseconds; callers pass `Date.now()` in
   * production and a test-controlled clock in unit tests. Combined with
   * `session.sessionStartMs` for ramp-up progress. Non-finite triggers
   * the zero-sample defensive branch.
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
 * Steepness constant of the logistic used by {@link sigmoidRamp}. `k=10`
 * yields `raw(0) ≈ 6.69e-3` and `raw(1) ≈ 0.993`, so the boundary values
 * are within `1e-2` of the ideal `{0, 1}`; the endpoint normalization
 * below then pins `f(0) = 0` and `f(1) = 1` exactly.
 */
const SIGMOID_STEEPNESS = 10

const SIGMOID_RAW_AT_0 = 1 / (1 + Math.exp(SIGMOID_STEEPNESS * 0.5))
const SIGMOID_RAW_AT_1 = 1 / (1 + Math.exp(-SIGMOID_STEEPNESS * 0.5))
const SIGMOID_RANGE = SIGMOID_RAW_AT_1 - SIGMOID_RAW_AT_0

/**
 * S-shaped ramp fraction over normalized progress `p ∈ [0, 1]`. Uses a
 * shifted-and-scaled logistic:
 *
 * ```
 * raw(p) = 1 / (1 + exp(-k · (p - 0.5)))
 * f(p)   = (raw(p) - raw(0)) / (raw(1) - raw(0))
 * ```
 *
 * so `f(0) = 0` and `f(1) = 1` exactly. Progress outside `[0, 1]` is
 * clamped so the ramp saturates like the linear branch.
 * @param progress - Normalized progress `elapsedMs / rampUpDurationMs`.
 * @returns Ramp fraction in `[0, 1]`.
 */
const sigmoidRamp = (progress: number): number => {
  if (progress <= 0) {
    return 0
  }
  if (progress >= 1) {
    return 1
  }
  const raw = 1 / (1 + Math.exp(-SIGMOID_STEEPNESS * (progress - 0.5)))
  return (raw - SIGMOID_RAW_AT_0) / SIGMOID_RANGE
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
 * 1. `rampFactor = min(1, elapsed / rampUp)` for `rampShape='linear'` (default)
 *    or the {@link sigmoidRamp} S-curve for `rampShape='sigmoid'` -
 *    immutable session start.
 * 2. `V` - nominal ± small seed-derived noise.
 * 3. `evAcceptanceW = curve(SoC) × profile.maxPowerW`.
 * 4. `powerW = rampFactor × min(EVSE_max, evAcceptance) × socCap`.
 *    EVSE cap already folds in charging profiles via
 *    {@link ICoherentContext.getConnectorMaximumAvailablePower}.
 * 5. `powerW` is then clamped to remaining battery capacity so a sample
 *    crossing 100 % SoC never over-charges the register.
 * 6. `currentAExact = powerW / (V_round · phases · powerFactor)` - exact
 *    fraction (phases=1 for DC; `powerFactor` defaults to 1). Emitted
 *    current is rounded to `ROUNDING_SCALE`.
 * 7. Emitted `powerW = round(V_round × currentA_round × phases × powerFactor)`;
 *    INV-1 holds within `ROUNDING_SCALE` half-width (≤ 0.005 W).
 * 8. `ΔE = P_clamped × Δt / MS_PER_HOUR` - uses the pre-emit-rounding
 *    `powerW` (active) so the register integrates the capacity-clamped
 *    active power exactly (INV-3), independent of `powerFactor`.
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
  //   but a template override may set `voltageOut` to 0.
  // - nowMs non-finite: pushes elapsedMs to NaN and destabilizes rampFactor.
  // - AC with numberOfPhases ≤ 0: divisor collapses to 0 (`V · 0 = 0`),
  //   currentA is guarded to zero, and P = 0 silently - a misconfigured
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
  // Math.min(1, ...) = 1 - semantically equivalent to rampUpDurationMs = 0.
  // Ramp shape defaults to `'linear'` (fraction rises linearly with elapsed
  // time). `'sigmoid'` selects the {@link sigmoidRamp} S-curve which better
  // matches CCS/CHAdeMO handshake and pre-charge behavior; both shapes saturate
  // at 1 for progress ≥ 1 so downstream physics is unchanged past ramp-up.
  let rampFactor: number
  if (session.rampUpDurationMs > 0 && Number.isFinite(session.rampUpDurationMs)) {
    const rampProgress = elapsedMs / session.rampUpDurationMs
    rampFactor =
      session.profile.rampShape === 'sigmoid'
        ? sigmoidRamp(rampProgress)
        : Math.min(1, rampProgress)
  } else {
    rampFactor = 1
  }

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

  // EV acceptance from the profile's charging curve at the SoC of THIS
  // sample (session.socPercent is advanced at the end of the previous
  // computeCoherentSample tick - see the `session.socPercent = ...`
  // assignment below), not the session's initial SoC - the taper must
  // track live state so P falls off as the battery fills.
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
  //   V_round · currentAExact · phases · powerFactor = powerW
  // holds identically. `numberOfPhases` is 1 for DC (line above) so a
  // single branch covers both currents. `powerFactor` (cos φ) defaults to
  // 1 (unity) so existing profiles are unchanged; when `< 1` the divisor
  // shrinks and `I` rises inversely proportional to `powerFactor` for a
  // given `powerW` (active). Using integer-rounded amps here would inflate
  // V·I·phases above the capacity-clamped powerW by up to V·phases·0.5 W,
  // breaking INV-1.
  const powerFactor = session.profile.powerFactor ?? 1
  const divisor = roundedV * numberOfPhases * powerFactor
  const currentAExact = divisor > 0 ? powerW / divisor : 0

  // Emission: round current to `ROUNDING_SCALE`, then derive emitted
  // active power from `V · I · phases · powerFactor` so INV-1
  // (P_active = V·I·phases·powerFactor) holds within `ROUNDING_SCALE`
  // half-width (≤ 0.005 W) regardless of V, phases, or powerFactor. When
  // `powerFactor = 1` (default) this reduces to the original identity.
  const roundedCurrent = roundTo(currentAExact, ROUNDING_SCALE)
  const roundedPower = roundTo(
    roundedV * roundedCurrent * numberOfPhases * powerFactor,
    ROUNDING_SCALE
  )

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
