/**
 * Removes a trailing `/<stationId>` suffix from a supervision URL.
 *
 * The connection URL published by the simulator ends with the station identity
 * percent-encoded as one path segment (`encodeURIComponent`), so the encoded
 * form is matched first; the raw form is kept for URLs that were composed
 * without encoding.
 * @param url - The supervision URL potentially containing the station ID
 * @param stationId - The station ID to strip
 * @returns The URL without the trailing station ID suffix
 */
export function stripStationId (url: string, stationId: string): string {
  if (stationId.length === 0) return url
  for (const suffix of [`/${encodeURIComponent(stationId)}`, `/${stationId}`]) {
    if (url.endsWith(suffix)) return url.slice(0, -suffix.length)
  }
  return url
}
