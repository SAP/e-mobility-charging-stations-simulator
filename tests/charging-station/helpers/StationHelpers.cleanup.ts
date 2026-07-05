/**
 * @file Cleanup and reset helpers for mock ChargingStation lifecycle in tests.
 */

import type { ChargingStation } from '../../../src/charging-station/index.js'
import type { ConnectorStatus } from '../../../src/types/index.js'
import type { MockWebSocket } from '../mocks/MockWebSocket.js'

import {
  AvailabilityType,
  ConnectorStatusEnum,
  RegistrationStatusEnumType,
} from '../../../src/types/index.js'
import { MockIdTagsCache, MockSharedLRUCache } from '../mocks/MockCaches.js'

/**
 * Cleanup a ChargingStation instance to prevent test pollution
 *
 * Stops all timers, removes event listeners, and clears state.
 * Call this in test afterEach() hooks.
 * @param station - ChargingStation instance to clean up
 * @example
 * ```typescript
 * afterEach(() => {
 *   cleanupChargingStation(station)
 * })
 * ```
 */
export function cleanupChargingStation (station: ChargingStation): void {
  // Stop heartbeat timer
  if (station.heartbeatSetInterval != null) {
    clearInterval(station.heartbeatSetInterval)
    station.heartbeatSetInterval = undefined
  }

  // Stop WebSocket ping timer (private, accessed for cleanup via typed cast)
  const stationWithWsTimer = station as unknown as { wsPingSetInterval?: NodeJS.Timeout }
  if (stationWithWsTimer.wsPingSetInterval != null) {
    clearInterval(stationWithWsTimer.wsPingSetInterval)
    stationWithWsTimer.wsPingSetInterval = undefined
  }

  // Stop message buffer flush timer (private, accessed for cleanup via typed cast)
  const stationWithFlushTimer = station as unknown as {
    flushMessageBufferSetInterval?: NodeJS.Timeout
  }
  if (stationWithFlushTimer.flushMessageBufferSetInterval != null) {
    clearInterval(stationWithFlushTimer.flushMessageBufferSetInterval)
    stationWithFlushTimer.flushMessageBufferSetInterval = undefined
  }

  // Close WebSocket connection
  if (station.wsConnection != null) {
    try {
      station.closeWSConnection()
    } catch {
      // Ignore errors during cleanup
    }
  }

  // Clear all event listeners
  try {
    station.removeAllListeners()
  } catch {
    // Ignore errors during cleanup
  }

  // Clear connector transaction state and timers
  for (const { connectorStatus } of station.iterateConnectors()) {
    if (connectorStatus.transactionUpdatedMeterValuesSetInterval != null) {
      clearInterval(connectorStatus.transactionUpdatedMeterValuesSetInterval)
      connectorStatus.transactionUpdatedMeterValuesSetInterval = undefined
    }
    if (connectorStatus.transactionEndedMeterValuesSetInterval != null) {
      clearInterval(connectorStatus.transactionEndedMeterValuesSetInterval)
      connectorStatus.transactionEndedMeterValuesSetInterval = undefined
    }
  }

  // Clear requests map
  station.requests.clear()

  // Reset mock singleton instances
  MockSharedLRUCache.resetInstance()
  MockIdTagsCache.resetInstance()
}

/**
 * Reset a ChargingStation to its initial state
 *
 * Resets all connector statuses, clears transactions, and restores defaults.
 * Useful between test cases when reusing a station instance.
 * @param station - ChargingStation instance to reset
 * @example
 * ```typescript
 * beforeEach(() => {
 *   resetChargingStationState(station)
 * })
 * ```
 */
export function resetChargingStationState (station: ChargingStation): void {
  // Reset station state
  station.started = false
  station.starting = false

  // Reset boot notification response
  if (station.bootNotificationResponse != null) {
    station.bootNotificationResponse.status = RegistrationStatusEnumType.ACCEPTED
    station.bootNotificationResponse.currentTime = new Date()
  }

  // Reset connector statuses
  for (const { connectorId, connectorStatus } of station.iterateConnectors()) {
    resetConnectorStatus(connectorStatus, connectorId === 0)
  }

  // Reset EVSE availability
  for (const { evseStatus } of station.iterateEvses()) {
    evseStatus.availability = AvailabilityType.Operative
  }

  // Clear requests
  station.requests.clear()

  // Clear WebSocket messages if using MockWebSocket
  const ws = station.wsConnection as unknown as MockWebSocket | null
  if (ws != null && 'clearMessages' in ws) {
    ws.clearMessages()
  }
}

/**
 * Reset a single connector status to default values
 * @param status - Connector status object to reset
 * @param isConnectorZero - Whether this is connector 0 (station-level)
 */
function resetConnectorStatus (status: ConnectorStatus, isConnectorZero: boolean): void {
  status.availability = AvailabilityType.Operative
  status.status = isConnectorZero ? undefined : ConnectorStatusEnum.Available
  status.transactionId = undefined
  status.transactionIdTag = undefined
  status.transactionStart = undefined
  status.transactionStarted = false
  status.transactionRemoteStarted = false
  status.idTagAuthorized = false
  status.idTagLocalAuthorized = false
  status.energyActiveImportRegisterValue = 0
  status.transactionEnergyActiveImportRegisterValue = 0

  if (status.transactionUpdatedMeterValuesSetInterval != null) {
    clearInterval(status.transactionUpdatedMeterValuesSetInterval)
    status.transactionUpdatedMeterValuesSetInterval = undefined
  }

  status.transactionEndedMeterValues = undefined
  if (status.transactionEndedMeterValuesSetInterval != null) {
    clearInterval(status.transactionEndedMeterValuesSetInterval)
    status.transactionEndedMeterValuesSetInterval = undefined
  }
}
