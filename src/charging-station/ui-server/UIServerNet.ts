/**
 * Split a comma-separated header list while honoring RFC 7239 / RFC 7230
 * double-quoted values. Commas inside `"…"` are preserved.
 * @param value Raw header value.
 * @returns Trimmed non-empty entries.
 */
export const splitHeaderList = (value: string): string[] => splitQuoted(value, ',')

/**
 * Split a string on `delimiter` while honoring RFC 7230 double-quoted values.
 * Delimiters inside `"…"` are preserved.
 * @param value Raw input.
 * @param delimiter Single-character delimiter.
 * @returns Trimmed non-empty entries.
 */
export const splitQuoted = (value: string, delimiter: string): string[] => {
  const entries: string[] = []
  let current = ''
  let inQuotes = false
  for (const char of value) {
    if (char === '"') {
      inQuotes = !inQuotes
      current += char
      continue
    }
    if (char === delimiter && !inQuotes) {
      const trimmed = current.trim()
      if (trimmed !== '') {
        entries.push(trimmed)
      }
      current = ''
      continue
    }
    current += char
  }
  const trimmed = current.trim()
  if (trimmed !== '') {
    entries.push(trimmed)
  }
  return entries
}
