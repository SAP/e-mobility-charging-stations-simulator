/**
 * @file Tests for ChargingStation stopRunningTransactions
 * @description Verifies version-aware transaction stopping: OCPP 2.0 uses TransactionEvent(Ended),
 *              OCPP 1.6 uses StopTransaction
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/index.js'
import type { EmptyObject, JsonType, StopTransactionReason } from '../../src/types/index.js'

import { ChargingStation as ChargingStationClass } from '../../src/charging-station/ChargingStation.js'
import { OCPPVersion } from '../../src/types/index.js'
import { Constants } from '../../src/utils/index.js'
import { setupConnectorWithTransaction, standardCleanup } from '../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from './ChargingStationTestConstants.js'
import { cleanupChargingStation, createMockChargingStation } from './ChargingStationTestUtils.js'

interface TestableChargingStationPrivate {
  stopRunningTransactions: (reason?: StopTransactionReason) => Promise<void>
  stopRunningTransactionsOCPP20: (reason?: StopTransactionReason) => Promise<void>
  stopTransactionOnConnector: (
    connectorId: number,
    reason?: StopTransactionReason
  ) => Promise<unknown>
}

/**
 * Binds private ChargingStation methods to a mock station instance for testing
 * @param station - The mock station to bind methods to
 */
function bindPrivateMethods (station: ChargingStation): void {
  const proto = ChargingStationClass.prototype as unknown as TestableChargingStationPrivate
  const stationRecord = station as unknown as Record<string, unknown>
  stationRecord.stopRunningTransactions = proto.stopRunningTransactions
  stationRecord.stopRunningTransactionsOCPP20 = proto.stopRunningTransactionsOCPP20
  stationRecord.stopTransactionOnConnector = proto.stopTransactionOnConnector
}

await describe('ChargingStation stopRunningTransactions', async () => {
  let station: ChargingStation | undefined

  beforeEach(() => {
    station = undefined
  })

  afterEach(() => {
    standardCleanup()
    if (station != null) {
      cleanupChargingStation(station)
    }
  })

  await it('should send TransactionEvent(Ended) for OCPP 2.0 stations when stopping running transactions', async () => {
    // Arrange
    const sentRequests: { command: string; payload: Record<string, unknown> }[] = []
    const requestHandlerMock = mock.fn(async (...args: unknown[]) => {
      sentRequests.push({
        command: args[1] as string,
        payload: args[2] as Record<string, unknown>,
      })
      return Promise.resolve({} as EmptyObject)
    })

    const result = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 2,
      evseConfiguration: { evsesCount: 2 },
      heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
      ocppRequestService: {
        requestHandler: requestHandlerMock,
      },
      stationInfo: {
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
    })
    station = result.station
    station.isWebSocketConnectionOpened = () => true
    bindPrivateMethods(station)

    setupConnectorWithTransaction(station, 1, { transactionId: 1001 })
    const connector1 = station.getConnectorStatus(1)
    if (connector1 != null) {
      connector1.transactionId = 'tx-ocpp20-1001'
    }

    // Act
    const testable = station as unknown as TestableChargingStationPrivate
    await testable.stopRunningTransactions()

    // Assert
    const transactionEventCalls = sentRequests.filter(r => r.command === 'TransactionEvent')
    assert.ok(transactionEventCalls.length > 0, 'Expected at least one TransactionEvent request')
    const stopTransactionCalls = sentRequests.filter(r => r.command === 'StopTransaction')
    assert.strictEqual(
      stopTransactionCalls.length,
      0,
      'Should not send StopTransaction for OCPP 2.0'
    )
  })

  await it('should send StopTransaction for OCPP 1.6 stations when stopping running transactions', async () => {
    // Arrange
    const sentRequests: { command: string; payload: Record<string, unknown> }[] = []
    const requestHandlerMock = mock.fn(async (...args: unknown[]) => {
      sentRequests.push({
        command: args[1] as string,
        payload: args[2] as Record<string, unknown>,
      })
      return Promise.resolve({ idTagInfo: { status: 'Accepted' } } as unknown as JsonType)
    })

    const result = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 2,
      ocppRequestService: {
        requestHandler: requestHandlerMock,
      },
      stationInfo: {
        ocppVersion: OCPPVersion.VERSION_16,
      },
    })
    station = result.station
    station.isWebSocketConnectionOpened = () => true
    bindPrivateMethods(station)

    setupConnectorWithTransaction(station, 1, { transactionId: 5001 })

    // Act
    const testable = station as unknown as TestableChargingStationPrivate
    await testable.stopRunningTransactions()

    // Assert
    const stopTransactionCalls = sentRequests.filter(r => r.command === 'StopTransaction')
    assert.ok(stopTransactionCalls.length > 0, 'Expected at least one StopTransaction request')
    const transactionEventCalls = sentRequests.filter(r => r.command === 'TransactionEvent')
    assert.strictEqual(
      transactionEventCalls.length,
      0,
      'Should not send TransactionEvent for OCPP 1.6'
    )
  })

  await it('should handle errors gracefully when OCPP 2.0 transaction stop fails', async () => {
    // Arrange
    const requestHandlerMock = mock.fn(async () => {
      return Promise.reject(new Error('Simulated network error'))
    })

    const result = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 2,
      evseConfiguration: { evsesCount: 2 },
      heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
      ocppRequestService: {
        requestHandler: requestHandlerMock,
      },
      stationInfo: {
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
    })
    station = result.station
    station.isWebSocketConnectionOpened = () => true
    bindPrivateMethods(station)

    setupConnectorWithTransaction(station, 1, { transactionId: 2001 })
    const connector1 = station.getConnectorStatus(1)
    if (connector1 != null) {
      connector1.transactionId = 'tx-ocpp20-2001'
    }

    // Act & Assert — should not throw
    const testable = station as unknown as TestableChargingStationPrivate
    await testable.stopRunningTransactions()
  })

  await it('should also stop pending transactions for OCPP 2.0 stations', async () => {
    // Arrange
    const sentRequests: { command: string; payload: Record<string, unknown> }[] = []
    const requestHandlerMock = mock.fn(async (...args: unknown[]) => {
      sentRequests.push({
        command: args[1] as string,
        payload: args[2] as Record<string, unknown>,
      })
      return Promise.resolve({} as EmptyObject)
    })

    const result = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 2,
      evseConfiguration: { evsesCount: 2 },
      heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
      ocppRequestService: {
        requestHandler: requestHandlerMock,
      },
      stationInfo: {
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
    })
    station = result.station
    station.isWebSocketConnectionOpened = () => true
    bindPrivateMethods(station)

    // Set up a pending transaction (not started, but pending)
    const connector1 = station.getConnectorStatus(1)
    if (connector1 != null) {
      connector1.transactionPending = true
      connector1.transactionStarted = false
      connector1.transactionId = 'tx-pending-3001'
    }

    // Act
    const testable = station as unknown as TestableChargingStationPrivate
    await testable.stopRunningTransactions()

    // Assert
    const transactionEventCalls = sentRequests.filter(r => r.command === 'TransactionEvent')
    assert.ok(transactionEventCalls.length > 0, 'Expected TransactionEvent for pending transaction')
  })
})
