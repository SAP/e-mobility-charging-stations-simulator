/**
 * @file stationStatus.ts
 * @description Pure utility functions for OCPP connector/station status mapping.
 * These are not Vue composables (no reactive state) — they are pure utility functions
 * consumed exclusively by skin components via the shared layer.
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

// cspell:ignore suspendedev suspendedevse
// Lowercase keys — OCPP 1.6 `ChargePointStatus` + OCPP 2.0.1
// `ConnectorStatusEnumType.Occupied` values lowercased for case-insensitive
// lookup. No `ui-common` runtime enum access at module scope (test suites
// mock the module).
const CONNECTOR_STATUS_VARIANT: Readonly<Record<string, StatusVariant>> = Object.freeze({
  available: 'ok',
  charging: 'warn',
  faulted: 'err',
  finishing: 'warn',
  occupied: 'warn',
  preparing: 'warn',
  suspendedev: 'warn',
  suspendedevse: 'warn',
  unavailable: 'err',
})

/**
 * Maps an OCPP connector status string to a display variant.
 * @param status - The OCPP connector status value
 * @returns The display variant for the status
 */
export function getConnectorStatusVariant (status?: string): StatusVariant {
  if (status == null) return 'idle'
  return CONNECTOR_STATUS_VARIANT[status.toLowerCase()] ?? 'idle'
}

// WebSocket readyState values (mirror `WebSocketReadyState` from ui-common;
// module-local to keep this file free of runtime ui-common access at module
// scope — test suites mock ui-common).
const WS_STATE_CLOSED = 3
const WS_STATE_CLOSING = 2
const WS_STATE_CONNECTING = 0
const WS_STATE_OPEN = 1

/**
 * Maps a WebSocket ready state to a display variant.
 * @param wsState - The WebSocket readyState value
 * @returns The display variant for the WebSocket state
 */
export function getWebSocketStateVariant (wsState?: number): StatusVariant {
  switch (wsState) {
    case WS_STATE_CLOSED:
      return 'err'
    case WS_STATE_CLOSING:
      return 'warn'
    case WS_STATE_CONNECTING:
      return 'warn'
    case WS_STATE_OPEN:
      return 'ok'
    default:
      return 'idle'
  }
}
