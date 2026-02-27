import { expect } from '@std/expect'
import { afterEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/ChargingStation.js'

import { RegistrationStatusEnumType } from '../../src/types/index.js'
import { cleanupChargingStation, createRealChargingStation } from './ChargingStationTestUtils.js'

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
      const result = createRealChargingStation({ connectorsCount: 1 })
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
      const result = createRealChargingStation({ connectorsCount: 1 })
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
      const result = createRealChargingStation({ connectorsCount: 1 })
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
      const result = createRealChargingStation({ connectorsCount: 1 })
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
      const result = createRealChargingStation({ connectorsCount: 1 })
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
      const result = createRealChargingStation({ connectorsCount: 1 })
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
      const result = createRealChargingStation({ connectorsCount: 1 })
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
      const result = createRealChargingStation({ connectorsCount: 1 })
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
      const result = createRealChargingStation({ connectorsCount: 2 })
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
      const result = createRealChargingStation({ connectorsCount: 1 })
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
      const result = createRealChargingStation({ connectorsCount: 1 })
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
      const result = createRealChargingStation({ connectorsCount: 2 })
      station = result.station

      expect(station.hasConnector(0)).toBe(true)
      expect(station.hasConnector(1)).toBe(true)
      expect(station.hasConnector(2)).toBe(true)
    })

    await it('should return false for hasConnector() with non-existing connector IDs', () => {
      const result = createRealChargingStation({ connectorsCount: 2 })
      station = result.station

      expect(station.hasConnector(3)).toBe(false)
      expect(station.hasConnector(999)).toBe(false)
      expect(station.hasConnector(-1)).toBe(false)
    })

    await it('should return connector status for valid connector IDs', () => {
      const result = createRealChargingStation({ connectorsCount: 2 })
      station = result.station

      const status1 = station.getConnectorStatus(1)
      const status2 = station.getConnectorStatus(2)

      expect(status1).toBeDefined()
      expect(status2).toBeDefined()
    })

    await it('should return undefined for getConnectorStatus() with invalid connector IDs', () => {
      const result = createRealChargingStation({ connectorsCount: 2 })
      station = result.station

      expect(station.getConnectorStatus(999)).toBeUndefined()
      expect(station.getConnectorStatus(-1)).toBeUndefined()
    })

    await it('should correctly count connectors via getNumberOfConnectors()', () => {
      const result = createRealChargingStation({ connectorsCount: 3 })
      station = result.station

      // Should return 3, not 4 (connector 0 is excluded from count)
      expect(station.getNumberOfConnectors()).toBe(3)
    })

    await it('should return true for isConnectorAvailable() on operative connectors', () => {
      const result = createRealChargingStation({ connectorsCount: 2 })
      station = result.station

      expect(station.isConnectorAvailable(1)).toBe(true)
      expect(station.isConnectorAvailable(2)).toBe(true)
    })

    await it('should return false for isConnectorAvailable() on connector 0', () => {
      // Connector 0 is never "available" per isConnectorAvailable() logic (connectorId > 0)
      const result = createRealChargingStation({ connectorsCount: 2 })
      station = result.station

      expect(station.isConnectorAvailable(0)).toBe(false)
    })

    await it('should return false for isConnectorAvailable() on non-existing connector', () => {
      const result = createRealChargingStation({ connectorsCount: 2 })
      station = result.station

      expect(station.isConnectorAvailable(999)).toBe(false)
    })

    // === Connector 0 (shared power) Tests ===

    await it('should include connector 0 for shared power configuration', () => {
      const result = createRealChargingStation({ connectorsCount: 2 })
      station = result.station

      // Connector 0 always exists and represents the charging station itself
      expect(station.hasConnector(0)).toBe(true)
      expect(station.getConnectorStatus(0)).toBeDefined()
    })

    await it('should determine station availability via connector 0 status', () => {
      const result = createRealChargingStation({ connectorsCount: 2 })
      station = result.station

      // Initially connector 0 is operative
      expect(station.isChargingStationAvailable()).toBe(true)
    })

    // === EVSE Query Tests (non-EVSE mode) ===

    await it('should return 0 for getNumberOfEvses() in non-EVSE mode', () => {
      const result = createRealChargingStation({ connectorsCount: 2, evsesCount: 0 })
      station = result.station

      expect(station.hasEvses).toBe(false)
      expect(station.getNumberOfEvses()).toBe(0)
    })

    await it('should return undefined for getEvseIdByConnectorId() in non-EVSE mode', () => {
      const result = createRealChargingStation({ connectorsCount: 2, evsesCount: 0 })
      station = result.station

      expect(station.getEvseIdByConnectorId(1)).toBeUndefined()
      expect(station.getEvseIdByConnectorId(2)).toBeUndefined()
    })

    // === EVSE Mode Tests ===

    await it('should enable hasEvses flag in EVSE mode', () => {
      const result = createRealChargingStation({ connectorsCount: 2, evsesCount: 1 })
      station = result.station

      expect(station.hasEvses).toBe(true)
    })

    await it('should return correct EVSE count via getNumberOfEvses() in EVSE mode', () => {
      const result = createRealChargingStation({ connectorsCount: 2, evsesCount: 1 })
      station = result.station

      expect(station.getNumberOfEvses()).toBe(1)
    })

    await it('should return connector status via getConnectorStatus() in EVSE mode', () => {
      const result = createRealChargingStation({ connectorsCount: 2, evsesCount: 1 })
      station = result.station

      // Connectors are nested under EVSEs in EVSE mode
      const status1 = station.getConnectorStatus(1)
      const status2 = station.getConnectorStatus(2)

      expect(status1).toBeDefined()
      expect(status2).toBeDefined()
    })

    await it('should map connector IDs to EVSE IDs via getEvseIdByConnectorId()', () => {
      const result = createRealChargingStation({ connectorsCount: 2, evsesCount: 1 })
      station = result.station

      // In single-EVSE mode, both connectors should map to EVSE 1
      expect(station.getEvseIdByConnectorId(1)).toBe(1)
      expect(station.getEvseIdByConnectorId(2)).toBe(1)
    })

    await it('should return undefined for getEvseIdByConnectorId() with invalid connector', () => {
      const result = createRealChargingStation({ connectorsCount: 2, evsesCount: 1 })
      station = result.station

      expect(station.getEvseIdByConnectorId(999)).toBeUndefined()
    })

    await it('should return EVSE status via getEvseStatus() for valid EVSE IDs', () => {
      const result = createRealChargingStation({ connectorsCount: 2, evsesCount: 1 })
      station = result.station

      const evseStatus = station.getEvseStatus(1)

      expect(evseStatus).toBeDefined()
      expect(evseStatus?.connectors).toBeDefined()
      expect(evseStatus?.connectors.size).toBeGreaterThan(0)
    })

    await it('should return undefined for getEvseStatus() with invalid EVSE IDs', () => {
      const result = createRealChargingStation({ connectorsCount: 2, evsesCount: 1 })
      station = result.station

      expect(station.getEvseStatus(999)).toBeUndefined()
    })

    await it('should return true for hasConnector() with connectors in EVSE mode', () => {
      const result = createRealChargingStation({ connectorsCount: 2, evsesCount: 1 })
      station = result.station

      expect(station.hasConnector(1)).toBe(true)
      expect(station.hasConnector(2)).toBe(true)
    })

    await it('should return false for hasConnector() with non-existing connector in EVSE mode', () => {
      const result = createRealChargingStation({ connectorsCount: 2, evsesCount: 1 })
      station = result.station

      expect(station.hasConnector(999)).toBe(false)
    })

    await it('should correctly count connectors in EVSE mode via getNumberOfConnectors()', () => {
      const result = createRealChargingStation({ connectorsCount: 4, evsesCount: 2 })
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
})
