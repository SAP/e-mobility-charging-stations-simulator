// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

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
