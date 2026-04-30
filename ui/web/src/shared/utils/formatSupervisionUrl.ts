import { EMPTY_VALUE_PLACEHOLDER } from '@/core/Constants.js'

export interface FormatSupervisionUrlOptions {
  /** Insert zero-width-space after dots for word-break in table cells. */
  wordBreak?: boolean
}

/**
 * Formats a supervision URL for display. Strips the pathname when it is '/'.
 * Returns `EMPTY_VALUE_PLACEHOLDER` for undefined/empty input.
 * @param url - The raw supervision URL string
 * @param options - Formatting options
 * @returns A formatted display string
 */
export function formatSupervisionUrl (
  url: string | undefined,
  options?: FormatSupervisionUrlOptions
): string {
  const trimmed = url?.trim()
  if (!trimmed) {
    return EMPTY_VALUE_PLACEHOLDER
  }

  try {
    const parsed = new URL(trimmed)
    const host = options?.wordBreak === true ? parsed.host.split('.').join('.\u200b') : parsed.host
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname
    return `${parsed.protocol}//${host}${pathname}`
  } catch {
    return trimmed
  }
}
