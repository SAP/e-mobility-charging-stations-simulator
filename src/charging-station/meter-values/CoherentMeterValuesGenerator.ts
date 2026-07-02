// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

/**
 * @file Physics-based coherent MeterValues generator.
 * @description Constructs a coherent {@link MeterValue} in which every
 *   emitted measurand is derived from a single physics chain
 *   (V → P → I → ΔE → SoC) rather than sampled independently.
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
 * The generator owns the connector energy register update: it advances the
 * register exactly once per sample, unconditionally, so `meterStop` is
 * correct even when `Energy.Active.Import.Register` is not in the
 * configured MeterValues.
 *
 * TODO(#1936): file size exceeds the 250 LOC ceiling documented in
 * AGENTS.md. Modular split (CoherentSampleComputer.ts + CoherentMeterValueBuilder.ts,
 * keeping session lifecycle helpers in this entry) tracked as follow-up.
 */

import type {
  ConnectorStatus,
  MeterValue,
  MeterValueContext,
  SampledValue,
  SampledValueTemplate,
} from '../../types/index.js'
import type { CoherentSession, EvProfile, ICoherentContext } from './types.js'

import {
  CurrentType,
  MeterValueMeasurand,
  MeterValuePhase,
  MeterValueUnit,
  Voltage,
} from '../../types/index.js'
import { Constants, logger, roundTo } from '../../utils/index.js'
import { interpolateChargingCurve, selectEvProfile } from './EvProfiles.js'
import { deriveSeed, hashLabel, mulberry32 } from './Prng.js'

const moduleName = 'CoherentMeterValuesGenerator'

/**
 * Decimal places for all physics-quantity rounding (V, A, W, Wh, SoC).
 * The `roundTo` half-width bound is `0.5 × 10^-ROUNDING_SCALE = 0.005` on
 * each rounded quantity; INV-1 residual is bounded by this scalar.
 */
const ROUNDING_SCALE = 2

/**
 * Signature of the versioned SampledValue builder returned by the
 * OCPP-version dispatcher in {@link ../ocpp/OCPPServiceUtils.buildMeterValue}.
 * Kept structurally compatible so a coherent generator can emit SampledValues
 * in either OCPP 1.6 or 2.0 formats without knowing the version.
 */
export type BuildVersionedSampledValue = (
  sampledValueTemplate: SampledValueTemplate,
  value: number,
  context?: MeterValueContext,
  phase?: MeterValuePhase
) => SampledValue

/**
 * Runtime-only per-session state. Kept in a module-scope WeakMap keyed by
 * the {@link CoherentSession} object (rather than by transactionId) so
 * runtime state is scoped to the session's identity — no cross-station
 * coupling when two stations happen to share a transactionId — and is
 * auto-collected when the session becomes unreachable.
 */
interface SessionRuntime {
  voltagePrng?: () => number
}

const sessionRuntimes = new WeakMap<CoherentSession, SessionRuntime>()

/**
 * Retrieves the runtime bag for a session, creating it on first access.
 * Not exported: only the generator reads or writes runtime state.
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
 * The WeakMap makes eager disposal optional — unreachable sessions are
 * collected automatically — but eager disposal preserves determinism
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
 * Deterministic per-transaction stream splitter. Combines the station
 * `randomSeed` (or a stable fallback), the transactionId, and a label so
 * that adding a new consumer never shifts an existing stream's sequence.
 * @param rootSeed - Root 32-bit seed for the station.
 * @param transactionId - Transaction identifier.
 * @param label - Stream label (`'VOLTAGE_NOISE'`, `'POWER_NOISE'`, ...).
 * @returns PRNG function producing [0, 1) floats.
 */
export const createStreamPrng = (
  rootSeed: number,
  transactionId: number | string,
  label: string
): (() => number) => {
  // Namespace the transactionId leg with a `tx:` prefix so
  // `String(transactionId) === label` cannot trigger the XOR self-inverse
  // `deriveSeed(deriveSeed(r, X), X) === r`. Labels never start with `tx:`
  // by construction (`VOLTAGE_NOISE`, `POWER_NOISE`, ...).
  const txSeed = deriveSeed(rootSeed, `tx:${String(transactionId)}`)
  return mulberry32(deriveSeed(txSeed, label))
}

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
 * Determines whether coherent mode is enabled on the given context and a
 * session exists for the transaction. Returned by the strategy gate to
 * decide dispatch.
 * @param context - Charging-station context (subset of `ChargingStation`).
 * @param transactionId - Transaction identifier.
 * @returns `true` if coherent mode should own MeterValue construction.
 */
export const isCoherentModeActive = (
  context: ICoherentContext,
  transactionId: number | string
): boolean => {
  if (context.stationInfo?.coherentMeterValues !== true) {
    return false
  }
  return context.getCoherentSession(transactionId) != null
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
  // - intervalMs ≤ 0: `maxPowerFromCapacityW = remainingWh · MS_PER_HOUR / intervalMs`
  //   yields NaN when remainingWh = 0 (SoC saturated, 0/0), which would
  //   permanently poison session.socPercent.
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

/**
 * Phase family classifier lookup for coherent emission. `satisfies Record<...>`
 * gates compile-time exhaustiveness so a new `MeterValuePhase` value fails
 * compile until classified. `Aggregate` is applied when `phase` is `undefined`
 * (the sentinel handled by `phaseFamily` outside the table).
 * - `LineToNeutral`: bare `L1`/`L2`/`L3` and `L1-N`/`L2-N`/`L3-N`
 *   (line-current or phase-voltage measurements).
 * - `LineToLine`: `L1-L2`/`L2-L3`/`L3-L1` (line-to-line voltage; not
 *   defined for current or power in the coherent model).
 * - `Neutral`: `N` (physically 0 for balanced 3-phase Y).
 */
const PHASE_FAMILY = {
  [MeterValuePhase.L1]: 'LineToNeutral',
  [MeterValuePhase.L1_L2]: 'LineToLine',
  [MeterValuePhase.L1_N]: 'LineToNeutral',
  [MeterValuePhase.L2]: 'LineToNeutral',
  [MeterValuePhase.L2_L3]: 'LineToLine',
  [MeterValuePhase.L2_N]: 'LineToNeutral',
  [MeterValuePhase.L3]: 'LineToNeutral',
  [MeterValuePhase.L3_L1]: 'LineToLine',
  [MeterValuePhase.L3_N]: 'LineToNeutral',
  [MeterValuePhase.N]: 'Neutral',
} as const satisfies Record<MeterValuePhase, 'LineToLine' | 'LineToNeutral' | 'Neutral'>

const phaseFamily = (
  phase: MeterValuePhase | undefined
): 'Aggregate' | 'LineToLine' | 'LineToNeutral' | 'Neutral' =>
  phase == null ? 'Aggregate' : PHASE_FAMILY[phase]

/**
 * Emit order across measurands, mirroring the legacy `getSampledValueTemplate`
 * path (SoC → Voltage → Power → Current → Energy). Preserved so downstream
 * consumers relying on OCPP MeterValue ordering keep working.
 */
const MEASURAND_EMIT_ORDER = [
  MeterValueMeasurand.STATE_OF_CHARGE,
  MeterValueMeasurand.VOLTAGE,
  MeterValueMeasurand.POWER_ACTIVE_IMPORT,
  MeterValueMeasurand.CURRENT_IMPORT,
  MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
] as const

/**
 * Within-measurand phase order for deterministic per-phase emission:
 * no-phase → L1/L1-N → L2/L2-N → L3/L3-N → L1-L2 → L2-L3 → L3-L1 → N.
 * Lower rank emits first. `satisfies Record<...>` gates exhaustiveness
 * so a new `MeterValuePhase` value fails compile until ranked.
 */
const PHASE_RANK = {
  [MeterValuePhase.L1]: 1,
  [MeterValuePhase.L1_L2]: 4,
  [MeterValuePhase.L1_N]: 1,
  [MeterValuePhase.L2]: 2,
  [MeterValuePhase.L2_L3]: 5,
  [MeterValuePhase.L2_N]: 2,
  [MeterValuePhase.L3]: 3,
  [MeterValuePhase.L3_L1]: 6,
  [MeterValuePhase.L3_N]: 3,
  [MeterValuePhase.N]: 7,
} as const satisfies Record<MeterValuePhase, number>

/**
 * Groups templates by measurand and sorts each bucket by phase rank.
 * Templates without an explicit `measurand` default to
 * `Energy.Active.Import.Register`, mirroring legacy convention.
 * @param templates - Templates configured on the connector (or `undefined`).
 * @returns Grouped, phase-ordered templates.
 */
const groupTemplatesByMeasurand = (
  templates: SampledValueTemplate[] | undefined
): Map<MeterValueMeasurand, SampledValueTemplate[]> => {
  const groups = Map.groupBy(
    templates ?? [],
    t => t.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
  )
  for (const bucket of groups.values()) {
    bucket.sort(
      (a, b) =>
        (a.phase == null ? 0 : PHASE_RANK[a.phase]) - (b.phase == null ? 0 : PHASE_RANK[b.phase])
    )
  }
  return groups
}

/**
 * Resolves the exact physical value to emit for a template given the
 * coherent sample. Returns `undefined` for unsupported `(measurand, phase)`
 * pairs so the caller can log-and-skip. Rounding is deferred to the emit
 * site so unit-conversion divisions round once.
 *
 * Per-phase resolution (balanced 3-phase Y assumption):
 * - Voltage: L-N ⇒ `sample.voltageV`; L-L ⇒ `√phases × sample.voltageV`
 *   (`√phases` collapses to 1 on single-phase, in which case L-L has no
 *   physical meaning and the template is skipped); N ⇒ 0.
 * - Power.Active.Import: aggregate ⇒ total P; L-N ⇒ `P / phases`;
 *   L-L undefined; N undefined (neutral carries no active power in
 *   balanced 3-φ Y).
 * - Current.Import: any line phase ⇒ `sample.currentA` (line current);
 *   L-L undefined; N ⇒ 0 (balanced 3-φ Y neutral current is zero).
 * - SoC: aggregate scalar; phase-qualified templates rejected.
 * - Energy.Active.Import.Register: aggregate ⇒ total register; L-N ⇒
 *   `register / phases` (per-phase energy contribution under balanced
 *   3-φ Y; Σ across all L-N templates equals the aggregate register
 *   within emit-unit rounding granularity — Wh: ≤ phases · 0.005 Wh;
 *   kWh: ≤ phases · 5 Wh); L-L undefined; N undefined. OCPP 2.0.1
 *   `SampledDataCtrlr.RegisterValuesWithoutPhases` is not consulted;
 *   per-phase emission is driven by the connector template's phase
 *   qualifier.
 * @param measurand - Target measurand.
 * @param phase - Template `phase` field (may be `undefined`).
 * @param sample - Coherent sample (source of aggregate values).
 * @param numberOfPhases - Session phase count.
 * @param connectorStatus - Connector status (for the energy register).
 * @returns Value to emit, or `undefined` if the combination is unsupported.
 */
const resolvePhasedValue = (
  measurand: MeterValueMeasurand,
  phase: MeterValuePhase | undefined,
  sample: CoherentSample,
  numberOfPhases: number,
  connectorStatus: ConnectorStatus
): number | undefined => {
  const family = phaseFamily(phase)
  switch (measurand) {
    case MeterValueMeasurand.CURRENT_IMPORT:
      if (family === 'LineToLine') return undefined
      if (family === 'Neutral') return 0
      return sample.currentA
    case MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER: {
      if (family === 'LineToLine' || family === 'Neutral') return undefined
      const register = Math.max(0, connectorStatus.energyActiveImportRegisterValue ?? 0)
      if (family === 'LineToNeutral') {
        if (numberOfPhases <= 0) return undefined
        return register / numberOfPhases
      }
      return register
    }
    case MeterValueMeasurand.POWER_ACTIVE_IMPORT:
      if (family === 'LineToLine' || family === 'Neutral') return undefined
      if (family === 'LineToNeutral') {
        if (numberOfPhases <= 0) return undefined
        return sample.powerW / numberOfPhases
      }
      return sample.powerW
    case MeterValueMeasurand.STATE_OF_CHARGE:
      if (family !== 'Aggregate') return undefined
      return sample.socPercent
    case MeterValueMeasurand.VOLTAGE:
      if (family === 'Neutral') return 0
      if (family === 'LineToLine') {
        if (numberOfPhases <= 1) return undefined
        return Math.sqrt(numberOfPhases) * sample.voltageV
      }
      return sample.voltageV
    default:
      return undefined
  }
}

/**
 * Measurand → matching kilo-prefixed unit lookup. Populated only for the
 * measurands whose `SampledValueTemplate.unit` may legitimately carry a
 * kilo-scaled value (kW / kWh). Any other `(measurand, unit)` pair
 * emits at unit scale (divider = 1).
 */
const KILO_UNIT_BY_MEASURAND: ReadonlyMap<MeterValueMeasurand, MeterValueUnit> = new Map<
  MeterValueMeasurand,
  MeterValueUnit
>([
  [MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER, MeterValueUnit.KILO_WATT_HOUR],
  [MeterValueMeasurand.POWER_ACTIVE_IMPORT, MeterValueUnit.KILO_WATT],
])

/**
 * Returns the unit divider for a `(measurand, unit)` pair: the kilo divider
 * when the template's unit is the kilo-prefixed variant of the measurand's
 * base unit (kW for Power, kWh for Energy register), otherwise 1.
 * @param measurand - Target measurand.
 * @param unit - Template unit (may be `undefined`).
 * @returns `Constants.UNIT_DIVIDER_KILO` or `1`.
 */
const resolveUnitDivider = (
  measurand: MeterValueMeasurand,
  unit: MeterValueUnit | undefined
): number =>
  unit != null && KILO_UNIT_BY_MEASURAND.get(measurand) === unit ? Constants.UNIT_DIVIDER_KILO : 1

/**
 * Returns the SampledValueTemplate array configured on the given connector.
 *
 * Reads the connector-level `MeterValues` templates only. Unlike
 * {@link ../ocpp/OCPPServiceUtils.getSampledValueTemplate}, this does NOT
 * fall back to EVSE-level `MeterValues` templates: the {@link ICoherentContext}
 * surface exposes `getConnectorStatus` but not `getEvseStatus`. Adding
 * EVSE-level template inheritance to the coherent path requires extending
 * the context interface and is tracked as a follow-up in issue #1936.
 * @param context - Charging-station context.
 * @param connectorId - Connector identifier.
 * @returns Templates or `undefined`.
 */
const resolveTemplates = (
  context: ICoherentContext,
  connectorId: number
): SampledValueTemplate[] | undefined => {
  return context.getConnectorStatus(connectorId)?.MeterValues
}

/**
 * Builds a complete OCPP {@link MeterValue} from a coherent sample.
 *
 * Emission order:
 * - Across measurands: legacy `SoC → Voltage → Power → Current → Energy`.
 * - Within a measurand with multiple phase-qualified templates: no-phase
 *   first, then `L1/L1-N → L2/L2-N → L3/L3-N → L1-L2 → L2-L3 → L3-L1 → N`.
 *
 * Per-phase resolution — see {@link resolvePhasedValue}. Unsupported
 * `(measurand, phase)` combinations are logged and skipped.
 *
 * Only measurands enabled by the caller-resolved allow-list are emitted.
 * The energy register is advanced unconditionally by
 * {@link advanceEnergyRegister} independent of whether the Energy
 * measurand is emitted.
 * @param context - Charging-station context.
 * @param transactionId - Active transaction identifier.
 * @param buildVersionedSampledValue - Versioned SampledValue builder from
 *   the OCPP dispatcher in `OCPPServiceUtils.buildMeterValue`.
 * @param options - Per-sample parameters (interval, seed material, timestamp).
 * @param mvContext - Optional MeterValue reading context.
 * @param enabledMeasurands - Optional allow-list resolved from the
 *   version-appropriate OCPP variable at the `buildMeterValue` boundary.
 *   When `undefined`, all templates emit (legacy behavior). When defined,
 *   only measurands in the set emit. Governs OCPP 2.0.1 J02.FR.11 /
 *   E02.FR.09 / E06.FR.11 and OCPP 1.6 `MeterValuesSampledData`.
 * @returns MeterValue with sampled values and current timestamp.
 */
export const buildCoherentMeterValue = (
  context: ICoherentContext,
  transactionId: number | string,
  buildVersionedSampledValue: BuildVersionedSampledValue,
  options: ComputeSampleOptions,
  mvContext?: MeterValueContext,
  enabledMeasurands?: ReadonlySet<MeterValueMeasurand>
): MeterValue => {
  const session = context.getCoherentSession(transactionId)
  const connectorStatus =
    session != null ? context.getConnectorStatus(session.connectorId) : undefined
  if (session == null || connectorStatus == null) {
    logger.warn(
      `${context.logPrefix()} ${moduleName}.buildCoherentMeterValue: missing session or connector for transaction ${String(transactionId)}`
    )
    return { sampledValue: [], timestamp: new Date() }
  }

  const sample = computeCoherentSample(context, connectorStatus, session, options)
  // Own the register update: happens once per sample, unconditionally, so
  // meterStop is correct even when Energy.Active.Import.Register is not in
  // the configured MeterValues.
  advanceEnergyRegister(connectorStatus, sample.deltaEnergyWh)

  const templates = resolveTemplates(context, session.connectorId)
  const groups = groupTemplatesByMeasurand(templates)
  const sampledValue: SampledValue[] = []
  const isEnabled = (measurand: MeterValueMeasurand): boolean =>
    enabledMeasurands == null || enabledMeasurands.has(measurand)
  const numberOfPhases = session.numberOfPhases

  for (const measurand of MEASURAND_EMIT_ORDER) {
    if (!isEnabled(measurand)) continue
    const bucket = groups.get(measurand)
    if (bucket == null) continue
    for (const template of bucket) {
      const raw = resolvePhasedValue(
        measurand,
        template.phase,
        sample,
        numberOfPhases,
        connectorStatus
      )
      if (raw == null) {
        logger.warn(
          `${context.logPrefix()} ${moduleName}.buildCoherentMeterValue: unsupported (${measurand}, phase=${String(template.phase)}) — template skipped`
        )
        continue
      }
      // Narrow the OCPP 2.0 `SampledValueTemplate.unit` open-string branch
      // to the closed `MeterValueUnit` union for the Map lookup below; any
      // string outside the enum returns `undefined` from the Map and falls
      // through to divider = 1 (unit-scale emission).
      const unitDivider = resolveUnitDivider(measurand, template.unit as MeterValueUnit | undefined)
      const scaled = roundTo(raw / unitDivider, ROUNDING_SCALE)
      sampledValue.push(buildVersionedSampledValue(template, scaled, mvContext))
    }
  }

  // MeterValue = OCPP16MeterValue | OCPP20MeterValue is a discriminated
  // union that diverges on the SampledValue.context enum. Coherent path
  // produces version-appropriate SampledValues via the injected
  // buildVersionedSampledValue callback, but the compile-time union of
  // SampledValue[] cannot be narrowed here — a boundary cast is required.
  return { sampledValue, timestamp: new Date() } as MeterValue
}

/**
 * Options for {@link createCoherentSession}.
 */
export interface CreateSessionOptions {
  /** Target connector id. */
  connectorId: number
  /** Session start timestamp in milliseconds. Defaults to `Date.now()`. */
  now?: number
  /** Non-empty EV profile pool; one profile is picked via seeded weighted random selection. */
  profiles: EvProfile[]
  /**
   * Optional ramp-up duration in milliseconds. Defaults to
   * `Constants.DEFAULT_COHERENT_RAMP_UP_DURATION_MS`.
   */
  rampUpDurationMs?: number
  /** Root 32-bit seed for stream splitting. */
  rootSeed: number
  /** Transaction identifier. */
  transactionId: number | string
}

/**
 * Builds a {@link CoherentSession} deterministically from the profile pool
 * and per-transaction seed material. Weight-based profile selection uses a
 * dedicated `'PROFILE_PICK'` stream and initial SoC uses `'INITIAL_SOC'`,
 * so adding one consumer does not shift any other stream's sequence
 * (stream-splitting via FNV-1a label hashing — see `deriveSeed` in `Prng.ts`).
 *
 * The nominal AC voltage is treated as phase voltage (line-to-neutral) per
 * {@link ../../utils/ElectricUtils.ACElectricUtils}. If the station is AC
 * and `voltageOut` is 400 V or 800 V, a warning is logged since those
 * values are line-to-line in most catalogs and the utilities would compute
 * physically implausible power.
 * @param context - Charging-station context.
 * @param options - Session parameters.
 * @returns Fully initialized session, or `undefined` when profiles is empty.
 */
export const createCoherentSession = (
  context: ICoherentContext,
  options: CreateSessionOptions
): CoherentSession | undefined => {
  if (options.profiles.length === 0) {
    return undefined
  }
  const now = options.now ?? Date.now()
  const profilePickPrng = createStreamPrng(options.rootSeed, options.transactionId, 'PROFILE_PICK')
  const socPrng = createStreamPrng(options.rootSeed, options.transactionId, 'INITIAL_SOC')
  const profile = selectEvProfile(options.profiles, profilePickPrng())
  const socRange = Math.max(0, profile.initialSocPercentMax - profile.initialSocPercentMin)
  const initialSoc = profile.initialSocPercentMin + socPrng() * socRange

  const currentType = context.stationInfo?.currentOutType ?? CurrentType.AC
  const voltageOutNominal = context.getVoltageOut()
  if (
    currentType === CurrentType.AC &&
    (voltageOutNominal === Voltage.VOLTAGE_400 || voltageOutNominal === Voltage.VOLTAGE_800)
  ) {
    logger.warn(
      `${context.logPrefix()} ${moduleName}.createCoherentSession: AC voltageOut=${voltageOutNominal.toString()}V is treated as line-to-neutral (phase voltage) by ACElectricUtils. If this value is meant as line-to-line, coherent power/current will be physically implausible.`
    )
  }

  return {
    connectorId: options.connectorId,
    currentType,
    numberOfPhases: currentType === CurrentType.AC ? context.getNumberOfPhases() : 1,
    profile,
    rampUpDurationMs: options.rampUpDurationMs ?? Constants.DEFAULT_COHERENT_RAMP_UP_DURATION_MS,
    sessionStartMs: now,
    socPercent: initialSoc,
    transactionId: options.transactionId,
    voltageOutNominal,
  }
}

/**
 * Resolves the root PRNG seed for a station. Prefers the template
 * `randomSeed` and falls back to a FNV-1a hash of `hashId`, ensuring
 * determinism across stations without accidentally sharing streams.
 * @param stationInfo - Station info (`randomSeed` and `hashId`).
 * @returns 32-bit unsigned root seed.
 */
export const resolveRootSeed = (
  stationInfo: undefined | { hashId?: string; randomSeed?: number }
): number => {
  if (stationInfo?.randomSeed != null && Number.isFinite(stationInfo.randomSeed)) {
    return stationInfo.randomSeed >>> 0
  }
  return hashLabel(stationInfo?.hashId ?? '')
}
