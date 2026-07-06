// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

/**
 * @file Coherent MeterValue emission (phase families, emit order, units).
 * @description Assembles an OCPP {@link MeterValue} from a single
 *   {@link CoherentSample} produced by
 *   {@link ./CoherentSampleComputer.computeCoherentSample}.
 *
 * Two axes of ordering:
 * - Across measurands: `SoC → Voltage → Power → Current → Energy`
 *   (mirrors the `getSampledValueTemplate` path so downstream consumers
 *   relying on OCPP MeterValue ordering keep working).
 * - Within a measurand with multiple phase-qualified templates: no-phase
 *   first, then `L1/L1-N → L2/L2-N → L3/L3-N → L1-L2 → L2-L3 → L3-L1 → N`.
 *
 * Unsupported `(measurand, phase)` combinations are logged and skipped.
 * Only measurands enabled by the caller-resolved allow-list are emitted.
 * The energy register is advanced unconditionally by the caller through
 * {@link ./CoherentSampleComputer.advanceEnergyRegister} independent of
 * whether the Energy measurand is emitted.
 */

import type {
  MeterValue,
  MeterValueContext,
  SampledValue,
  SampledValueTemplate,
} from '../../types/index.js'
import type { CoherentSample, ComputeSampleOptions } from './CoherentSampleComputer.js'
import type { CoherentSession, ICoherentContext } from './types.js'

import {
  type ConnectorStatus,
  MeterValueMeasurand,
  MeterValuePhase,
  MeterValueUnit,
} from '../../types/index.js'
import { Constants, isEmpty, isNotEmptyArray, logger, roundTo } from '../../utils/index.js'
import {
  advanceEnergyRegister,
  computeCoherentSample,
  ROUNDING_SCALE,
} from './CoherentSampleComputer.js'

const moduleName = 'CoherentMeterValueBuilder'

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
 * Emit order across measurands, mirroring the `getSampledValueTemplate`
 * path (SoC → Voltage → Power → Current → Energy). Preserved so downstream
 * consumers relying on OCPP MeterValue ordering keep working.
 */
const MEASURAND_EMIT_ORDER = [
  MeterValueMeasurand.STATE_OF_CHARGE,
  MeterValueMeasurand.VOLTAGE,
  MeterValueMeasurand.POWER_ACTIVE_IMPORT,
  MeterValueMeasurand.CURRENT_IMPORT,
  MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
] as const satisfies readonly MeterValueMeasurand[]

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
 * `Energy.Active.Import.Register`, mirroring the existing convention.
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

const isLineToNeutralTemplate = (t: SampledValueTemplate): boolean =>
  phaseFamily(t.phase) === 'LineToNeutral'

const templateFamilyKey = (t: SampledValueTemplate): string =>
  JSON.stringify([t.context ?? null, t.format ?? null, t.location ?? null, t.unit ?? null])

/**
 * Applies the OCPP 2.0.1 `SampledDataCtrlr.RegisterValuesWithoutPhases`
 * suppression to the `Energy.Active.Import.Register` bucket in-place.
 * Groups templates into identity families keyed by
 * `(context, format, location, unit)`; within each family, per-phase
 * L-N templates are filtered out (avoiding "unsupported combination"
 * warnings for a configured skip). If a family has per-phase L-N
 * templates but no aggregate template, an aggregate is synthesized
 * from the first suppressed per-phase L-N of that family (phase
 * cleared, other identity fields inherited via shallow spread), so
 * the spec-mandated total is reported per family. Result is re-sorted
 * by `PHASE_RANK` to preserve stable emit order. No-op when the
 * measurand bucket is absent or has no per-phase L-N templates.
 * @param groups - Grouped templates map (mutated in-place).
 */
const applyRegisterValuesWithoutPhases = (
  groups: Map<MeterValueMeasurand, SampledValueTemplate[]>
): void => {
  const bucket = groups.get(MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER)
  if (bucket == null) return
  if (!bucket.some(isLineToNeutralTemplate)) return
  const surviving: SampledValueTemplate[] = []
  for (const family of Map.groupBy(bucket, templateFamilyKey).values()) {
    const perPhaseLN = family.filter(isLineToNeutralTemplate)
    if (isEmpty(perPhaseLN)) {
      surviving.push(...family)
      continue
    }
    const nonLN = family.filter(t => !isLineToNeutralTemplate(t))
    if (nonLN.some(t => t.phase == null)) {
      surviving.push(...nonLN)
    } else {
      // Synthesize family aggregate from first suppressed per-phase L-N:
      // unit / measurand / location / context / format inherit via shallow
      // spread; phase cleared so the aggregate branch of
      // `resolvePhasedValue` emits the total register for this family.
      surviving.push({ ...perPhaseLN[0], phase: undefined }, ...nonLN)
    }
  }
  surviving.sort(
    (a, b) =>
      (a.phase == null ? 0 : PHASE_RANK[a.phase]) - (b.phase == null ? 0 : PHASE_RANK[b.phase])
  )
  groups.set(MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER, surviving)
}

/**
 * Resolves the exact physical value to emit for a template given the
 * coherent sample. Returns `undefined` for unsupported `(measurand, phase)`
 * pairs so the caller can log-and-skip. Rounding is deferred to the emit
 * site so unit-conversion divisions round once.
 *
 * Per-phase resolution (balanced 3-phase Y assumption):
 * - Voltage: L-N ⇒ `sample.voltageV`; L-L ⇒ `sqrt(3) * sample.voltageV`
 *   when `numberOfPhases === 3` (L-L is defined only for balanced
 *   3-phase AC; skipped for any other phase count); N ⇒ 0.
 * - Power.Active.Import: aggregate ⇒ total P; L-N ⇒ `P / phases`;
 *   L-L undefined; N undefined (neutral carries no active power in
 *   balanced 3-φ Y).
 * - Current.Import: any line phase ⇒ `sample.currentA` (line current);
 *   L-L undefined; N ⇒ 0 (balanced 3-φ Y neutral current is zero).
 * - SoC: aggregate scalar; phase-qualified templates rejected.
 * - Energy.Active.Import.Register: aggregate ⇒ total register; L-N ⇒
 *   `register / phases` (per-phase energy contribution under balanced
 *   3-φ Y; Σ across all L-N templates equals the aggregate register
 *   within emit-unit rounding granularity - Wh: ≤ phases · 0.005 Wh;
 *   kWh: ≤ phases · 5 Wh); L-L undefined; N undefined. OCPP 2.0.1
 *   `SampledDataCtrlr.RegisterValuesWithoutPhases` suppression is
 *   applied at the bucket level in {@link buildCoherentMeterValue}
 *   before this function is called; L-N templates for
 *   `Energy.Active.Import.Register` are filtered out at that boundary
 *   when the flag is set, and an aggregate template is synthesized if
 *   the connector only configures per-phase templates.
 * @param measurand - Target measurand.
 * @param phase - Template `phase` field (may be `undefined`).
 * @param sample - Coherent sample (source of aggregate values).
 * @param numberOfPhases - Session phase count.
 * @param connectorStatus - Connector status (for the energy register).
 * @returns Value to emit, or `undefined` if the combination is unsupported.
 *
 * Supported measurands: `Current.Import`, `Energy.Active.Import.Register`,
 * `Power.Active.Import`, `SoC`, `Voltage`. Other OCPP-defined measurands
 * (notably `Power.Factor`, `Power.Reactive.Import`, `Frequency`,
 * `Temperature`) return `undefined` so the emission path logs and skips
 * the template. `EvProfile.powerFactor` scales the AC current/power chain
 * but is NOT emitted as a `Power.Factor` measurand; templates configuring
 * these unsupported measurands under coherent mode are skipped with a
 * warning in `buildCoherentMeterValue`.
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
        // V_LL = sqrt(3) * V_LN in a balanced 3-phase Y system (30-degree
        // phase separation). Defined only for numberOfPhases === 3;
        // 1-phase has no L-L pair, 2-phase is unsupported by contract.
        if (numberOfPhases !== 3) return undefined
        return Math.sqrt(3) * sample.voltageV
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
 * Resolves `MeterValues` templates for a connector. EVSE-level
 * `MeterValues` (when defined and non-empty) override connector-level
 * definitions for every connector under that EVSE; connector-level
 * `MeterValues` are used when the connector is not grouped under an
 * EVSE (flat `Connectors` map station layout) or when the EVSE-level
 * array is undefined or empty.
 *
 * NOTE: Unlike
 * {@link ../ocpp/OCPPServiceUtils.getSampledValueTemplate}, this does
 * NOT aggregate `MeterValues` across sibling connectors under the
 * same EVSE when EVSE-level `MeterValues` is undefined or empty. The
 * coherent path emits templates from exactly one source (EVSE-level
 * when non-empty, otherwise the queried connector), keeping
 * per-connector template ownership isolated; the random/fixed path's
 * cross-connector aggregation is intentionally not replicated.
 * @param context - Charging-station context.
 * @param connectorId - Connector identifier.
 * @returns Templates or `undefined`.
 */
const resolveTemplates = (
  context: ICoherentContext,
  connectorId: number
): SampledValueTemplate[] | undefined => {
  const evseId = context.getEvseIdByConnectorId(connectorId)
  if (evseId != null) {
    const evseTemplates = context.getEvseStatus(evseId)?.MeterValues
    if (isNotEmptyArray(evseTemplates)) {
      return evseTemplates
    }
  }
  return context.getConnectorStatus(connectorId)?.MeterValues
}

/**
 * Builds a complete OCPP {@link MeterValue} from a coherent sample.
 *
 * Emission order:
 * - Across measurands: `SoC → Voltage → Power → Current → Energy`.
 * - Within a measurand with multiple phase-qualified templates: no-phase
 *   first, then `L1/L1-N → L2/L2-N → L3/L3-N → L1-L2 → L2-L3 → L3-L1 → N`.
 *
 * Per-phase resolution - see {@link resolvePhasedValue}. Unsupported
 * `(measurand, phase)` combinations are logged and skipped.
 *
 * Only measurands enabled by the caller-resolved allow-list are emitted.
 * The energy register is advanced unconditionally by
 * {@link advanceEnergyRegister} independent of whether the Energy
 * measurand is emitted.
 * @param context - Charging-station context.
 * @param session - Active coherent session for the transaction. Callers
 *   look this up via
 *   {@link ../CoherentMeterValuesManager.CoherentMeterValuesManager.getSession}
 *   at the strategy gate and thread it through - the port no longer
 *   exposes session lookup.
 * @param buildVersionedSampledValue - Versioned SampledValue builder from
 *   the OCPP dispatcher in `OCPPServiceUtils.buildMeterValue`.
 * @param options - Per-sample parameters (interval, seed material, timestamp).
 * @param mvContext - Optional MeterValue reading context.
 * @param enabledMeasurands - Optional allow-list resolved from the
 *   version-appropriate OCPP variable at the `buildMeterValue` boundary.
 *   When `undefined`, all templates emit (default behavior). When defined,
 *   only measurands in the set emit. Governs OCPP 2.0.1 J02.FR.11 /
 *   E02.FR.09 / E06.FR.11 and OCPP 1.6 `MeterValuesSampledData`.
 * @param registerValuesWithoutPhases - Optional OCPP 2.0.1
 *   `SampledDataCtrlr.RegisterValuesWithoutPhases` flag. When `true`,
 *   `Energy.Active.Import.Register` templates are grouped into identity
 *   families keyed by `(context, format, location, unit)`; within each
 *   family, per-phase L-N templates are filtered out and, when a
 *   family has no aggregate template configured, an aggregate is
 *   synthesized from the first suppressed L-N of that family (phase
 *   cleared, other identity fields preserved) so the spec requirement
 *   "will only report the total energy over all phases" holds per
 *   family. Defaults to `false` (or `undefined`) so OCPP 1.6 callers
 *   preserve current behavior.
 * @returns MeterValue with sampled values and current timestamp.
 */
export const buildCoherentMeterValue = (
  context: ICoherentContext,
  session: CoherentSession,
  buildVersionedSampledValue: BuildVersionedSampledValue,
  options: ComputeSampleOptions,
  mvContext?: MeterValueContext,
  enabledMeasurands?: ReadonlySet<MeterValueMeasurand>,
  registerValuesWithoutPhases?: boolean
): MeterValue => {
  const connectorStatus = context.getConnectorStatus(session.connectorId)
  if (connectorStatus == null) {
    logger.warn(
      `${context.logPrefix()} ${moduleName}.buildCoherentMeterValue: missing connector ${session.connectorId.toString()} for transaction ${String(session.transactionId)}`
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
  if (registerValuesWithoutPhases === true) {
    applyRegisterValuesWithoutPhases(groups)
  }
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
          `${context.logPrefix()} ${moduleName}.buildCoherentMeterValue: unsupported (${measurand}, phase=${String(template.phase)}) - template skipped`
        )
        continue
      }
      // Narrow the OCPP 2.0.1 `SampledValueTemplate.unit` open-string branch
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
  // SampledValue[] cannot be narrowed here - a boundary cast is required.
  return { sampledValue, timestamp: new Date() } as MeterValue
}
