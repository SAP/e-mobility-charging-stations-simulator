// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

/**
 * @file Physics-based coherent MeterValue generator.
 * @description Constructs a coherent {@link MeterValue} in which every
 *   emitted measurand is derived from a single physics chain
 *   (V → P → I → ΔE → SoC) rather than sampled independently.
 *
 * Invariants (enforced by construction):
 * - **INV-1**: AC: `P = V × I × phases`; DC: `P = V × I`. Emitted power is
 *   recomputed from the rounded emitted current and voltage so V·I·phases
 *   equals the emitted P within `ROUNDING_SCALE` precision.
 * - **INV-2**: `SoC(t+1) ≥ SoC(t)` and `ΔSoC = ΔE / batteryCapacityWh × 100`.
 *   SoC monotone non-decreasing during charging and saturates at 100 %.
 * - **INV-3**: `ΔE = P × Δt / 3_600_000` and `E(t+1) ≥ E(t)`. Energy
 *   register is monotone non-decreasing and integrates the clamped power
 *   exactly over the sample interval.
 * - `P ≤ min(EVSE_max, EV_acceptance(SoC))`.
 * - `SoC ≥ 100 ⇒ P = 0, I = 0, ΔE = 0`.
 *
 * The generator owns the connector energy register update: it advances the
 * register exactly once per sample, unconditionally, so `meterStop` is
 * correct even when `Energy.Active.Import.Register` is not in the
 * configured MeterValues.
 */

import type {
  MeterValue,
  MeterValueContext,
  MeterValuePhase,
  SampledValue,
  SampledValueTemplate,
} from '../../types/index.js'
import type { ConnectorStatus } from '../../types/index.js'
import type { CoherentSession, EvProfile, ICoherentContext } from './types.js'

import { CurrentType, MeterValueMeasurand, MeterValueUnit, Voltage } from '../../types/index.js'
import { logger, roundTo } from '../../utils/index.js'
import { interpolateChargingCurve, selectEvProfile } from './EvProfiles.js'
import { deriveSeed, hashLabel, mulberry32 } from './Prng.js'

const moduleName = 'CoherentMeterValuesGenerator'

const MS_PER_HOUR = 3_600_000
const UNIT_DIVIDER_KILO = 1000
/** Decimal places used for all physics-quantity rounding (V, A, W, Wh, SoC). */
const ROUNDING_SCALE = 2
const DEFAULT_RAMP_UP_DURATION_MS = 5000
/** Symmetric ±% noise applied to nominal voltage, seed-derived. */
const VOLTAGE_NOISE_PERCENT = 0.01

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
  const txSeed = deriveSeed(rootSeed, String(transactionId))
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
  if ((connectorStatus.energyActiveImportRegisterValue ?? -1) < 0) {
    connectorStatus.energyActiveImportRegisterValue = 0
  }
  if ((connectorStatus.transactionEnergyActiveImportRegisterValue ?? -1) < 0) {
    connectorStatus.transactionEnergyActiveImportRegisterValue = 0
  }
  connectorStatus.energyActiveImportRegisterValue =
    (connectorStatus.energyActiveImportRegisterValue ?? 0) + deltaEnergyWh
  connectorStatus.transactionEnergyActiveImportRegisterValue =
    (connectorStatus.transactionEnergyActiveImportRegisterValue ?? 0) + deltaEnergyWh
}

/**
 * Coherent physics sample.
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
  intervalMs: number
  nowMs: number
  rootSeed: number
  /** For tests: enable/disable voltage noise. Defaults to `true` in production. */
  voltageNoise?: boolean
}

/**
 * Computes a single coherent sample and mutates the caller-owned
 * {@link ICoherentContext.getCoherentSession session} SoC. The energy
 * register is NOT advanced here; the caller is responsible for calling
 * {@link advanceEnergyRegister} once per emitted sample so the semantics
 * match the OCPP energy meter model.
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
 *    INV-1 holds within `ROUNDING_SCALE` (≤0.005 W) regardless of V or phases.
 * 8. `ΔE = powerW × Δt / 3.6e6` (exact, uses clamped powerW);
 *    `ΔSoC = ΔE / capacity × 100`.
 * @param context - Charging-station context.
 * @param connectorStatus - Connector status.
 * @param options - Per-sample parameters (interval, seed material, ...).
 * @returns The computed sample. `energyRegisterWh` reflects the value AFTER
 *   the caller applies {@link advanceEnergyRegister}, computed inline for
 *   emission convenience.
 */
export const computeCoherentSample = (
  context: ICoherentContext,
  connectorStatus: ConnectorStatus,
  options: ComputeSampleOptions
): CoherentSample => {
  const transactionId = connectorStatus.transactionId
  if (transactionId == null) {
    // Defensive: should never happen — caller guarantees a live transaction.
    return {
      currentA: 0,
      deltaEnergyWh: 0,
      energyRegisterWh: connectorStatus.transactionEnergyActiveImportRegisterValue ?? 0,
      powerW: 0,
      socPercent: 0,
      voltageV: context.getVoltageOut(),
    }
  }
  const session = context.getCoherentSession(transactionId)
  if (session == null) {
    // Defensive: caller must ensure the session exists before invoking.
    return {
      currentA: 0,
      deltaEnergyWh: 0,
      energyRegisterWh: connectorStatus.transactionEnergyActiveImportRegisterValue ?? 0,
      powerW: 0,
      socPercent: 0,
      voltageV: context.getVoltageOut(),
    }
  }

  // A zero-length interval integrates to zero energy regardless of power.
  // Guarding here prevents NaN propagation via
  //   maxPowerFromCapacityW = remainingWh · 3.6e6 / intervalMs
  // when SoC has already saturated (remainingWh = 0 ⇒ 0/0 = NaN), which
  // would otherwise permanently poison session.socPercent.
  if (options.intervalMs <= 0) {
    return {
      currentA: 0,
      deltaEnergyWh: 0,
      energyRegisterWh: connectorStatus.transactionEnergyActiveImportRegisterValue ?? 0,
      powerW: 0,
      socPercent: roundTo(session.socPercent, ROUNDING_SCALE),
      voltageV: roundTo(context.getVoltageOut(), ROUNDING_SCALE),
    }
  }

  const currentType = context.stationInfo?.currentOutType ?? CurrentType.AC
  const numberOfPhases = currentType === CurrentType.AC ? context.getNumberOfPhases() : 1

  const elapsedMs = Math.max(0, options.nowMs - session.sessionStartMs)
  const rampFactor =
    session.rampUpDurationMs > 0 ? Math.min(1, elapsedMs / session.rampUpDurationMs) : 1

  // Voltage: nominal ± small seed-derived noise. The voltage PRNG lives on
  // module-scope runtime state (not on the serializable session) so its
  // stream advances across samples; constructing a new PRNG per sample
  // would restart from the same seed each draw and produce a stalled
  // (non-advancing) sequence.
  const voltageNominal = context.getVoltageOut()
  let voltageV = voltageNominal
  if (options.voltageNoise !== false) {
    const runtime = getSessionRuntime(session)
    runtime.voltagePrng ??= createStreamPrng(options.rootSeed, transactionId, 'VOLTAGE_NOISE')
    voltageV = fluctuate(voltageNominal, VOLTAGE_NOISE_PERCENT, runtime.voltagePrng)
  }
  const roundedVoltage = roundTo(voltageV, ROUNDING_SCALE)

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
  // register. INV-3 (ΔE = P × Δt / 3.6e6) is preserved because ΔE is
  // computed from the clamped power below.
  const remainingWh = Math.max(
    0,
    ((100 - session.socPercent) / 100) * session.profile.batteryCapacityWh
  )
  const maxPowerFromCapacityW = (remainingWh * MS_PER_HOUR) / options.intervalMs
  powerW = Math.min(powerW, maxPowerFromCapacityW)

  // Physics: derive per-phase current as an exact fraction so
  //   V_round · currentAExact · phases = powerW
  // holds identically. `numberOfPhases` is 1 for DC (line above) so a
  // single branch covers both currents.
  //
  // Fix B1: the prior path used `ACElectricUtils.amperagePerPhaseFromPower`
  // (which rounds to integer amps), which could inflate V·I·phases above
  // the capacity-clamped powerW by up to V·phases·0.5 W after re-clamp,
  // breaking INV-1.
  const divisor = roundedVoltage * numberOfPhases
  const currentAExact = divisor > 0 ? powerW / divisor : 0

  // Emission: round current to `ROUNDING_SCALE`, then derive emitted power
  // from the rounded current so INV-1 (P = V·I·phases) holds within
  // `ROUNDING_SCALE` (≤0.005 W) regardless of V or phases.
  const roundedCurrent = roundTo(currentAExact, ROUNDING_SCALE)
  const roundedPower = roundTo(roundedVoltage * roundedCurrent * numberOfPhases, ROUNDING_SCALE)

  // Energy accounting uses the clamped (pre-rounding) `powerW` so INV-3
  // (ΔE = P × Δt / 3.6e6) holds within floating-point ε and the capacity
  // budget is respected exactly.
  const deltaEnergyWh = (powerW * options.intervalMs) / MS_PER_HOUR
  const preRegisterWh = connectorStatus.transactionEnergyActiveImportRegisterValue ?? 0
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
    voltageV: roundedVoltage,
  }
}

/**
 * Emits a SampledValue for `measurand` using the configured template.
 * Returns `undefined` when no matching template exists so the caller can
 * omit the measurand entirely.
 * @param templates - Templates configured on the connector or EVSE.
 * @param measurand - Target measurand.
 * @returns Template or `undefined`.
 */
const findTemplate = (
  templates: SampledValueTemplate[] | undefined,
  measurand: MeterValueMeasurand
): SampledValueTemplate | undefined => {
  if (templates == null) {
    return undefined
  }
  const defaultMeasurand = MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
  for (const template of templates) {
    const templateMeasurand = template.measurand ?? defaultMeasurand
    if (templateMeasurand === measurand) {
      return template
    }
  }
  return undefined
}

/**
 * Returns the SampledValueTemplate array configured on the given connector.
 *
 * Returns the connector-level `MeterValues` templates only. Unlike
 * {@link ../ocpp/OCPPServiceUtils.getSampledValueTemplate}, this does NOT
 * fall back to EVSE-level `MeterValues` templates: the {@link ICoherentContext}
 * surface exposes `getConnectorStatus` but not `getEvseStatus`. Adding
 * EVSE-level template inheritance to the coherent path requires extending
 * the context interface and is tracked as a follow-up.
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
 * Order of emitted SampledValues mirrors the legacy path (SoC → Voltage →
 * Power → Current → Energy) so consumers relying on order stay compatible.
 * Only measurands with a matching configured template are emitted; other
 * measurands are silently skipped. The energy register is advanced
 * unconditionally by {@link advanceEnergyRegister} independent of whether
 * the Energy measurand is emitted.
 * @param context - Charging-station context.
 * @param transactionId - Active transaction identifier.
 * @param buildVersionedSampledValue - Versioned SampledValue builder from
 *   the OCPP dispatcher in `OCPPServiceUtils.buildMeterValue`.
 * @param options - Per-sample parameters (interval, seed material, timestamp).
 * @param mvContext - Optional MeterValue reading context.
 * @returns MeterValue with sampled values and current timestamp.
 */
export const buildCoherentMeterValue = (
  context: ICoherentContext,
  transactionId: number | string,
  buildVersionedSampledValue: BuildVersionedSampledValue,
  options: ComputeSampleOptions,
  mvContext?: MeterValueContext
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

  const sample = computeCoherentSample(context, connectorStatus, options)
  // Own the register update: happens once per sample, unconditionally, so
  // meterStop is correct even when Energy.Active.Import.Register is not in
  // the configured MeterValues.
  advanceEnergyRegister(connectorStatus, sample.deltaEnergyWh)

  const templates = resolveTemplates(context, session.connectorId)
  const sampledValue: SampledValue[] = []
  const socTemplate = findTemplate(templates, MeterValueMeasurand.STATE_OF_CHARGE)
  if (socTemplate != null) {
    sampledValue.push(buildVersionedSampledValue(socTemplate, sample.socPercent, mvContext))
  }

  const voltageTemplate = findTemplate(templates, MeterValueMeasurand.VOLTAGE)
  if (voltageTemplate != null) {
    sampledValue.push(buildVersionedSampledValue(voltageTemplate, sample.voltageV, mvContext))
  }

  const powerTemplate = findTemplate(templates, MeterValueMeasurand.POWER_ACTIVE_IMPORT)
  if (powerTemplate != null) {
    const unitDivider = powerTemplate.unit === MeterValueUnit.KILO_WATT ? UNIT_DIVIDER_KILO : 1
    sampledValue.push(
      buildVersionedSampledValue(
        powerTemplate,
        roundTo(sample.powerW / unitDivider, ROUNDING_SCALE),
        mvContext
      )
    )
  }

  const currentTemplate = findTemplate(templates, MeterValueMeasurand.CURRENT_IMPORT)
  if (currentTemplate != null) {
    sampledValue.push(buildVersionedSampledValue(currentTemplate, sample.currentA, mvContext))
  }

  const energyTemplate = findTemplate(templates, MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER)
  if (energyTemplate != null) {
    const unitDivider =
      energyTemplate.unit === MeterValueUnit.KILO_WATT_HOUR ? UNIT_DIVIDER_KILO : 1
    const registerWh = connectorStatus.energyActiveImportRegisterValue ?? 0
    sampledValue.push(
      buildVersionedSampledValue(
        energyTemplate,
        roundTo(registerWh / unitDivider, ROUNDING_SCALE),
        mvContext
      )
    )
  }

  // MeterValue = OCPP16MeterValue | OCPP20MeterValue is a discriminated
  // union that diverges on the SampledValue.context enum. Coherent path
  // produces version-appropriate SampledValues via the injected
  // buildVersionedSampledValue callback, but the compile-time union of
  // SampledValue[] cannot be narrowed here — a boundary cast is required.
  return { sampledValue, timestamp: new Date() } as MeterValue
}

/**
 * Module-level tunable constants exposed for tests and external integration. All
 * values match the constants defined at the top of this module.
 */
export const CoherentMeterValuesDefaults = {
  DEFAULT_RAMP_UP_DURATION_MS,
  ROUNDING_SCALE,
  VOLTAGE_NOISE_PERCENT,
} as const

/**
 * Options for {@link createCoherentSession}.
 */
export interface CreateSessionOptions {
  connectorId: number
  now?: number
  profiles: EvProfile[]
  rampUpDurationMs?: number
  rootSeed: number
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
    rampUpDurationMs: options.rampUpDurationMs ?? DEFAULT_RAMP_UP_DURATION_MS,
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
