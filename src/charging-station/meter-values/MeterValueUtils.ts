// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import {
  type MeterValueContext,
  type MeterValueLocation,
  MeterValueMeasurand,
  MeterValuePhase,
  MeterValueUnit,
} from '../../types/index.js'
import { Constants } from '../../utils/index.js'

/**
 * Serializes custom data with recursively sorted object keys for stable meter-value identities.
 * Array order remains significant.
 * @param customData - JSON-compatible custom data to serialize
 * @returns Canonical JSON, or `undefined` when custom data is absent
 */
export const canonicalizeCustomData = (customData: unknown): string | undefined =>
  JSON.stringify(customData, (_key: string, value: unknown): unknown => {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) return value
    const sortedValue: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      sortedValue[key] = (value as Record<string, unknown>)[key]
    }
    return sortedValue
  })

export interface MeterValueUnitFamily {
  readonly baseUnit: string
  readonly kiloUnit?: string
}

/**
 * Resolves the additive unit family for a meter-value measurand.
 * @param measurand - OCPP meter-value measurand.
 * @param configuredUnit - Optional configured unit to validate against the family.
 * @returns Base/kilo unit family, or `undefined` for non-additive or incompatible values.
 */
export const getMeterValueUnitFamily = (
  measurand: MeterValueMeasurand | undefined,
  configuredUnit?: string
): MeterValueUnitFamily | undefined => {
  let family: MeterValueUnitFamily | undefined
  if (measurand?.startsWith('Current.') === true) {
    family = { baseUnit: MeterValueUnit.AMP }
  } else if (measurand?.startsWith('Energy.Active.') === true) {
    family = { baseUnit: MeterValueUnit.WATT_HOUR, kiloUnit: MeterValueUnit.KILO_WATT_HOUR }
  } else if (measurand?.startsWith('Energy.Reactive.') === true) {
    family = { baseUnit: MeterValueUnit.VAR_HOUR, kiloUnit: MeterValueUnit.KILO_VAR_HOUR }
  } else if (measurand?.startsWith('Energy.Apparent.') === true) {
    family = { baseUnit: MeterValueUnit.VOLT_AMP_HOUR, kiloUnit: MeterValueUnit.KILO_VOLT_AMP_HOUR }
  } else if (measurand?.startsWith('Power.Reactive.') === true) {
    family = { baseUnit: MeterValueUnit.VAR, kiloUnit: MeterValueUnit.KILO_VAR }
  } else if (measurand?.startsWith('Power.Apparent.') === true) {
    family = { baseUnit: MeterValueUnit.VOLT_AMP, kiloUnit: MeterValueUnit.KILO_VOLT_AMP }
  } else if (
    measurand?.startsWith('Power.') === true &&
    measurand !== MeterValueMeasurand.POWER_FACTOR
  ) {
    family = { baseUnit: MeterValueUnit.WATT, kiloUnit: MeterValueUnit.KILO_WATT }
  }
  if (
    family != null &&
    configuredUnit != null &&
    configuredUnit !== family.baseUnit &&
    configuredUnit !== family.kiloUnit
  ) {
    return undefined
  }
  return family
}

/**
 * Tests whether two units belong to the same additive measurand family.
 * @param measurand - OCPP meter-value measurand.
 * @param sourceUnit - Source unit.
 * @param targetUnit - Target unit.
 * @returns Whether the units are identical or compatible base/kilo variants.
 */
export const areMeterValueUnitsCompatible = (
  measurand: MeterValueMeasurand,
  sourceUnit: string | undefined,
  targetUnit: string | undefined
): boolean => {
  if (sourceUnit === targetUnit) return true
  const family = getMeterValueUnitFamily(measurand)
  return (
    family != null &&
    sourceUnit != null &&
    targetUnit != null &&
    (sourceUnit === family.baseUnit || sourceUnit === family.kiloUnit) &&
    (targetUnit === family.baseUnit || targetUnit === family.kiloUnit)
  )
}

/**
 * Resolves the base-to-configured-unit divider for a meter-value measurand.
 * @param measurand - OCPP meter-value measurand.
 * @param unit - Configured output unit.
 * @returns `Constants.UNIT_DIVIDER_KILO` for the family's kilo unit, otherwise `1`.
 */
export const resolveMeterValueUnitDivider = (
  measurand: MeterValueMeasurand,
  unit: string | undefined
): number => {
  const kiloUnit = getMeterValueUnitFamily(measurand)?.kiloUnit
  return kiloUnit != null && kiloUnit === unit ? Constants.UNIT_DIVIDER_KILO : 1
}

/**
 * Resolves an OCPP line or line-to-neutral phase to its one-based line index.
 * @param phase - OCPP meter-value phase.
 * @returns Line index, or `undefined` for aggregate, neutral, line-to-line, and unsupported phases.
 */
export const resolveLinePhaseIndex = (phase: string | undefined): number | undefined => {
  switch (phase) {
    case MeterValuePhase.L1:
    case MeterValuePhase.L1_N:
      return 1
    case MeterValuePhase.L2:
    case MeterValuePhase.L2_N:
      return 2
    case MeterValuePhase.L3:
    case MeterValuePhase.L3_N:
      return 3
    default:
      return undefined
  }
}

/**
 * Builds a stable phase-independent key from fields as they will be emitted.
 * Callers must resolve source defaults and runtime overrides before invoking it.
 * @param identity - Effective emitted sampled-value identity fields
 * @param identity.context - Effective reading context
 * @param identity.customData - Source custom data included in OCPP 2.0 output
 * @param identity.location - Effective measurement location
 * @param identity.measurand - Effective measurand
 * @param identity.unit - Effective unit
 * @returns Stable serialized family identity
 */
export const buildSampledValueFamilyKey = (identity: {
  context: MeterValueContext
  customData: unknown
  location: MeterValueLocation | undefined
  measurand: MeterValueMeasurand
  unit: MeterValueUnit | undefined
}): string =>
  JSON.stringify([
    identity.context,
    identity.location,
    identity.unit,
    identity.measurand,
    canonicalizeCustomData(identity.customData),
  ])
