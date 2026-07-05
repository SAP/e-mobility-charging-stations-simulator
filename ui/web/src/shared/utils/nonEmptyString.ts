/**
 * Returns `value` when it is a non-empty string, otherwise `undefined`.
 * Accepts `unknown` so it can double as a type guard for object-property lookups.
 * @param value - The candidate value.
 * @returns The original string when non-empty, otherwise `undefined`.
 */
export const nonEmptyStringOrUndefined = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined
