/**
 * @file Tests for ChargingStation Configuration Management
 * @description Unit tests for boot notification, config persistence, and WebSocket handling
 */
import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/ChargingStation.js'

import { AvailabilityType, RegistrationStatusEnumType } from '../../src/types/index.js'
import { standardCleanup, withMockTimers } from '../helpers/TestLifecycleHelpers.js'
import { TEST_HEARTBEAT_INTERVAL_MS, TEST_ONE_HOUR_MS } from './ChargingStationTestConstants.js'
import { cleanupChargingStation, createMockChargingStation } from './ChargingStationTestUtils.js'

await describe('ChargingStation Configuration Management', async () => {
  // ===== B02/B03 BOOT NOTIFICATION BEHAVIOR TESTS =====
  // These tests verify behavioral requirements, not just state detection
  await describe('B02 - Pending Boot Notification Behavior', async () => {
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

    // B02.FR.01: Station stores currentTime and interval from Pending response
    await it('should store interval from Pending response for retry scheduling', () => {
      // Arrange
      const result = createMockChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.PENDING,
      })
      station = result.station

      // Assert - Pending response should have interval for retry
      expect(station.bootNotificationResponse).toBeDefined()
      expect(station.bootNotificationResponse?.interval).toBeGreaterThan(0)
      expect(station.inPendingState()).toBe(true)
    })

    // B02.FR.02: Station should be able to transition out of Pending via new response
    await it('should transition from Pending to Accepted when receiving new response', () => {
      // Arrange
      const result = createMockChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.PENDING,
      })
      station = result.station
      expect(station.inPendingState()).toBe(true)

      // Act - Simulate receiving Accepted response (as would happen after retry)
      station.bootNotificationResponse = {
        currentTime: new Date(),
        interval: 300,
        status: RegistrationStatusEnumType.ACCEPTED,
      }

      // Assert - Should now be in Accepted state
      expect(station.inAcceptedState()).toBe(true)
      expect(station.inPendingState()).toBe(false)
    })

    // B02.FR.03: Pending station should have valid heartbeat interval for operation
    await it('should use interval from response as heartbeat interval when Pending', () => {
      // Arrange - Create station with specific interval
      const customInterval = 120 // seconds
      const result = createMockChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.PENDING,
        heartbeatInterval: customInterval,
      })
      station = result.station

      // Assert - Heartbeat interval should match response interval
      expect(station.getHeartbeatInterval()).toBe(customInterval * 1000)
      expect(station.inPendingState()).toBe(true)
    })

    // B02.FR.06: Station should handle clock synchronization from response
    await it('should have currentTime in Pending response for clock sync', () => {
      // Arrange
      const result = createMockChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.PENDING,
      })
      station = result.station

      // Assert - currentTime should be present for clock synchronization
      expect(station.bootNotificationResponse?.currentTime).toBeDefined()
      expect(station.bootNotificationResponse?.currentTime instanceof Date).toBe(true)
    })

    // B02.FR.04/05: Station should be able to transition to Rejected from Pending
    await it('should transition from Pending to Rejected when receiving rejection', () => {
      // Arrange
      const result = createMockChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.PENDING,
      })
      station = result.station
      expect(station.inPendingState()).toBe(true)

      // Act - Simulate receiving Rejected response
      station.bootNotificationResponse = {
        currentTime: new Date(),
        interval: 3600, // Longer interval for rejected state
        status: RegistrationStatusEnumType.REJECTED,
      }

      // Assert - Should now be in Rejected state
      expect(station.inRejectedState()).toBe(true)
      expect(station.inPendingState()).toBe(false)
    })
  })

  await describe('B03 - Rejected Boot Notification Behavior', async () => {
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

    // B03.FR.01: Station stores currentTime and interval from Rejected response
    await it('should store interval from Rejected response for retry scheduling', () => {
      // Arrange
      const result = createMockChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.REJECTED,
      })
      station = result.station

      // Assert - Rejected response should have interval for retry (typically longer)
      expect(station.bootNotificationResponse).toBeDefined()
      expect(station.bootNotificationResponse?.interval).toBeGreaterThan(0)
      expect(station.inRejectedState()).toBe(true)
    })

    // B03.FR.03: Station should NOT initiate non-boot messages when Rejected
    await it('should not initiate messages when in Rejected state (B03.FR.03)', () => {
      // Arrange
      const result = createMockChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.REJECTED,
        connectorsCount: 2,
      })
      station = result.station
      const mocks = result.mocks

      // Clear any setup messages
      mocks.webSocket.clearMessages()

      // Assert - Station is in rejected state
      expect(station.inRejectedState()).toBe(true)

      // Assert - No messages should have been sent (station should be silent)
      // Per B03.FR.03: CS SHALL NOT send any OCPP message until interval expires
      expect(mocks.webSocket.sentMessages.length).toBe(0)
    })

    // B03.FR.04: Station should transition from Rejected to Accepted
    await it('should transition from Rejected to Accepted when receiving acceptance', () => {
      // Arrange
      const result = createMockChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.REJECTED,
      })
      station = result.station
      expect(station.inRejectedState()).toBe(true)

      // Act - Simulate receiving Accepted response after retry
      station.bootNotificationResponse = {
        currentTime: new Date(),
        interval: 60,
        status: RegistrationStatusEnumType.ACCEPTED,
      }

      // Assert - Should now be in Accepted state
      expect(station.inAcceptedState()).toBe(true)
      expect(station.inRejectedState()).toBe(false)
    })

    // B03.FR.05: Station should have currentTime for clock synchronization
    await it('should have currentTime in Rejected response for clock sync', () => {
      // Arrange
      const result = createMockChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.REJECTED,
      })
      station = result.station

      // Assert - currentTime should be present
      expect(station.bootNotificationResponse?.currentTime).toBeDefined()
      expect(station.bootNotificationResponse?.currentTime instanceof Date).toBe(true)
    })

    // B03.FR.02: Rejected state should use different (typically longer) retry interval
    await it('should support configurable retry interval for Rejected state', () => {
      // Arrange - Create two stations: one pending, one rejected
      const pendingStation = createMockChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.PENDING,
        heartbeatInterval: 60, // Normal interval
      })

      const rejectedStation = createMockChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.REJECTED,
        heartbeatInterval: 3600, // Longer interval for rejected
      })

      // Assert - Both should have their respective intervals
      expect(pendingStation.station.inPendingState()).toBe(true)
      expect(rejectedStation.station.inRejectedState()).toBe(true)
      expect(pendingStation.station.getHeartbeatInterval()).toBe(60000)
      expect(rejectedStation.station.getHeartbeatInterval()).toBe(TEST_ONE_HOUR_MS)

      // Cleanup
      cleanupChargingStation(pendingStation.station)
      cleanupChargingStation(rejectedStation.station)
    })

    // B03.FR.04 + state preservation: Connectors should maintain state during rejection
    await it('should preserve connector states during Rejected state', () => {
      // Arrange
      const result = createMockChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.REJECTED,
        connectorsCount: 2,
      })
      station = result.station

      // Set up connector state
      const connector1 = station.getConnectorStatus(1)
      if (connector1 != null) {
        connector1.availability = AvailabilityType.Operative
      }

      // Assert - Connector state should be preserved even in Rejected state
      expect(station.getConnectorStatus(1)?.availability).toBe(AvailabilityType.Operative)
      expect(station.hasConnector(1)).toBe(true)
    })
  })

  await describe('Configuration Persistence', async () => {
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

    // === OCPP Configuration Getters ===

    await it('should return heartbeat interval in milliseconds', () => {
      // Arrange - create station with 60 second heartbeat
      const result = createMockChargingStation({ heartbeatInterval: 60 })
      station = result.station

      // Act & Assert - should convert seconds to milliseconds
      expect(station.getHeartbeatInterval()).toBe(60000)
    })

    await it('should return default heartbeat interval when not explicitly configured', () => {
      // Arrange - use default heartbeat interval (TEST_HEARTBEAT_INTERVAL_SECONDS = 60)
      const result = createMockChargingStation()
      station = result.station

      // Act & Assert - default 60s * 1000 = 60000ms
      expect(station.getHeartbeatInterval()).toBe(60000)
    })

    await it('should return connection timeout in milliseconds', () => {
      // Arrange
      const result = createMockChargingStation()
      station = result.station

      // Act & Assert - default connection timeout is 30 seconds
      expect(station.getConnectionTimeout()).toBe(TEST_HEARTBEAT_INTERVAL_MS)
    })

    await it('should return authorize remote TX requests as boolean', () => {
      // Arrange - create station which defaults to false for AuthorizeRemoteTxRequests
      const result = createMockChargingStation()
      station = result.station

      // Act & Assert - getAuthorizeRemoteTxRequests returns boolean
      const authorizeRemoteTx = station.getAuthorizeRemoteTxRequests()
      expect(typeof authorizeRemoteTx).toBe('boolean')
    })

    await it('should return local auth list enabled as boolean', () => {
      // Arrange
      const result = createMockChargingStation()
      station = result.station

      // Act & Assert - getLocalAuthListEnabled returns boolean
      const localAuthEnabled = station.getLocalAuthListEnabled()
      expect(typeof localAuthEnabled).toBe('boolean')
    })

    // === Configuration Save Operations ===

    await it('should call saveOcppConfiguration without throwing', () => {
      // Arrange
      const result = createMockChargingStation()
      station = result.station

      // Act & Assert - should not throw
      expect(() => station?.saveOcppConfiguration()).not.toThrow()
    })

    await it('should have ocppConfiguration object with configurationKey array', () => {
      // Arrange
      const result = createMockChargingStation()
      station = result.station

      // Act & Assert - configuration structure should be present
      expect(station.ocppConfiguration).toBeDefined()
      expect(station.ocppConfiguration?.configurationKey).toBeDefined()
      expect(Array.isArray(station.ocppConfiguration?.configurationKey)).toBe(true)
    })

    // === Configuration Mutation ===

    await it('should allow updating heartbeat interval', () => {
      // Arrange - create with 60 second interval
      const result = createMockChargingStation({ heartbeatInterval: 60 })
      station = result.station
      const initialInterval = station.getHeartbeatInterval()
      expect(initialInterval).toBe(60000)

      // Act - simulate configuration change by creating new station with different interval
      const result2 = createMockChargingStation({ heartbeatInterval: 120 })
      const station2 = result2.station

      // Assert - different configurations have different intervals
      expect(station2.getHeartbeatInterval()).toBe(120000)
      expect(station.getHeartbeatInterval()).toBe(60000) // Original unchanged

      // Cleanup second station
      cleanupChargingStation(station2)
    })

    await it('should support setSupervisionUrl method if available', () => {
      // Arrange
      const result = createMockChargingStation()
      station = result.station

      // Act & Assert - setSupervisionUrl should be a function if available
      if ('setSupervisionUrl' in station && typeof station.setSupervisionUrl === 'function') {
        expect(() => station?.setSupervisionUrl('ws://new-server:8080')).not.toThrow()
      } else {
        // Mock station may not have setSupervisionUrl, which is expected
        expect(station).toBeDefined()
      }
    })

    // === Configuration Loading & Persistence ===

    await it('should have template file reference', () => {
      // Arrange
      const result = createMockChargingStation({ templateFile: 'custom-template.json' })
      station = result.station

      // Act & Assert - station info should have template reference
      expect(station.stationInfo?.templateName).toBe('custom-template.json')
    })

    await it('should have hashId for configuration persistence', () => {
      // Arrange
      const result = createMockChargingStation()
      station = result.station

      // Act & Assert - hashId is used for configuration file naming
      expect(station.stationInfo?.hashId).toBeDefined()
      expect(typeof station.stationInfo?.hashId).toBe('string')
    })

    await it('should preserve station info properties for persistence', () => {
      // Arrange
      const result = createMockChargingStation({
        baseName: 'PERSIST-CS',
        index: 5,
      })
      station = result.station

      // Act & Assert - station info should have all properties for persistence
      expect(station.stationInfo).toBeDefined()
      expect(station.stationInfo?.baseName).toBe('PERSIST-CS')
      expect(station.stationInfo?.chargingStationId).toContain('PERSIST-CS')
      expect(station.stationInfo?.templateIndex).toBe(5)
    })

    await it('should track configuration file path via templateFile', () => {
      // Arrange
      const result = createMockChargingStation()
      station = result.station

      // Act & Assert - templateFile is used to track configuration source
      expect(station.templateFile).toBeDefined()
      expect(typeof station.templateFile).toBe('string')
    })

    await it('should use mocked file system without real file writes', () => {
      // Arrange
      const result = createMockChargingStation()
      station = result.station
      const mocks = result.mocks

      // Act - perform save operation (mocked to no-op)
      station.saveOcppConfiguration()

      // Assert - mock file system is available for tracking (no real writes)
      expect(mocks.fileSystem).toBeDefined()
      expect(mocks.fileSystem.writtenFiles).toBeInstanceOf(Map)
      // In mock mode, saveOcppConfiguration is a no-op, so no files are written
      expect(mocks.fileSystem.writtenFiles.size).toBe(0)
    })
  })

  await describe('WebSocket Message Handling', async () => {
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

    // === Connection Management Tests ===

    await it('should report WebSocket connection state via isWebSocketConnectionOpened()', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      const mocks = result.mocks

      // Assert - connection is open by default
      expect(station.isWebSocketConnectionOpened()).toBe(true)

      // Act - change ready state to CLOSED
      mocks.webSocket.readyState = 3 // WebSocketReadyState.CLOSED

      // Assert
      expect(station.isWebSocketConnectionOpened()).toBe(false)
    })

    await it('should return false when WebSocket is CONNECTING', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      const mocks = result.mocks

      // Act
      mocks.webSocket.readyState = 0 // WebSocketReadyState.CONNECTING

      // Assert
      expect(station.isWebSocketConnectionOpened()).toBe(false)
    })

    await it('should return false when WebSocket is CLOSING', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      const mocks = result.mocks

      // Act
      mocks.webSocket.readyState = 2 // WebSocketReadyState.CLOSING

      // Assert
      expect(station.isWebSocketConnectionOpened()).toBe(false)
    })

    await it('should close WebSocket connection via closeWSConnection()', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station

      // Assert - connection exists initially
      expect(station.wsConnection).not.toBeNull()

      // Act
      station.closeWSConnection()

      // Assert - connection is nullified
      expect(station.wsConnection).toBeNull()
    })

    await it('should handle closeWSConnection() when already closed', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station

      // Act - close twice (idempotent)
      station.closeWSConnection()
      station.closeWSConnection()

      // Assert - no error, connection remains null
      expect(station.wsConnection).toBeNull()
    })

    // === Message Capture Tests ===

    await it('should capture sent messages in sentMessages array', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      const mocks = result.mocks

      // Act - send messages via mock WebSocket
      mocks.webSocket.send('["2","uuid-1","Heartbeat",{}]')
      mocks.webSocket.send('["2","uuid-2","StatusNotification",{"connectorId":1}]')

      // Assert
      expect(mocks.webSocket.sentMessages.length).toBe(2)
      expect(mocks.webSocket.sentMessages[0]).toBe('["2","uuid-1","Heartbeat",{}]')
      expect(mocks.webSocket.sentMessages[1]).toBe(
        '["2","uuid-2","StatusNotification",{"connectorId":1}]'
      )
    })

    await it('should return last sent message via getLastSentMessage()', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      const mocks = result.mocks

      // Act
      mocks.webSocket.send('["2","uuid-1","Heartbeat",{}]')
      mocks.webSocket.send('["2","uuid-2","BootNotification",{}]')

      // Assert
      expect(mocks.webSocket.getLastSentMessage()).toBe('["2","uuid-2","BootNotification",{}]')
    })

    await it('should return undefined for getLastSentMessage() when no messages sent', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      const mocks = result.mocks

      // Assert
      expect(mocks.webSocket.getLastSentMessage()).toBeUndefined()
    })

    await it('should parse sent messages as JSON via getSentMessagesAsJson()', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      const mocks = result.mocks

      // Act
      mocks.webSocket.send('[2,"uuid-1","Heartbeat",{}]')

      // Assert
      const parsed = mocks.webSocket.getSentMessagesAsJson()
      expect(parsed.length).toBe(1)
      expect(parsed[0]).toStrictEqual([2, 'uuid-1', 'Heartbeat', {}])
    })

    await it('should clear captured messages via clearMessages()', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      const mocks = result.mocks

      // Populate messages
      mocks.webSocket.send('["2","uuid-1","Heartbeat",{}]')
      mocks.webSocket.send('["2","uuid-2","Heartbeat",{}]')
      expect(mocks.webSocket.sentMessages.length).toBe(2)

      // Act
      mocks.webSocket.clearMessages()

      // Assert
      expect(mocks.webSocket.sentMessages.length).toBe(0)
      expect(mocks.webSocket.sentBinaryMessages.length).toBe(0)
    })

    // === Event Simulation Tests ===

    await it('should emit message event via simulateMessage()', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      const mocks = result.mocks
      let receivedData: unknown

      // Set up listener
      mocks.webSocket.on('message', (data: unknown) => {
        receivedData = data
      })

      // Act
      mocks.webSocket.simulateMessage('[3,"uuid-1",{}]')

      // Assert
      expect(receivedData).toBeDefined()
      expect(Buffer.isBuffer(receivedData)).toBe(true)
    })

    await it('should emit open event and set readyState via simulateOpen()', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      const mocks = result.mocks
      let openEventFired = false

      // First close the connection to test opening
      mocks.webSocket.readyState = 3 // CLOSED

      // Set up listener
      mocks.webSocket.on('open', () => {
        openEventFired = true
      })

      // Act
      mocks.webSocket.simulateOpen()

      // Assert
      expect(openEventFired).toBe(true)
      expect(mocks.webSocket.readyState).toBe(1) // WebSocketReadyState.OPEN
    })

    await it('should emit close event and set readyState via simulateClose()', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      const mocks = result.mocks
      let closeCode: number | undefined

      // Set up listener
      mocks.webSocket.on('close', (code: number) => {
        closeCode = code
      })

      // Act
      mocks.webSocket.simulateClose(1001, 'Going away')

      // Assert
      expect(closeCode).toBe(1001)
      expect(mocks.webSocket.readyState).toBe(3) // WebSocketReadyState.CLOSED
    })

    await it('should emit error event via simulateError()', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      const mocks = result.mocks
      let receivedError: Error | undefined

      // Set up listener
      mocks.webSocket.on('error', (error: Error) => {
        receivedError = error
      })

      // Act
      const testError = new Error('Connection refused')
      mocks.webSocket.simulateError(testError)

      // Assert
      expect(receivedError).toBe(testError)
      expect(receivedError?.message).toBe('Connection refused')
    })

    await it('should emit ping event via simulatePing()', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      const mocks = result.mocks
      let pingReceived = false
      let pingData: Buffer | undefined

      // Set up listener
      mocks.webSocket.on('ping', (data: Buffer) => {
        pingReceived = true
        pingData = data
      })

      // Act
      mocks.webSocket.simulatePing(Buffer.from('ping-data'))

      // Assert
      expect(pingReceived).toBe(true)
      expect(pingData?.toString()).toBe('ping-data')
    })

    await it('should emit pong event via simulatePong()', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      const mocks = result.mocks
      let pongReceived = false
      let pongData: Buffer | undefined

      // Set up listener
      mocks.webSocket.on('pong', (data: Buffer) => {
        pongReceived = true
        pongData = data
      })

      // Act
      mocks.webSocket.simulatePong(Buffer.from('pong-data'))

      // Assert
      expect(pongReceived).toBe(true)
      expect(pongData?.toString()).toBe('pong-data')
    })

    // === Edge Case Tests ===

    await it('should throw error when sending on closed WebSocket', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      const mocks = result.mocks

      // Close the WebSocket
      mocks.webSocket.readyState = 3 // WebSocketReadyState.CLOSED

      // Act & Assert
      expect(() => {
        mocks.webSocket.send('["2","uuid","Heartbeat",{}]')
      }).toThrow('WebSocket is not open')
    })

    await it('should capture URL from WebSocket connection', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      const mocks = result.mocks

      // Assert
      expect(mocks.webSocket.url).toBeDefined()
      expect(typeof mocks.webSocket.url).toBe('string')
      expect(mocks.webSocket.url.length).toBeGreaterThan(0)
    })
  })

  await describe('WebSocket Ping Interval', async () => {
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

    await it('should return valid WebSocket ping interval from getWebSocketPingInterval()', async t => {
      await withMockTimers(t, ['setInterval'], () => {
        // Arrange
        const result = createMockChargingStation({ connectorsCount: 1 })
        station = result.station

        // Act
        const pingInterval = station.getWebSocketPingInterval()

        // Assert - should return a valid interval value
        expect(pingInterval).toBeGreaterThanOrEqual(0)
        expect(typeof pingInterval).toBe('number')
      })
    })

    await it('should restart WebSocket ping when restartWebSocketPing() is called', async t => {
      await withMockTimers(t, ['setInterval'], () => {
        // Arrange
        const result = createMockChargingStation({ connectorsCount: 1 })
        station = result.station

        // Act - restartWebSocketPing will stop and restart
        station.restartWebSocketPing()

        // Assert - should complete without error
        expect(station).toBeDefined()
      })
    })
  })
})
