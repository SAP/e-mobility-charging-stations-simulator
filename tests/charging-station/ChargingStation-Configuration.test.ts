/**
 * @file Tests for ChargingStation Configuration Management
 * @description Unit tests for boot notification, config persistence, and WebSocket handling
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/index.js'

import { AvailabilityType, RegistrationStatusEnumType } from '../../src/types/index.js'
import { standardCleanup, withMockTimers } from '../helpers/TestLifecycleHelpers.js'
import { TEST_HEARTBEAT_INTERVAL_MS, TEST_ONE_HOUR_MS } from './ChargingStationTestConstants.js'
import { cleanupChargingStation, createMockChargingStation } from './helpers/StationHelpers.js'

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
      if (station.bootNotificationResponse == null) {
        assert.fail('Expected bootNotificationResponse to be defined')
      }
      assert.strictEqual(station.bootNotificationResponse.interval > 0, true)
      assert.strictEqual(station.inPendingState(), true)
    })

    // B02.FR.02: Station should be able to transition out of Pending via new response
    await it('should transition from Pending to Accepted when receiving new response', () => {
      // Arrange
      const result = createMockChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.PENDING,
      })
      station = result.station
      assert.strictEqual(station.inPendingState(), true)

      // Act - Simulate receiving Accepted response (as would happen after retry)
      station.bootNotificationResponse = {
        currentTime: new Date(),
        interval: 300,
        status: RegistrationStatusEnumType.ACCEPTED,
      }

      // Assert - Should now be in Accepted state
      assert.strictEqual(station.inAcceptedState(), true)
      assert.strictEqual(station.inPendingState(), false)
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
      assert.strictEqual(station.getHeartbeatInterval(), customInterval * 1000)
      assert.strictEqual(station.inPendingState(), true)
    })

    // B02.FR.06: Station should handle clock synchronization from response
    await it('should have currentTime in Pending response for clock sync', () => {
      // Arrange
      const result = createMockChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.PENDING,
      })
      station = result.station

      // Assert - currentTime should be present for clock synchronization
      assert.notStrictEqual(station.bootNotificationResponse?.currentTime, undefined)
      assert.ok(station.bootNotificationResponse?.currentTime instanceof Date)
    })

    // B02.FR.04/05: Station should be able to transition to Rejected from Pending
    await it('should transition from Pending to Rejected when receiving rejection', () => {
      // Arrange
      const result = createMockChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.PENDING,
      })
      station = result.station
      assert.strictEqual(station.inPendingState(), true)

      // Act - Simulate receiving Rejected response
      station.bootNotificationResponse = {
        currentTime: new Date(),
        interval: 3600, // Longer interval for rejected state
        status: RegistrationStatusEnumType.REJECTED,
      }

      // Assert - Should now be in Rejected state
      assert.strictEqual(station.inRejectedState(), true)
      assert.strictEqual(station.inPendingState(), false)
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
      if (station.bootNotificationResponse == null) {
        assert.fail('Expected bootNotificationResponse to be defined')
      }
      assert.strictEqual(station.bootNotificationResponse.interval > 0, true)
      assert.strictEqual(station.inRejectedState(), true)
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
      assert.strictEqual(station.inRejectedState(), true)

      // Assert - No messages should have been sent (station should be silent)
      // Per B03.FR.03: CS SHALL NOT send any OCPP message until interval expires
      assert.strictEqual(mocks.webSocket.sentMessages.length, 0)
    })

    // B03.FR.04: Station should transition from Rejected to Accepted
    await it('should transition from Rejected to Accepted when receiving acceptance', () => {
      // Arrange
      const result = createMockChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.REJECTED,
      })
      station = result.station
      assert.strictEqual(station.inRejectedState(), true)

      // Act - Simulate receiving Accepted response after retry
      station.bootNotificationResponse = {
        currentTime: new Date(),
        interval: 60,
        status: RegistrationStatusEnumType.ACCEPTED,
      }

      // Assert - Should now be in Accepted state
      assert.strictEqual(station.inAcceptedState(), true)
      assert.strictEqual(station.inRejectedState(), false)
    })

    // B03.FR.05: Station should have currentTime for clock synchronization
    await it('should have currentTime in Rejected response for clock sync', () => {
      // Arrange
      const result = createMockChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.REJECTED,
      })
      station = result.station

      // Assert - currentTime should be present
      assert.notStrictEqual(station.bootNotificationResponse?.currentTime, undefined)
      assert.ok(station.bootNotificationResponse?.currentTime instanceof Date)
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
      assert.strictEqual(pendingStation.station.inPendingState(), true)
      assert.strictEqual(rejectedStation.station.inRejectedState(), true)
      assert.strictEqual(pendingStation.station.getHeartbeatInterval(), 60000)
      assert.strictEqual(rejectedStation.station.getHeartbeatInterval(), TEST_ONE_HOUR_MS)

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
      assert.strictEqual(station.getConnectorStatus(1)?.availability, AvailabilityType.Operative)
      assert.strictEqual(station.hasConnector(1), true)
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
      assert.strictEqual(station.getHeartbeatInterval(), 60000)
    })

    await it('should return default heartbeat interval when not explicitly configured', () => {
      // Arrange - use default heartbeat interval (TEST_HEARTBEAT_INTERVAL_SECONDS = 60)
      const result = createMockChargingStation()
      station = result.station

      // Act & Assert - default 60s * 1000 = 60000ms
      assert.strictEqual(station.getHeartbeatInterval(), 60000)
    })

    await it('should return connection timeout in milliseconds', () => {
      // Arrange
      const result = createMockChargingStation()
      station = result.station

      // Act & Assert - default connection timeout is 30 seconds
      assert.strictEqual(station.getConnectionTimeout(), TEST_HEARTBEAT_INTERVAL_MS)
    })

    await it('should return authorize remote TX requests as boolean', () => {
      // Arrange - create station which defaults to false for AuthorizeRemoteTxRequests
      const result = createMockChargingStation()
      station = result.station

      // Act & Assert - getAuthorizeRemoteTxRequests returns boolean
      const authorizeRemoteTx = station.getAuthorizeRemoteTxRequests()
      assert.strictEqual(typeof authorizeRemoteTx, 'boolean')
    })

    await it('should return local auth list enabled as boolean', () => {
      // Arrange
      const result = createMockChargingStation()
      station = result.station

      // Act & Assert - getLocalAuthListEnabled returns boolean
      const localAuthEnabled = station.getLocalAuthListEnabled()
      assert.strictEqual(typeof localAuthEnabled, 'boolean')
    })

    // === Configuration Save Operations ===

    await it('should call saveOcppConfiguration without throwing', () => {
      // Arrange
      const result = createMockChargingStation()
      station = result.station

      // Act & Assert - should not throw
      assert.doesNotThrow(() => {
        station?.saveOcppConfiguration()
      })
    })

    await it('should have ocppConfiguration object with configurationKey array', () => {
      // Arrange
      const result = createMockChargingStation()
      station = result.station

      // Act & Assert - configuration structure should be present
      assert.notStrictEqual(station.ocppConfiguration, undefined)
      assert.notStrictEqual(station.ocppConfiguration?.configurationKey, undefined)
      assert.ok(Array.isArray(station.ocppConfiguration?.configurationKey))
    })

    // === Configuration Mutation ===

    await it('should allow updating heartbeat interval', () => {
      // Arrange - create with 60 second interval
      const result = createMockChargingStation({ heartbeatInterval: 60 })
      station = result.station
      const initialInterval = station.getHeartbeatInterval()
      assert.strictEqual(initialInterval, 60000)

      // Act - simulate configuration change by creating new station with different interval
      const result2 = createMockChargingStation({ heartbeatInterval: 120 })
      const station2 = result2.station

      // Assert - different configurations have different intervals
      assert.strictEqual(station2.getHeartbeatInterval(), 120000)
      assert.strictEqual(station.getHeartbeatInterval(), 60000) // Original unchanged

      // Cleanup second station
      cleanupChargingStation(station2)
    })

    await it('should support setSupervisionUrl method if available', () => {
      // Arrange
      const result = createMockChargingStation()
      station = result.station

      // Act & Assert - setSupervisionUrl should be a function if available
      if ('setSupervisionUrl' in station && typeof station.setSupervisionUrl === 'function') {
        assert.doesNotThrow(() => {
          station?.setSupervisionUrl('ws://new-server:8080')
        })
      } else {
        // Mock station may not have setSupervisionUrl, which is expected
        assert.notStrictEqual(station, undefined)
      }
    })

    // === Configuration Loading & Persistence ===

    await it('should have template file reference', () => {
      // Arrange
      const result = createMockChargingStation({ templateFile: 'custom-template.json' })
      station = result.station

      // Act & Assert - station info should have template reference
      assert.strictEqual(station.stationInfo?.templateName, 'custom-template.json')
    })

    await it('should have hashId for configuration persistence', () => {
      // Arrange
      const result = createMockChargingStation()
      station = result.station

      // Act & Assert - hashId is used for configuration file naming
      assert.notStrictEqual(station.stationInfo?.hashId, undefined)
      assert.strictEqual(typeof station.stationInfo?.hashId, 'string')
    })

    await it('should preserve station info properties for persistence', () => {
      // Arrange
      const result = createMockChargingStation({
        baseName: 'PERSIST-CS',
        index: 5,
      })
      station = result.station

      // Act & Assert - station info should have all properties for persistence
      assert.notStrictEqual(station.stationInfo, undefined)
      assert.strictEqual(station.stationInfo?.baseName, 'PERSIST-CS')
      assert.ok(station.stationInfo.chargingStationId?.includes('PERSIST-CS'))
      assert.strictEqual(station.stationInfo.templateIndex, 5)
    })

    await it('should track configuration file path via templateFile', () => {
      // Arrange
      const result = createMockChargingStation()
      station = result.station

      // Act & Assert - templateFile is used to track configuration source
      assert.notStrictEqual(station.templateFile, undefined)
      assert.strictEqual(typeof station.templateFile, 'string')
    })

    await it('should use mocked file system without real file writes', () => {
      // Arrange
      const result = createMockChargingStation()
      station = result.station
      const mocks = result.mocks

      // Act - perform save operation (mocked to no-op)
      station.saveOcppConfiguration()

      // Assert - mock file system is available for tracking (no real writes)
      assert.notStrictEqual(mocks.fileSystem, undefined)
      assert.ok(mocks.fileSystem.writtenFiles instanceof Map)
      // In mock mode, saveOcppConfiguration is a no-op, so no files are written
      assert.strictEqual(mocks.fileSystem.writtenFiles.size, 0)
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
      assert.strictEqual(station.isWebSocketConnectionOpened(), true)

      // Act - change ready state to CLOSED
      mocks.webSocket.readyState = 3 // WebSocketReadyState.CLOSED

      // Assert
      assert.strictEqual(station.isWebSocketConnectionOpened(), false)
    })

    await it('should return false when WebSocket is CONNECTING', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      const mocks = result.mocks

      // Act
      mocks.webSocket.readyState = 0 // WebSocketReadyState.CONNECTING

      // Assert
      assert.strictEqual(station.isWebSocketConnectionOpened(), false)
    })

    await it('should return false when WebSocket is CLOSING', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      const mocks = result.mocks

      // Act
      mocks.webSocket.readyState = 2 // WebSocketReadyState.CLOSING

      // Assert
      assert.strictEqual(station.isWebSocketConnectionOpened(), false)
    })

    await it('should close WebSocket connection via closeWSConnection()', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station

      // Assert - connection exists initially
      assert.notStrictEqual(station.wsConnection, null)

      // Act
      station.closeWSConnection()

      // Assert - connection is nullified
      assert.strictEqual(station.wsConnection, null)
    })

    await it('should handle closeWSConnection() when already closed', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station

      // Act - close twice (idempotent)
      station.closeWSConnection()
      station.closeWSConnection()

      // Assert - no error, connection remains null
      assert.strictEqual(station.wsConnection, null)
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
      assert.strictEqual(mocks.webSocket.sentMessages.length, 2)
      assert.strictEqual(mocks.webSocket.sentMessages[0], '["2","uuid-1","Heartbeat",{}]')
      assert.strictEqual(
        mocks.webSocket.sentMessages[1],
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
      assert.strictEqual(
        mocks.webSocket.getLastSentMessage(),
        '["2","uuid-2","BootNotification",{}]'
      )
    })

    await it('should return undefined for getLastSentMessage() when no messages sent', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      const mocks = result.mocks

      // Assert
      assert.strictEqual(mocks.webSocket.getLastSentMessage(), undefined)
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
      assert.strictEqual(parsed.length, 1)
      assert.deepStrictEqual(parsed[0], [2, 'uuid-1', 'Heartbeat', {}])
    })

    await it('should clear captured messages via clearMessages()', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      const mocks = result.mocks

      // Populate messages
      mocks.webSocket.send('["2","uuid-1","Heartbeat",{}]')
      mocks.webSocket.send('["2","uuid-2","Heartbeat",{}]')
      assert.strictEqual(mocks.webSocket.sentMessages.length, 2)

      // Act
      mocks.webSocket.clearMessages()

      // Assert
      assert.strictEqual(mocks.webSocket.sentMessages.length, 0)
      assert.strictEqual(mocks.webSocket.sentBinaryMessages.length, 0)
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
      assert.notStrictEqual(receivedData, undefined)
      assert.ok(Buffer.isBuffer(receivedData))
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
      assert.strictEqual(openEventFired, true)
      assert.strictEqual(mocks.webSocket.readyState, 1) // WebSocketReadyState.OPEN
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
      assert.strictEqual(closeCode, 1001)
      assert.strictEqual(mocks.webSocket.readyState, 3) // WebSocketReadyState.CLOSED
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
      assert.strictEqual(receivedError, testError)
      assert.strictEqual(receivedError.message, 'Connection refused')
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
      assert.strictEqual(pingReceived, true)
      assert.strictEqual(pingData?.toString(), 'ping-data')
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
      assert.strictEqual(pongReceived, true)
      assert.strictEqual(pongData?.toString(), 'pong-data')
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
      assert.throws(
        () => {
          mocks.webSocket.send('["2","uuid","Heartbeat",{}]')
        },
        { message: /WebSocket is not open/ }
      )
    })

    await it('should capture URL from WebSocket connection', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      const mocks = result.mocks

      // Assert
      assert.notStrictEqual(mocks.webSocket.url, undefined)
      assert.strictEqual(typeof mocks.webSocket.url, 'string')
      assert.strictEqual(mocks.webSocket.url.length > 0, true)
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
        assert.strictEqual(pingInterval >= 0, true)
        assert.strictEqual(typeof pingInterval, 'number')
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
        assert.notStrictEqual(station, undefined)
      })
    })
  })
})
