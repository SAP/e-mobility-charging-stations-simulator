/**
 * Removes a trailing `/<stationId>` suffix from a supervision URL.
 * @param url - The supervision URL potentially containing the station ID
 * @param stationId - The station ID to strip
 * @returns The URL without the trailing station ID suffix
 */
export function stripStationId (url: string, stationId: string): string {
  if (stationId.length === 0) return url
  const suffix = `/${stationId}`
  return url.endsWith(suffix) ? url.slice(0, -suffix.length) : url
}
