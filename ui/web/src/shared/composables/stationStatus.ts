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
