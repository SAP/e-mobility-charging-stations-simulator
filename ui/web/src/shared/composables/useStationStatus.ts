/**
 * Status variant type for UI display.
 * Maps semantic OCPP states to visual indicator categories.
 */
export type StatusVariant = 'err' | 'idle' | 'ok' | 'warn'

/**
 * Maps an OCPP connector status string to a display variant.
 * @param status - The OCPP connector status value
 * @returns The display variant for the status
 */
export function getConnectorStatusVariant (status?: string): StatusVariant {
  switch (status) {
    case 'Available':
      return 'ok'
    case 'Charging':
    case 'Occupied':
      return 'ok'
    case 'Faulted':
    case 'Unavailable':
      return 'err'
    case 'Finishing':
    case 'Preparing':
    case 'SuspendedEV':
    case 'SuspendedEVSE':
      return 'warn'
    default:
      return 'idle'
  }
}

/**
 * Maps simulator start state and WebSocket connection state to a display variant.
 * @param started - Whether the charging station is started
 * @param wsConnected - Whether the WebSocket is connected
 * @returns The display variant for the combined state
 */
export function getWsStatusVariant (started: boolean, wsConnected: boolean): StatusVariant {
  if (!started) {
    return 'idle'
  }
  return wsConnected ? 'ok' : 'err'
}
