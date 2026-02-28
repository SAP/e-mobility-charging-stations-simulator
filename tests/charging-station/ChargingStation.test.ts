/**
 * @file ChargingStation Integration Tests
 * @description Integration test suite that verifies all ChargingStation test modules work together.
 *
 * Domain-specific tests have been split into separate files:
 * - ChargingStation-Lifecycle.test.ts: start/stop/restart operations
 * - ChargingStation-Connectors.test.ts: connector and EVSE operations, reservations
 * - ChargingStation-Transactions.test.ts: transaction handling and energy meters
 * - ChargingStation-Configuration.test.ts: boot notification, config persistence, WebSocket, error handling
 */
import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/ChargingStation.js'

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

      expect(station).toBeDefined()
      expect(station.connectors.size).toBeGreaterThan(0)
      expect(station.stationInfo).toBeDefined()

      cleanupChargingStation(station)
    })

    await it('should create mock charging station with custom connector count', () => {
      const result = createMockChargingStation({ connectorsCount: 5 })
      const station = result.station

      // 5 connectors + connector 0 = 6 total
      expect(station.connectors.size).toBe(6)
      expect(station.hasConnector(5)).toBe(true)

      cleanupChargingStation(station)
    })

    await it('should create mock charging station with EVSE mode', () => {
      const result = createMockChargingStation({
        connectorsCount: 4,
        evseConfiguration: { evsesCount: 2 },
      })
      const station = result.station

      expect(station.hasEvses).toBe(true)
      expect(station.getNumberOfEvses()).toBe(2)

      cleanupChargingStation(station)
    })

    await it('should provide mock WebSocket with message capture', () => {
      const result = createMockChargingStation()
      const mocks = result.mocks

      expect(mocks.webSocket).toBeDefined()
      expect(mocks.webSocket).toBeInstanceOf(MockWebSocket)
      expect(mocks.webSocket.readyState).toBe(WebSocketReadyState.OPEN)

      cleanupChargingStation(result.station)
    })

    await it('should provide mock caches', () => {
      const result = createMockChargingStation()
      const mocks = result.mocks

      expect(mocks.sharedLRUCache).toBeDefined()
      expect(mocks.sharedLRUCache).toBeInstanceOf(MockSharedLRUCache)
      expect(mocks.idTagsCache).toBeDefined()
      expect(mocks.idTagsCache).toBeInstanceOf(MockIdTagsCache)

      cleanupChargingStation(result.station)
    })

    await it('should support boot notification status configuration', () => {
      // Test ACCEPTED state
      const acceptedResult = createMockChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.ACCEPTED,
      })
      expect(acceptedResult.station.inAcceptedState()).toBe(true)
      cleanupChargingStation(acceptedResult.station)

      // Test PENDING state
      const pendingResult = createMockChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.PENDING,
      })
      expect(pendingResult.station.inPendingState()).toBe(true)
      cleanupChargingStation(pendingResult.station)

      // Test REJECTED state
      const rejectedResult = createMockChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.REJECTED,
      })
      expect(rejectedResult.station.inRejectedState()).toBe(true)
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
      expect(station.started).toBe(true)

      // Set up transaction
      const connector1 = station.getConnectorStatus(1)
      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = TEST_TRANSACTION_ID
        connector1.transactionIdTag = TEST_ID_TAG
        connector1.transactionEnergyActiveImportRegisterValue = TEST_TRANSACTION_ENERGY_WH
      }

      // Verify transaction
      expect(station.getNumberOfRunningTransactions()).toBe(1)
      expect(station.getTransactionIdTag(TEST_TRANSACTION_ID)).toBe(TEST_ID_TAG)
      expect(station.getEnergyActiveImportRegisterByTransactionId(TEST_TRANSACTION_ID)).toBe(
        TEST_TRANSACTION_ENERGY_WH
      )

      // Stop station
      await station.stop()
      expect(station.started).toBe(false)

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
      expect(mocks.webSocket.sentMessages.length).toBe(1)

      // Simulate connection close
      mocks.webSocket.simulateClose(1006, 'Connection lost')
      expect(mocks.webSocket.readyState).toBe(WebSocketReadyState.CLOSED)

      // Buffer messages while disconnected
      station.bufferMessage('["2","uuid-2","StatusNotification",{}]')
      expect(station.messageQueue.length).toBe(1)

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
      expect(station.hasEvses).toBe(true)
      expect(station.getEvseIdByConnectorId(1)).toBe(1)

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
      expect(found).toBeDefined()
      expect(found?.idTag).toBe('RESERVATION-TAG')

      // Check reservability
      expect(station.isConnectorReservable(1)).toBe(false)
      expect(station.isConnectorReservable(999)).toBe(true)

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
      expect(station.inPendingState()).toBe(true)
      expect(station.getHeartbeatInterval()).toBe(120000)

      // Transition to accepted
      station.bootNotificationResponse = {
        currentTime: new Date(),
        interval: 60,
        status: RegistrationStatusEnumType.ACCEPTED,
      }

      // Verify state change
      expect(station.inAcceptedState()).toBe(true)
      expect(station.inPendingState()).toBe(false)

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
      expect(mocks1.idTagsCache.getIdTags('test-file.json')).toStrictEqual(['tag1', 'tag2'])

      // Cleanup first station
      cleanupChargingStation(result1.station)

      // Second test - should have fresh mocks
      const result2 = createMockChargingStation()
      const mocks2 = result2.mocks

      // Cache should be fresh (singletons reset in cleanup)
      // The resetInstance is called in cleanup, so new getInstance creates fresh instance
      expect(mocks2.idTagsCache.getIdTags('test-file.json')).toBeUndefined()

      cleanupChargingStation(result2.station)
    })
  })
})
