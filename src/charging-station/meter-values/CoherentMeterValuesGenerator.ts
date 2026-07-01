// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

/**
 * @file Physics-based coherent MeterValue generator.
 * @description Constructs a coherent {@link MeterValue} in which every
 *   emitted measurand is derived from a single physics chain
 *   (V → P → I → ΔE → SoC) rather than sampled independently.
 *
 * Invariants (enforced by construction; see `/tmp/issue-40/golden/run-invariants.ts`):
 * - AC: `P = V × I × phases`; DC: `P = V × I` (recomputed from rounded emitted V/I).
 * - `ΔE = P × Δt / 3_600_000` and `E(t+1) ≥ E(t)`.
 * - `SoC(t+1) ≥ SoC(t)` and `ΔSoC = ΔE / batteryCapacityWh × 100`.
 * - `P ≤ min(EVSE_max, EV_acceptance(SoC), profileLimit)`.
 * - `SoC ≥ 100 ⇒ P = 0, I = 0, ΔE = 0`.
 *
 * The generator owns the connector energy register update: it advances the
 * register exactly once per sample, unconditionally (Phase 2 merged
 * finding #1). This is required so `meterStop` is correct even when
 * `Energy.Active.Import.Register` is not in the configured MeterValues.
 */

import type {
  ConnectorStatus,
  MeterValue,
  MeterValueContext,
  MeterValuePhase,
  SampledValue,
  SampledValueTemplate,
} from '../../types/index.js'
import type { CoherentSession, EvProfile, ICoherentContext } from './types.js'

import { CurrentType, MeterValueMeasurand, MeterValueUnit, Voltage } from '../../types/index.js'
import { ACElectricUtils, DCElectricUtils, logger, roundTo } from '../../utils/index.js'
import { interpolateChargingCurve, selectEvProfile } from './EvProfiles.js'
import { deriveSeed, mulberry32 } from './prng.js'

const moduleName = 'CoherentMeterValuesGenerator'

const MS_PER_HOUR = 3_600_000
const UNIT_DIVIDER_KILO = 1000
const SOC_ROUNDING_SCALE = 2
const VOLTAGE_ROUNDING_SCALE = 2
const CURRENT_ROUNDING_SCALE = 2
const POWER_ROUNDING_SCALE = 2
const ENERGY_ROUNDING_SCALE = 2
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
 * Deterministic per-transaction stream splitter. Combines the station
 * `randomSeed` (or a stable fallback), the transactionId, and a label so
 * that adding a new consumer never shifts an existing stream's sequence
 * (splitting rationale — see design doc §Determinism).
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
  chargingProfileLimitW?: number
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
 * Physics is deliberately expressed in the same order as the golden set
 * so both produce identical outputs for identical inputs:
 * 1. `rampFactor = min(1, elapsed / rampUp)` — immutable session start.
 * 2. `V` — nominal ± small seed-derived noise.
 * 3. `evAcceptanceW = curve(SoC) × profile.maxPowerW`.
 * 4. `powerW = rampFactor × min(EVSE_max, evAcceptance, profileLimit) × socCap`.
 * 5. `I = ACElectricUtils.amperagePerPhaseFromPower / DCElectricUtils.amperage`.
 * 6. `reportedPowerW = powerTotal(V_round, I_round)` — recomputed for algebraic
 *    consistency (INV-1 holds within ±1 W after rounding).
 * 7. `ΔE = reportedPowerW × Δt / 3.6e6`; `ΔSoC = ΔE / capacity × 100`.
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

  const currentType = context.stationInfo?.currentOutType ?? CurrentType.AC
  const numberOfPhases = currentType === CurrentType.AC ? context.getNumberOfPhases() : 1

  const elapsedMs = Math.max(0, options.nowMs - session.sessionStartMs)
  const rampFactor =
    session.rampUpDurationMs > 0 ? Math.min(1, elapsedMs / session.rampUpDurationMs) : 1

  // Voltage: nominal ± small seed-derived noise.
  const voltageNominal = context.getVoltageOut()
  let voltageV = voltageNominal
  if (options.voltageNoise !== false) {
    // Cache the PRNG on the session so state advances across samples.
    // Fix Phase 4 M1: prior code constructed the PRNG per sample which
    // restarted from the same seed each draw, producing a stalled sequence.
    session.voltagePrng ??= createStreamPrng(options.rootSeed, transactionId, 'VOLTAGE_NOISE')
    voltageV = fluctuate(voltageNominal, VOLTAGE_NOISE_PERCENT, session.voltagePrng)
  }
  const roundedVoltage = roundTo(voltageV, VOLTAGE_ROUNDING_SCALE)

  // EV acceptance from the curve at running SoC.
  const acceptanceFraction = interpolateChargingCurve(
    session.profile.chargingCurve,
    session.socPercent
  )
  const evAcceptanceW = acceptanceFraction * session.profile.maxPowerW

  // EVSE cap (already includes hardware/charging-profile clamps via ChargingStation).
  const evseLimitW = context.getConnectorMaximumAvailablePower(session.connectorId)
  const profileLimitW = options.chargingProfileLimitW ?? Number.POSITIVE_INFINITY

  const socCap = session.socPercent >= 100 ? 0 : 1
  const targetPowerW = rampFactor * Math.min(evseLimitW, evAcceptanceW, profileLimitW) * socCap
  let powerW = Math.max(0, targetPowerW)

  // Clamp powerW to whatever the remaining battery capacity accepts over
  // this interval so a sample that crosses 100 % SoC cannot over-charge the
  // register. INV-3 (P × Δt / 3.6e6 = ΔE) is preserved because everything
  // downstream is recomputed from the clamped power. Fix Phase 4 M2.
  const remainingWh = Math.max(
    0,
    ((100 - session.socPercent) / 100) * session.profile.batteryCapacityWh
  )
  const maxPowerFromCapacityW = (remainingWh * MS_PER_HOUR) / options.intervalMs
  powerW = Math.min(powerW, maxPowerFromCapacityW)

  // Current from existing electric utilities. reportedPowerW is derived from
  // the (possibly clamped) powerW so V·I = P holds within rounding
  // tolerance (CURRENT_ROUNDING_SCALE=2 keeps this ≤0.1 W on realistic V).
  let currentA: number
  let reportedPowerW: number
  if (currentType === CurrentType.AC) {
    currentA = ACElectricUtils.amperagePerPhaseFromPower(numberOfPhases, powerW, roundedVoltage)
    reportedPowerW = ACElectricUtils.powerTotal(numberOfPhases, roundedVoltage, currentA)
  } else {
    currentA = DCElectricUtils.amperage(powerW, roundedVoltage)
    reportedPowerW = DCElectricUtils.power(roundedVoltage, currentA)
  }
  // Float-round can push reportedPowerW back over maxPowerFromCapacityW —
  // floor it. At CURRENT_ROUNDING_SCALE=2, V·I still reconstructs
  // reportedPowerW within ≤0.1 W on typical mains, so INV-1 tolerance (±1 W)
  // is preserved.
  reportedPowerW = Math.min(reportedPowerW, maxPowerFromCapacityW)
  const roundedCurrent = roundTo(currentA, CURRENT_ROUNDING_SCALE)
  const roundedPower = roundTo(reportedPowerW, POWER_ROUNDING_SCALE)

  const deltaEnergyWh = (reportedPowerW * options.intervalMs) / MS_PER_HOUR
  const preRegisterWh = connectorStatus.transactionEnergyActiveImportRegisterValue ?? 0
  const projectedRegisterWh = preRegisterWh + deltaEnergyWh

  // Advance SoC with saturation at 100 %.
  const deltaSocPercent = (deltaEnergyWh / session.profile.batteryCapacityWh) * 100
  session.socPercent = Math.min(100, session.socPercent + deltaSocPercent)

  return {
    currentA: roundedCurrent,
    deltaEnergyWh,
    energyRegisterWh: projectedRegisterWh,
    powerW: roundedPower,
    socPercent: roundTo(session.socPercent, SOC_ROUNDING_SCALE),
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
 * Resolves the SampledValueTemplate array for a given connector, mirroring
 * the EVSE-vs-connector lookup rules in
 * {@link ../ocpp/OCPPServiceUtils.getSampledValueTemplate}.
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
  // Own the register update: happens once per sample, unconditionally
  // (Phase 2 merged finding #1).
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
        roundTo(sample.powerW / unitDivider, POWER_ROUNDING_SCALE),
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
        roundTo(registerWh / unitDivider, ENERGY_ROUNDING_SCALE),
        mvContext
      )
    )
  }

  return { sampledValue, timestamp: new Date() } as MeterValue
}

/**
 * Public defaults exposed for tests and integration.
 */
export const CoherentMeterValuesDefaults = {
  DEFAULT_RAMP_UP_DURATION_MS,
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
 * so adding one consumer does not shift any other stream (Phase 2 design
 * §Determinism).
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
  const source = stationInfo?.hashId ?? ''
  let hash = 0x811c9dc5
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}
