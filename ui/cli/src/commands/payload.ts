import type { RequestPayload } from 'ui-common'

export const buildHashIdsPayload = (hashIds: string[]): RequestPayload =>
  hashIds.length > 0 ? { hashIds } : {}

export const pickDefined = (
  source: Record<string, unknown>,
  keyMap: Record<string, string>
): Record<string, unknown> => {
  const result: Record<string, unknown> = {}
  for (const [sourceKey, targetKey] of Object.entries(keyMap)) {
    if (source[sourceKey] != null) {
      result[targetKey] = source[sourceKey]
    }
  }
  return result
}
