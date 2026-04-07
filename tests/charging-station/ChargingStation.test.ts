/**
 * @file Tests for ChargingStation integration
 * @description Integration test suite that verifies all ChargingStation test modules work together.
 *
 * Related domain-specific test files:
 * - ChargingStation-Lifecycle.test.ts: start/stop/restart operations
 * - ChargingStation-Connectors.test.ts: connector and EVSE operations, reservations
 * - ChargingStation-Transactions.test.ts: transaction handling and energy meters
 * - ChargingStation-Configuration.test.ts: boot notification, config persistence, WebSocket, error handling
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/index.js'

import { RegistrationStatusEnumType } from '../../src/types/index.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'
import {
  TEST_ID_TAG,
  TEST_ONE_HOUR_MS,
  TEST_TRANSACTION_ENERGY_WH,
  TEST_TRANSACTION_ID,
} from './ChargingStationTestConstants.js'
import {
  cleanupChargingStation,
  createMockChargingStation,
  MockIdTagsCache,
  MockSharedLRUCache,
  MockWebSocket,
  WebSocketReadyState,
} from './ChargingStationTestUtils.js'

await describe('ChargingStation', async () => {
  await describe('Test Utilities', async () => {
    afterEach(() => {
      standardCleanup()
    })
    await it('should create mock charging station with default options', () => {
      const result = createMockChargingStation()
      const station = result.station

      assert.notStrictEqual(station, undefined)
      assert.strictEqual(station.getNumberOfConnectors() > 0, true)
      assert.notStrictEqual(station.stationInfo, undefined)

      cleanupChargingStation(station)
    })

    await it('should create mock charging station with custom connector count', () => {
      const result = createMockChargingStation({ connectorsCount: 5 })
      const station = result.station

      // 5 connectors (excluding connector 0)
      assert.strictEqual(station.getNumberOfConnectors(), 5)
      assert.strictEqual(station.hasConnector(5), true)

      cleanupChargingStation(station)
    })

    await it('should create mock charging station with EVSE mode', () => {
      const result = createMockChargingStation({
        connectorsCount: 4,
        evseConfiguration: { evsesCount: 2 },
      })
      const station = result.station

      assert.strictEqual(station.hasEvses, true)
      assert.strictEqual(station.getNumberOfEvses(), 2)

      cleanupChargingStation(station)
    })

    await it('should provide mock WebSocket with message capture', () => {
      const result = createMockChargingStation()
      const mocks = result.mocks

      assert.notStrictEqual(mocks.webSocket, undefined)
      assert.ok(mocks.webSocket instanceof MockWebSocket)
      assert.strictEqual(mocks.webSocket.readyState, WebSocketReadyState.OPEN)

      cleanupChargingStation(result.station)
    })

    await it('should provide mock caches', () => {
      const result = createMockChargingStation()
      const mocks = result.mocks

      assert.notStrictEqual(mocks.sharedLRUCache, undefined)
      assert.ok(mocks.sharedLRUCache instanceof MockSharedLRUCache)
      assert.notStrictEqual(mocks.idTagsCache, undefined)
      assert.ok(mocks.idTagsCache instanceof MockIdTagsCache)

      cleanupChargingStation(result.station)
    })

    await it('should support boot notification status configuration', () => {
      // Test ACCEPTED state
      const acceptedResult = createMockChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.ACCEPTED,
      })
      assert.strictEqual(acceptedResult.station.inAcceptedState(), true)
      cleanupChargingStation(acceptedResult.station)

      // Test PENDING state
      const pendingResult = createMockChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.PENDING,
      })
      assert.strictEqual(pendingResult.station.inPendingState(), true)
      cleanupChargingStation(pendingResult.station)

      // Test REJECTED state
      const rejectedResult = createMockChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.REJECTED,
      })
      assert.strictEqual(rejectedResult.station.inRejectedState(), true)
      cleanupChargingStation(rejectedResult.station)
    })
  })

  await describe('Cross-Domain', async () => {
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
    await it('should support full lifecycle with transactions', async () => {
      // Create station
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      // Start station
      station.start()
      assert.strictEqual(station.started, true)

      // Set up transaction
      const connector1 = station.getConnectorStatus(1)
      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = TEST_TRANSACTION_ID
        connector1.transactionIdTag = TEST_ID_TAG
        connector1.transactionEnergyActiveImportRegisterValue = TEST_TRANSACTION_ENERGY_WH
      }

      // Verify transaction
      assert.strictEqual(station.getNumberOfRunningTransactions(), 1)
      assert.strictEqual(station.getTransactionIdTag(TEST_TRANSACTION_ID), TEST_ID_TAG)
      assert.strictEqual(
        station.getEnergyActiveImportRegisterByTransactionId(TEST_TRANSACTION_ID),
        TEST_TRANSACTION_ENERGY_WH
      )

      // Stop station
      await station.stop()
      assert.strictEqual(station.started, false)

      cleanupChargingStation(station)
      station = undefined
    })

    await it('should support WebSocket operations with state management', () => {
      // Create station
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      const mocks = result.mocks

      // Start station
      station.start()

      // Send WebSocket messages
      mocks.webSocket.send('["2","uuid-1","Heartbeat",{}]')
      assert.strictEqual(mocks.webSocket.sentMessages.length, 1)

      // Simulate connection close
      mocks.webSocket.simulateClose(1006, 'Connection lost')
      assert.strictEqual(mocks.webSocket.readyState, WebSocketReadyState.CLOSED)

      // Buffer messages while disconnected
      station.bufferMessage('["2","uuid-2","StatusNotification",{}]')
      const stationWithQueue = station as unknown as { messageQueue: string[] }
      assert.strictEqual(stationWithQueue.messageQueue.length, 1)

      cleanupChargingStation(station)
      station = undefined
    })

    await it('should support EVSE mode with reservations', async () => {
      // Create station with EVSEs
      const result = createMockChargingStation({
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 1 },
      })
      station = result.station

      // Verify EVSE structure
      assert.strictEqual(station.hasEvses, true)
      assert.strictEqual(station.getEvseIdByConnectorId(1), 1)

      // Add reservation
      const reservation = {
        connectorId: 1,
        expiryDate: new Date(Date.now() + TEST_ONE_HOUR_MS),
        idTag: 'RESERVATION-TAG',
        reservationId: 1,
      }
      await station.addReservation(reservation)

      // Verify reservation
      const found = station.getReservationBy('reservationId', 1)
      assert.notStrictEqual(found, undefined)
      assert.strictEqual(found?.idTag, 'RESERVATION-TAG')

      // Check reservability
      assert.strictEqual(station.isConnectorReservable(1), false)
      assert.strictEqual(station.isConnectorReservable(999), true)

      cleanupChargingStation(station)
      station = undefined
    })

    await it('should handle configuration with boot notification states', () => {
      // Create station in pending state
      const result = createMockChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.PENDING,
        connectorsCount: 1,
        heartbeatInterval: 120,
      })
      station = result.station

      // Verify initial state
      assert.strictEqual(station.inPendingState(), true)
      assert.strictEqual(station.getHeartbeatInterval(), 120000)

      // Transition to accepted
      station.bootNotificationResponse = {
        currentTime: new Date(),
        interval: 60,
        status: RegistrationStatusEnumType.ACCEPTED,
      }

      // Verify state change
      assert.strictEqual(station.inAcceptedState(), true)
      assert.strictEqual(station.inPendingState(), false)

      cleanupChargingStation(station)
      station = undefined
    })
  })

  await describe('Mock Reset', async () => {
    await it('should reset singleton mocks between tests', () => {
      // First test - create and use mocks
      const result1 = createMockChargingStation()
      const mocks1 = result1.mocks

      // Store some data in cache
      mocks1.idTagsCache.setIdTags('test-file.json', ['tag1', 'tag2'])
      assert.deepStrictEqual(mocks1.idTagsCache.getIdTags('test-file.json'), ['tag1', 'tag2'])

      // Cleanup first station
      cleanupChargingStation(result1.station)

      // Second test - should have fresh mocks
      const result2 = createMockChargingStation()
      const mocks2 = result2.mocks

      // Cache should be fresh (singletons reset in cleanup)
      // The resetInstance is called in cleanup, so new getInstance creates fresh instance
      assert.strictEqual(mocks2.idTagsCache.getIdTags('test-file.json'), undefined)

      cleanupChargingStation(result2.station)
    })
  })
})
