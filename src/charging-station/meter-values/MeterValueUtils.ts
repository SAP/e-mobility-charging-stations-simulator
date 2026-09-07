// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import type {
  MeterValueContext,
  MeterValueLocation,
  MeterValueMeasurand,
  MeterValueUnit,
} from '../../types/index.js'

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
