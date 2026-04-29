/**
 * @file stationStatus.ts
 * @description Pure utility functions for OCPP connector/station status mapping.
 * These are not Vue composables (no reactive state) but live in the composables directory
 * because they are consumed exclusively by skin components via the shared layer.
 */
import type { ChargingStationData, ConnectorEntry, Status } from 'ui-common'

/**
 * Status variant type for UI display.
 * Maps semantic OCPP states to visual indicator categories.
 */
export type StatusVariant = 'err' | 'idle' | 'ok' | 'warn'

/**
 * Gets the ATG status for a specific connector from the station's ATG statuses array.
 * @param station - The charging station data
 * @param connectorId - The connector identifier
 * @returns The ATG status, or undefined if not found
 */
export function getATGStatus (
  station: ChargingStationData,
  connectorId: number
): Status | undefined {
  return station.automaticTransactionGenerator?.automaticTransactionGeneratorStatuses?.find(
    entry => entry.connectorId === connectorId
  )?.status
}

/**
 * Extracts a flat array of connector entries from a charging station, filtering out placeholder
 * connectors (connectorId === 0) and placeholder EVSEs (evseId === 0).
 * @param station - The charging station data
 * @returns Flat array of connector entries with optional evseId
 */
export function getConnectorEntries (station: ChargingStationData): ConnectorEntry[] {
  if (Array.isArray(station.evses) && station.evses.length > 0) {
    const entries: ConnectorEntry[] = []
    for (const evse of station.evses) {
      if (evse.evseId > 0) {
        for (const c of evse.evseStatus.connectors) {
          if (c.connectorId > 0) {
            entries.push({
              connectorId: c.connectorId,
              connectorStatus: c.connectorStatus,
              evseId: evse.evseId,
            })
          }
        }
      }
    }
    return entries
  }
  return (station.connectors ?? [])
    .filter(c => c.connectorId > 0)
    .map(c => ({
      connectorId: c.connectorId,
      connectorStatus: c.connectorStatus,
    }))
}

/**
 * Maps an OCPP connector status string to a display variant.
 * @param status - The OCPP connector status value
 * @returns The display variant for the status
 */
export function getConnectorStatusVariant (status?: string): StatusVariant {
  // cspell:ignore suspendedev suspendedevse
  switch (status?.toLowerCase()) {
    case 'available':
      return 'ok'
    case 'charging':
    case 'occupied':
      return 'ok'
    case 'faulted':
    case 'unavailable':
      return 'err'
    case 'finishing':
    case 'preparing':
    case 'suspendedev':
    case 'suspendedevse':
      return 'warn'
    default:
      return 'idle'
  }
}

/**
 * Maps a WebSocket ready state to a display variant.
 * @param wsState - The WebSocket readyState value
 * @returns The display variant for the WebSocket state
 */
export function getWebSocketStateVariant (wsState?: number): StatusVariant {
  switch (wsState) {
    case 0: // WebSocket.CONNECTING
      return 'warn'
    case 1: // WebSocket.OPEN
      return 'ok'
    case 2: // WebSocket.CLOSING
      return 'warn'
    case 3: // WebSocket.CLOSED
      return 'err'
    default:
      return 'idle'
  }
}
