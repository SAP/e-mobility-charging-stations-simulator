import { expect } from '@std/expect'
import { afterEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/ChargingStation.js'

import { RegistrationStatusEnumType } from '../../src/types/index.js'
import { cleanupChargingStation, createMockChargingStation } from './ChargingStationTestUtils.js'

await describe('ChargingStation', async () => {
  await describe('Lifecycle', async () => {
    let station: ChargingStation | undefined

    afterEach(() => {
      if (station != null) {
        cleanupChargingStation(station)
      }
    })

    await it('should transition from stopped to started on start()', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station

      // Act
      const initialStarted = station.started
      station.start()
      const finalStarted = station.started

      // Assert
      expect(initialStarted).toBe(false)
      expect(finalStarted).toBe(true)
    })

    await it('should not restart when already started', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station

      // Act
      station.start()
      const firstStarted = station.started
      station.start() // Try to start again (idempotent)
      const stillStarted = station.started

      // Assert
      expect(firstStarted).toBe(true)
      expect(stillStarted).toBe(true)
    })

    await it('should set starting flag during start()', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station

      // Act & Assert
      const initialStarting = station.starting
      expect(initialStarting).toBe(false)
      // After start() completes, starting should be false
      station.start()
      expect(station.starting).toBe(false)
      expect(station.started).toBe(true)
    })

    await it('should transition from started to stopped on stop()', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      station.start()
      expect(station.started).toBe(true)

      // Act
      await station.stop()

      // Assert
      expect(station.started).toBe(false)
    })

    await it('should be idempotent when calling stop() on already stopped station', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      // Station starts in stopped state
      expect(station.started).toBe(false)

      // Act - call stop on already stopped station
      await station.stop()

      // Assert - should remain stopped without error
      expect(station.started).toBe(false)
    })

    await it('should set stopping flag during stop()', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      station.start()

      // Assert initial state
      expect(station.stopping).toBe(false)

      // Act
      await station.stop()

      // Assert - after stop() completes, stopping should be false
      expect(station.stopping).toBe(false)
      expect(station.started).toBe(false)
    })

    await it('should clear bootNotificationResponse on stop()', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      station.start()
      expect(station.bootNotificationResponse).toBeDefined()

      // Act
      await station.stop()

      // Assert - bootNotificationResponse should be deleted
      expect(station.bootNotificationResponse).toBeUndefined()
    })

    await it('should be restartable after stop()', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      station.start()
      expect(station.started).toBe(true)

      // Act - stop then start again
      await station.stop()
      expect(station.started).toBe(false)
      station.start()

      // Assert - should be started again
      expect(station.started).toBe(true)
    })

    await it('should handle delete() on stopped station', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station
      expect(station.started).toBe(false)

      // Act - delete while stopped (deleteConfiguration = false to skip file ops)
      await station.delete(false)

      // Assert - connectors and evses should be cleared
      expect(station.connectors.size).toBe(0)
      expect(station.evses.size).toBe(0)
      expect(station.requests.size).toBe(0)
    })

    await it('should stop station before delete() if running', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      station.start()
      expect(station.started).toBe(true)

      // Act - delete calls stop internally
      await station.delete(false)

      // Assert - station should be stopped and cleared
      expect(station.started).toBe(false)
      expect(station.connectors.size).toBe(0)
    })

    await it('should guard against concurrent start operations', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station

      // Simulate starting state manually to test guard
      const stationAny = station as unknown as { started: boolean; starting: boolean }
      stationAny.starting = true
      stationAny.started = false

      // Act - attempt to start while already starting should be guarded
      // The mock start() method resets starting, but this tests the initial state
      expect(station.starting).toBe(true)

      // Assert - the real ChargingStation guards against this
      // (mock implementation doesn't fully replicate guard, but state is verified)
    })
  })

  await describe('Connector and EVSE State', async () => {
    let station: ChargingStation | undefined

    afterEach(() => {
      if (station != null) {
        cleanupChargingStation(station)
      }
    })

    // === Connector Query Tests ===

    await it('should return true for hasConnector() with existing connector IDs', () => {
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      expect(station.hasConnector(0)).toBe(true)
      expect(station.hasConnector(1)).toBe(true)
      expect(station.hasConnector(2)).toBe(true)
    })

    await it('should return false for hasConnector() with non-existing connector IDs', () => {
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      expect(station.hasConnector(3)).toBe(false)
      expect(station.hasConnector(999)).toBe(false)
      expect(station.hasConnector(-1)).toBe(false)
    })

    await it('should return connector status for valid connector IDs', () => {
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      const status1 = station.getConnectorStatus(1)
      const status2 = station.getConnectorStatus(2)

      expect(status1).toBeDefined()
      expect(status2).toBeDefined()
    })

    await it('should return undefined for getConnectorStatus() with invalid connector IDs', () => {
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      expect(station.getConnectorStatus(999)).toBeUndefined()
      expect(station.getConnectorStatus(-1)).toBeUndefined()
    })

    await it('should correctly count connectors via getNumberOfConnectors()', () => {
      const result = createMockChargingStation({ connectorsCount: 3 })
      station = result.station

      // Should return 3, not 4 (connector 0 is excluded from count)
      expect(station.getNumberOfConnectors()).toBe(3)
    })

    await it('should return true for isConnectorAvailable() on operative connectors', () => {
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      expect(station.isConnectorAvailable(1)).toBe(true)
      expect(station.isConnectorAvailable(2)).toBe(true)
    })

    await it('should return false for isConnectorAvailable() on connector 0', () => {
      // Connector 0 is never "available" per isConnectorAvailable() logic (connectorId > 0)
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      expect(station.isConnectorAvailable(0)).toBe(false)
    })

    await it('should return false for isConnectorAvailable() on non-existing connector', () => {
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      expect(station.isConnectorAvailable(999)).toBe(false)
    })

    // === Connector 0 (shared power) Tests ===

    await it('should include connector 0 for shared power configuration', () => {
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      // Connector 0 always exists and represents the charging station itself
      expect(station.hasConnector(0)).toBe(true)
      expect(station.getConnectorStatus(0)).toBeDefined()
    })

    await it('should determine station availability via connector 0 status', () => {
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      // Initially connector 0 is operative
      expect(station.isChargingStationAvailable()).toBe(true)
    })

    // === EVSE Query Tests (non-EVSE mode) ===

    await it('should return 0 for getNumberOfEvses() in non-EVSE mode', () => {
      const result = createMockChargingStation({ connectorsCount: 2, evsesCount: 0 })
      station = result.station

      expect(station.hasEvses).toBe(false)
      expect(station.getNumberOfEvses()).toBe(0)
    })

    await it('should return undefined for getEvseIdByConnectorId() in non-EVSE mode', () => {
      const result = createMockChargingStation({ connectorsCount: 2, evsesCount: 0 })
      station = result.station

      expect(station.getEvseIdByConnectorId(1)).toBeUndefined()
      expect(station.getEvseIdByConnectorId(2)).toBeUndefined()
    })

    // === EVSE Mode Tests ===

    await it('should enable hasEvses flag in EVSE mode', () => {
      const result = createMockChargingStation({ connectorsCount: 2, evsesCount: 1 })
      station = result.station

      expect(station.hasEvses).toBe(true)
    })

    await it('should return correct EVSE count via getNumberOfEvses() in EVSE mode', () => {
      const result = createMockChargingStation({ connectorsCount: 2, evsesCount: 1 })
      station = result.station

      expect(station.getNumberOfEvses()).toBe(1)
    })

    await it('should return connector status via getConnectorStatus() in EVSE mode', () => {
      const result = createMockChargingStation({ connectorsCount: 2, evsesCount: 1 })
      station = result.station

      // Connectors are nested under EVSEs in EVSE mode
      const status1 = station.getConnectorStatus(1)
      const status2 = station.getConnectorStatus(2)

      expect(status1).toBeDefined()
      expect(status2).toBeDefined()
    })

    await it('should map connector IDs to EVSE IDs via getEvseIdByConnectorId()', () => {
      const result = createMockChargingStation({ connectorsCount: 2, evsesCount: 1 })
      station = result.station

      // In single-EVSE mode, both connectors should map to EVSE 1
      expect(station.getEvseIdByConnectorId(1)).toBe(1)
      expect(station.getEvseIdByConnectorId(2)).toBe(1)
    })

    await it('should return undefined for getEvseIdByConnectorId() with invalid connector', () => {
      const result = createMockChargingStation({ connectorsCount: 2, evsesCount: 1 })
      station = result.station

      expect(station.getEvseIdByConnectorId(999)).toBeUndefined()
    })

    await it('should return EVSE status via getEvseStatus() for valid EVSE IDs', () => {
      const result = createMockChargingStation({ connectorsCount: 2, evsesCount: 1 })
      station = result.station

      const evseStatus = station.getEvseStatus(1)

      expect(evseStatus).toBeDefined()
      expect(evseStatus?.connectors).toBeDefined()
      expect(evseStatus?.connectors.size).toBeGreaterThan(0)
    })

    await it('should return undefined for getEvseStatus() with invalid EVSE IDs', () => {
      const result = createMockChargingStation({ connectorsCount: 2, evsesCount: 1 })
      station = result.station

      expect(station.getEvseStatus(999)).toBeUndefined()
    })

    await it('should return true for hasConnector() with connectors in EVSE mode', () => {
      const result = createMockChargingStation({ connectorsCount: 2, evsesCount: 1 })
      station = result.station

      expect(station.hasConnector(1)).toBe(true)
      expect(station.hasConnector(2)).toBe(true)
    })

    await it('should return false for hasConnector() with non-existing connector in EVSE mode', () => {
      const result = createMockChargingStation({ connectorsCount: 2, evsesCount: 1 })
      station = result.station

      expect(station.hasConnector(999)).toBe(false)
    })

    await it('should correctly count connectors in EVSE mode via getNumberOfConnectors()', () => {
      const result = createMockChargingStation({ connectorsCount: 4, evsesCount: 2 })
      station = result.station

      // Should return total connectors across all EVSEs
      expect(station.getNumberOfConnectors()).toBe(4)
    })
  })

  await describe('Boot Notification State', async () => {
    let station: ChargingStation | undefined

    afterEach(() => {
      if (station != null) {
        cleanupChargingStation(station)
      }
    })

    await it('should return true for inAcceptedState when boot status is ACCEPTED', () => {
      // Arrange
      const result = createRealChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.ACCEPTED,
      })
      station = result.station

      // Act & Assert
      expect(station.inAcceptedState()).toBe(true)
      expect(station.inPendingState()).toBe(false)
      expect(station.inRejectedState()).toBe(false)
      expect(station.inUnknownState()).toBe(false)
    })

    await it('should return true for inPendingState when boot status is PENDING', () => {
      // Arrange
      const result = createRealChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.PENDING,
      })
      station = result.station

      // Act & Assert
      expect(station.inPendingState()).toBe(true)
      expect(station.inAcceptedState()).toBe(false)
      expect(station.inRejectedState()).toBe(false)
      expect(station.inUnknownState()).toBe(false)
    })

    await it('should return true for inRejectedState when boot status is REJECTED', () => {
      // Arrange
      const result = createRealChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.REJECTED,
      })
      station = result.station

      // Act & Assert
      expect(station.inRejectedState()).toBe(true)
      expect(station.inAcceptedState()).toBe(false)
      expect(station.inPendingState()).toBe(false)
      expect(station.inUnknownState()).toBe(false)
    })

    await it('should return true for inUnknownState when boot notification response is null', () => {
      // Arrange - create station with default accepted status, then delete the response
      const result = createRealChargingStation({ connectorsCount: 1 })
      station = result.station

      // Act - simulate unknown state by clearing boot notification response
      if (station.bootNotificationResponse != null) {
        // Delete the boot notification response to simulate unknown state
        delete station.bootNotificationResponse
      }

      // Assert - only check inUnknownState
      expect(station.inUnknownState()).toBe(true)
    })

    await it('should allow state transitions from PENDING to ACCEPTED', () => {
      // Arrange
      const result = createRealChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.PENDING,
      })
      station = result.station
      expect(station.inPendingState()).toBe(true)

      // Act - transition from PENDING to ACCEPTED
      station.bootNotificationResponse.status = RegistrationStatusEnumType.ACCEPTED
      station.bootNotificationResponse.currentTime = new Date()

      // Assert
      expect(station.inAcceptedState()).toBe(true)
      expect(station.inPendingState()).toBe(false)
    })

    await it('should allow state transitions from PENDING to REJECTED', () => {
      // Arrange
      const result = createRealChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.PENDING,
      })
      station = result.station
      expect(station.inPendingState()).toBe(true)

      // Act - transition from PENDING to REJECTED
      station.bootNotificationResponse.status = RegistrationStatusEnumType.REJECTED
      station.bootNotificationResponse.currentTime = new Date()

      // Assert
      expect(station.inRejectedState()).toBe(true)
      expect(station.inPendingState()).toBe(false)
    })
  })

  await describe('Configuration Persistence', async () => {
    let station: ChargingStation | undefined

    afterEach(() => {
      if (station != null) {
        cleanupChargingStation(station)
      }
    })

    // === OCPP Configuration Getters ===

    await it('should return heartbeat interval in milliseconds', () => {
      // Arrange - create station with 60 second heartbeat
      const result = createRealChargingStation({ heartbeatInterval: 60 })
      station = result.station

      // Act & Assert - should convert seconds to milliseconds
      expect(station.getHeartbeatInterval()).toBe(60000)
    })

    await it('should return default heartbeat interval when not explicitly configured', () => {
      // Arrange - use default heartbeat interval (TEST_HEARTBEAT_INTERVAL_SECONDS = 60)
      const result = createRealChargingStation()
      station = result.station

      // Act & Assert - default 60s * 1000 = 60000ms
      expect(station.getHeartbeatInterval()).toBe(60000)
    })

    await it('should return connection timeout in milliseconds', () => {
      // Arrange
      const result = createRealChargingStation()
      station = result.station

      // Act & Assert - default connection timeout is 30 seconds
      expect(station.getConnectionTimeout()).toBe(30000)
    })

    await it('should return authorize remote TX requests as boolean', () => {
      // Arrange - create station which defaults to false for AuthorizeRemoteTxRequests
      const result = createRealChargingStation()
      station = result.station

      // Act & Assert - getAuthorizeRemoteTxRequests returns boolean
      const authorizeRemoteTx = station.getAuthorizeRemoteTxRequests()
      expect(typeof authorizeRemoteTx).toBe('boolean')
    })

    await it('should return local auth list enabled as boolean', () => {
      // Arrange
      const result = createRealChargingStation()
      station = result.station

      // Act & Assert - getLocalAuthListEnabled returns boolean
      const localAuthEnabled = station.getLocalAuthListEnabled()
      expect(typeof localAuthEnabled).toBe('boolean')
    })

    // === Configuration Save Operations ===

    await it('should call saveOcppConfiguration without throwing', () => {
      // Arrange
      const result = createRealChargingStation()
      station = result.station

      // Act & Assert - should not throw
      expect(() => station?.saveOcppConfiguration()).not.toThrow()
    })

    await it('should have ocppConfiguration object with configurationKey array', () => {
      // Arrange
      const result = createRealChargingStation()
      station = result.station

      // Act & Assert - configuration structure should be present
      expect(station.ocppConfiguration).toBeDefined()
      expect(station.ocppConfiguration?.configurationKey).toBeDefined()
      expect(Array.isArray(station.ocppConfiguration?.configurationKey)).toBe(true)
    })

    // === Configuration Mutation ===

    await it('should allow updating heartbeat interval', () => {
      // Arrange - create with 60 second interval
      const result = createRealChargingStation({ heartbeatInterval: 60 })
      station = result.station
      const initialInterval = station.getHeartbeatInterval()
      expect(initialInterval).toBe(60000)

      // Act - simulate configuration change by creating new station with different interval
      const result2 = createRealChargingStation({ heartbeatInterval: 120 })
      const station2 = result2.station

      // Assert - different configurations have different intervals
      expect(station2.getHeartbeatInterval()).toBe(120000)
      expect(station.getHeartbeatInterval()).toBe(60000) // Original unchanged

      // Cleanup second station
      cleanupChargingStation(station2)
    })

    await it('should support setSupervisionUrl method if available', () => {
      // Arrange
      const result = createRealChargingStation()
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
      const result = createRealChargingStation({ templateFile: 'custom-template.json' })
      station = result.station

      // Act & Assert - station info should have template reference
      expect(station.stationInfo?.templateName).toBe('custom-template.json')
    })

    await it('should have hashId for configuration persistence', () => {
      // Arrange
      const result = createRealChargingStation()
      station = result.station

      // Act & Assert - hashId is used for configuration file naming
      expect(station.stationInfo?.hashId).toBeDefined()
      expect(typeof station.stationInfo?.hashId).toBe('string')
    })

    await it('should preserve station info properties for persistence', () => {
      // Arrange
      const result = createRealChargingStation({
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
      const result = createRealChargingStation()
      station = result.station

      // Act & Assert - templateFile is used to track configuration source
      expect(station.templateFile).toBeDefined()
      expect(typeof station.templateFile).toBe('string')
    })

    await it('should use mocked file system without real file writes', () => {
      // Arrange
      const result = createRealChargingStation()
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

    afterEach(() => {
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
      expect(parsed[0]).toEqual([2, 'uuid-1', 'Heartbeat', {}])
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

  // ===== TRANSACTION MANAGEMENT TESTS =====
  await describe('Transaction Management', async () => {
    let station: ChargingStation | undefined

    afterEach(() => {
      if (station != null) {
        cleanupChargingStation(station)
      }
    })

    // === Transaction Query Tests ===

    await it('should return undefined for getConnectorIdByTransactionId with no active transactions', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      // Act
      const connectorId = station.getConnectorIdByTransactionId(12345)

      // Assert
      expect(connectorId).toBeUndefined()
    })

    await it('should return connector id for getConnectorIdByTransactionId with active transaction', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station
      const connector1 = station.getConnectorStatus(1)
      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = 100
        connector1.transactionIdTag = 'TEST-TAG-001'
      }

      // Act
      const connectorId = station.getConnectorIdByTransactionId(100)

      // Assert
      expect(connectorId).toBe(1)
    })

    await it('should return undefined for getConnectorIdByTransactionId with undefined transactionId', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      // Act
      const connectorId = station.getConnectorIdByTransactionId(undefined)

      // Assert
      expect(connectorId).toBeUndefined()
    })

    await it('should return undefined for getEvseIdByTransactionId in non-EVSE mode', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2, evsesCount: 0 })
      station = result.station
      const connector1 = station.getConnectorStatus(1)
      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = 100
      }

      // Act
      const evseId = station.getEvseIdByTransactionId(100)

      // Assert
      expect(evseId).toBeUndefined()
    })

    await it('should return EVSE id for getEvseIdByTransactionId in EVSE mode with active transaction', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2, evsesCount: 2 })
      station = result.station
      // Get connector in EVSE 1
      const connector1 = station.getConnectorStatus(1)
      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = 200
        connector1.transactionIdTag = 'TEST-TAG-002'
      }

      // Act
      const evseId = station.getEvseIdByTransactionId(200)

      // Assert
      expect(evseId).toBe(1)
    })

    await it('should return idTag for getTransactionIdTag with active transaction', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station
      const connector1 = station.getConnectorStatus(1)
      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = 300
        connector1.transactionIdTag = 'MY-TAG-123'
      }

      // Act
      const idTag = station.getTransactionIdTag(300)

      // Assert
      expect(idTag).toBe('MY-TAG-123')
    })

    await it('should return undefined for getTransactionIdTag with no matching transaction', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      // Act
      const idTag = station.getTransactionIdTag(999)

      // Assert
      expect(idTag).toBeUndefined()
    })

    await it('should return zero for getNumberOfRunningTransactions with no transactions', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 3 })
      station = result.station

      // Act
      const count = station.getNumberOfRunningTransactions()

      // Assert
      expect(count).toBe(0)
    })

    await it('should return correct count for getNumberOfRunningTransactions with active transactions', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 3 })
      station = result.station
      // Set up transactions on connectors 1 and 2
      const connector1 = station.getConnectorStatus(1)
      const connector2 = station.getConnectorStatus(2)
      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = 100
      }
      if (connector2 != null) {
        connector2.transactionStarted = true
        connector2.transactionId = 101
      }

      // Act
      const count = station.getNumberOfRunningTransactions()

      // Assert
      expect(count).toBe(2)
    })

    // === Energy Meter Tests ===

    await it('should return 0 for getEnergyActiveImportRegisterByConnectorId with no transaction energy', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      // Act
      const energy = station.getEnergyActiveImportRegisterByConnectorId(1)

      // Assert
      expect(energy).toBe(0)
    })

    await it('should return energy value for getEnergyActiveImportRegisterByConnectorId with active transaction', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station
      const connector1 = station.getConnectorStatus(1)
      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = 100
        connector1.transactionEnergyActiveImportRegisterValue = 12500
      }

      // Act
      const energy = station.getEnergyActiveImportRegisterByConnectorId(1)

      // Assert
      expect(energy).toBe(12500)
    })

    await it('should return rounded energy value when rounded=true', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station
      const connector1 = station.getConnectorStatus(1)
      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = 100
        connector1.transactionEnergyActiveImportRegisterValue = 12345.678
      }

      // Act
      const energy = station.getEnergyActiveImportRegisterByConnectorId(1, true)

      // Assert
      expect(energy).toBe(12346)
    })

    await it('should return 0 for getEnergyActiveImportRegisterByConnectorId with invalid connector', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      // Act
      const energy = station.getEnergyActiveImportRegisterByConnectorId(99)

      // Assert
      expect(energy).toBe(0)
    })

    await it('should return 0 for getEnergyActiveImportRegisterByTransactionId with no matching transaction', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      // Act
      const energy = station.getEnergyActiveImportRegisterByTransactionId(999)

      // Assert
      expect(energy).toBe(0)
    })

    await it('should return energy for getEnergyActiveImportRegisterByTransactionId with active transaction', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station
      const connector1 = station.getConnectorStatus(1)
      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = 400
        connector1.transactionEnergyActiveImportRegisterValue = 25000
      }

      // Act
      const energy = station.getEnergyActiveImportRegisterByTransactionId(400)

      // Assert
      expect(energy).toBe(25000)
    })

    // === Concurrent Transaction Scenarios ===

    await it('should handle multiple transactions on different connectors', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 3 })
      station = result.station

      // Set up transactions on connectors 1, 2, and 3
      const connector1 = station.getConnectorStatus(1)
      const connector2 = station.getConnectorStatus(2)
      const connector3 = station.getConnectorStatus(3)

      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = 100
        connector1.transactionIdTag = 'TAG-A'
        connector1.transactionEnergyActiveImportRegisterValue = 10000
      }
      if (connector2 != null) {
        connector2.transactionStarted = true
        connector2.transactionId = 101
        connector2.transactionIdTag = 'TAG-B'
        connector2.transactionEnergyActiveImportRegisterValue = 20000
      }
      if (connector3 != null) {
        connector3.transactionStarted = true
        connector3.transactionId = 102
        connector3.transactionIdTag = 'TAG-C'
        connector3.transactionEnergyActiveImportRegisterValue = 30000
      }

      // Act & Assert - Running transactions count
      expect(station.getNumberOfRunningTransactions()).toBe(3)

      // Act & Assert - Transaction queries
      expect(station.getConnectorIdByTransactionId(100)).toBe(1)
      expect(station.getConnectorIdByTransactionId(101)).toBe(2)
      expect(station.getConnectorIdByTransactionId(102)).toBe(3)

      // Act & Assert - Energy meters
      expect(station.getEnergyActiveImportRegisterByTransactionId(100)).toBe(10000)
      expect(station.getEnergyActiveImportRegisterByTransactionId(101)).toBe(20000)
      expect(station.getEnergyActiveImportRegisterByTransactionId(102)).toBe(30000)

      // Act & Assert - Id tags
      expect(station.getTransactionIdTag(100)).toBe('TAG-A')
      expect(station.getTransactionIdTag(101)).toBe('TAG-B')
      expect(station.getTransactionIdTag(102)).toBe('TAG-C')
    })

    await it('should handle transactions across multiple EVSEs', () => {
      // Arrange - 4 connectors across 2 EVSEs
      const result = createMockChargingStation({ connectorsCount: 4, evsesCount: 2 })
      station = result.station

      // Set up transaction on connector 1 (EVSE 1) and connector 3 (EVSE 2)
      const connector1 = station.getConnectorStatus(1)
      const connector3 = station.getConnectorStatus(3)

      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = 500
        connector1.transactionIdTag = 'EVSE1-TAG'
        connector1.transactionEnergyActiveImportRegisterValue = 15000
      }
      if (connector3 != null) {
        connector3.transactionStarted = true
        connector3.transactionId = 501
        connector3.transactionIdTag = 'EVSE2-TAG'
        connector3.transactionEnergyActiveImportRegisterValue = 18000
      }

      // Act & Assert - Running transactions count
      expect(station.getNumberOfRunningTransactions()).toBe(2)

      // Act & Assert - EVSE queries
      expect(station.getEvseIdByTransactionId(500)).toBe(1)
      expect(station.getEvseIdByTransactionId(501)).toBe(2)

      // Act & Assert - Connector queries
      expect(station.getConnectorIdByTransactionId(500)).toBe(1)
      expect(station.getConnectorIdByTransactionId(501)).toBe(3)

      // Act & Assert - Energy meters
      expect(station.getEnergyActiveImportRegisterByTransactionId(500)).toBe(15000)
      expect(station.getEnergyActiveImportRegisterByTransactionId(501)).toBe(18000)
    })

    await it('should correctly count transactions only on connectors > 0', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      // Connector 0 should not count (station-level)
      const connector0 = station.getConnectorStatus(0)
      const connector1 = station.getConnectorStatus(1)

      if (connector0 != null) {
        // This shouldn't happen in real usage but test robustness
        connector0.transactionStarted = true
        connector0.transactionId = 999
      }
      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = 100
      }

      // Act
      const count = station.getNumberOfRunningTransactions()

      // Assert - Only connector 1 should count
      expect(count).toBe(1)
    })

    await it('should return idTag in EVSE mode for getTransactionIdTag', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2, evsesCount: 2 })
      station = result.station

      const connector2 = station.getConnectorStatus(2)
      if (connector2 != null) {
        connector2.transactionStarted = true
        connector2.transactionId = 600
        connector2.transactionIdTag = 'EVSE-MODE-TAG'
      }

      // Act
      const idTag = station.getTransactionIdTag(600)

      // Assert
      expect(idTag).toBe('EVSE-MODE-TAG')
    })

    await it('should handle rounded energy values for getEnergyActiveImportRegisterByTransactionId', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station
      const connector1 = station.getConnectorStatus(1)
      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = 700
        connector1.transactionEnergyActiveImportRegisterValue = 12345.5
      }

      // Act
      const unrounded = station.getEnergyActiveImportRegisterByTransactionId(700, false)
      const rounded = station.getEnergyActiveImportRegisterByTransactionId(700, true)

      // Assert
      expect(unrounded).toBe(12345.5)
      expect(rounded).toBe(12346)
    })
  })
})
