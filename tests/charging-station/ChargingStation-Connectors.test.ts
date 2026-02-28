/**
 * @file Tests for ChargingStation Connector and EVSE Operations
 * @description Unit tests for connector queries, EVSE management, and availability
 */
import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/ChargingStation.js'

import { RegistrationStatusEnumType } from '../../src/types/index.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'
import { TEST_ONE_HOUR_MS } from './ChargingStationTestConstants.js'
import { cleanupChargingStation, createMockChargingStation } from './ChargingStationTestUtils.js'

await describe('ChargingStation Connector and EVSE State', async () => {
  await describe('Connector Query', async () => {
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
  })

  await describe('Connector 0 (Shared Power)', async () => {
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
  })

  await describe('EVSE Query (non-EVSE mode)', async () => {
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

    await it('should return 0 for getNumberOfEvses() in non-EVSE mode', () => {
      const result = createMockChargingStation({
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 0 },
      })
      station = result.station

      expect(station.hasEvses).toBe(false)
      expect(station.getNumberOfEvses()).toBe(0)
    })

    await it('should return undefined for getEvseIdByConnectorId() in non-EVSE mode', () => {
      const result = createMockChargingStation({
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 0 },
      })
      station = result.station

      expect(station.getEvseIdByConnectorId(1)).toBeUndefined()
      expect(station.getEvseIdByConnectorId(2)).toBeUndefined()
    })
  })

  await describe('EVSE Mode', async () => {
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

    await it('should enable hasEvses flag in EVSE mode', () => {
      const result = createMockChargingStation({
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 1 },
      })
      station = result.station

      expect(station.hasEvses).toBe(true)
    })

    await it('should return correct EVSE count via getNumberOfEvses() in EVSE mode', () => {
      const result = createMockChargingStation({
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 1 },
      })
      station = result.station

      expect(station.getNumberOfEvses()).toBe(1)
    })

    await it('should return connector status via getConnectorStatus() in EVSE mode', () => {
      const result = createMockChargingStation({
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 1 },
      })
      station = result.station

      // Connectors are nested under EVSEs in EVSE mode
      const status1 = station.getConnectorStatus(1)
      const status2 = station.getConnectorStatus(2)

      expect(status1).toBeDefined()
      expect(status2).toBeDefined()
    })

    await it('should map connector IDs to EVSE IDs via getEvseIdByConnectorId()', () => {
      const result = createMockChargingStation({
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 1 },
      })
      station = result.station

      // In single-EVSE mode, both connectors should map to EVSE 1
      expect(station.getEvseIdByConnectorId(1)).toBe(1)
      expect(station.getEvseIdByConnectorId(2)).toBe(1)
    })

    await it('should return undefined for getEvseIdByConnectorId() with invalid connector', () => {
      const result = createMockChargingStation({
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 1 },
      })
      station = result.station

      expect(station.getEvseIdByConnectorId(999)).toBeUndefined()
    })

    await it('should return EVSE status via getEvseStatus() for valid EVSE IDs', () => {
      const result = createMockChargingStation({
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 1 },
      })
      station = result.station

      const evseStatus = station.getEvseStatus(1)

      expect(evseStatus).toBeDefined()
      expect(evseStatus?.connectors).toBeDefined()
      expect(evseStatus?.connectors.size).toBeGreaterThan(0)
    })

    await it('should return undefined for getEvseStatus() with invalid EVSE IDs', () => {
      const result = createMockChargingStation({
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 1 },
      })
      station = result.station

      expect(station.getEvseStatus(999)).toBeUndefined()
    })

    await it('should return true for hasConnector() with connectors in EVSE mode', () => {
      const result = createMockChargingStation({
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 1 },
      })
      station = result.station

      expect(station.hasConnector(1)).toBe(true)
      expect(station.hasConnector(2)).toBe(true)
    })

    await it('should return false for hasConnector() with non-existing connector in EVSE mode', () => {
      const result = createMockChargingStation({
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 1 },
      })
      station = result.station

      expect(station.hasConnector(999)).toBe(false)
    })

    await it('should correctly count connectors in EVSE mode via getNumberOfConnectors()', () => {
      const result = createMockChargingStation({
        connectorsCount: 4,
        evseConfiguration: { evsesCount: 2 },
      })
      station = result.station

      // Should return total connectors across all EVSEs
      expect(station.getNumberOfConnectors()).toBe(4)
    })
  })

  await describe('Boot Notification State', async () => {
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

    await it('should return true for inAcceptedState when boot status is ACCEPTED', () => {
      // Arrange
      const result = createMockChargingStation({
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
      const result = createMockChargingStation({
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
      const result = createMockChargingStation({
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
      const result = createMockChargingStation({ connectorsCount: 1 })
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
      const result = createMockChargingStation({
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
      const result = createMockChargingStation({
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

  await describe('Reservation Management', async () => {
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

    await it('should add reservation successfully to connector', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station
      const reservation = {
        connectorId: 1,
        expiryDate: new Date(Date.now() + TEST_ONE_HOUR_MS), // 1 hour from now
        idTag: 'test-tag-1',
        reservationId: 101,
      }

      // Act
      await station.addReservation(reservation)

      // Assert
      const found = station.getReservationBy('reservationId', 101)
      expect(found).toBeDefined()
      expect(found?.idTag).toBe('test-tag-1')
      expect(found?.connectorId).toBe(1)
    })

    await it('should replace existing reservation with new one', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station
      const firstReservation = {
        connectorId: 1,
        expiryDate: new Date(Date.now() + TEST_ONE_HOUR_MS),
        idTag: 'tag-1',
        reservationId: 201,
      }
      const secondReservation = {
        connectorId: 2,
        expiryDate: new Date(Date.now() + TEST_ONE_HOUR_MS),
        idTag: 'tag-2',
        reservationId: 201, // Same ID
      }

      // Act
      await station.addReservation(firstReservation)
      await station.addReservation(secondReservation)

      // Assert - Only second reservation should exist with same ID
      const found = station.getReservationBy('reservationId', 201)
      expect(found).toBeDefined()
      expect(found?.idTag).toBe('tag-2')
      expect(found?.connectorId).toBe(2)
    })

    await it('should remove reservation with EXPIRED reason', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station
      const reservation = {
        connectorId: 1,
        expiryDate: new Date(Date.now() + TEST_ONE_HOUR_MS),
        idTag: 'test-tag-expired',
        reservationId: 301,
      }
      await station.addReservation(reservation)

      // Act
      const { ReservationTerminationReason } = await import('../../src/types/ocpp/Reservation.js')
      await station.removeReservation(reservation, ReservationTerminationReason.EXPIRED)

      // Assert
      const found = station.getReservationBy('reservationId', 301)
      expect(found).toBeUndefined()
    })

    await it('should remove reservation with REPLACE_EXISTING reason', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station
      const reservation = {
        connectorId: 1,
        expiryDate: new Date(Date.now() + TEST_ONE_HOUR_MS),
        idTag: 'test-tag-replace',
        reservationId: 401,
      }
      await station.addReservation(reservation)

      // Act
      const { ReservationTerminationReason } = await import('../../src/types/ocpp/Reservation.js')
      await station.removeReservation(reservation, ReservationTerminationReason.REPLACE_EXISTING)

      // Assert
      const found = station.getReservationBy('reservationId', 401)
      expect(found).toBeUndefined()
    })

    await it('should query reservation by reservationId', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station
      const reservation = {
        connectorId: 2,
        expiryDate: new Date(Date.now() + TEST_ONE_HOUR_MS),
        idTag: 'query-test-id',
        reservationId: 501,
      }
      await station.addReservation(reservation)

      // Act
      const found = station.getReservationBy('reservationId', 501)

      // Assert
      expect(found).toBeDefined()
      expect(found?.connectorId).toBe(2)
      expect(found?.idTag).toBe('query-test-id')
    })

    await it('should query reservation by idTag', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station
      const reservation = {
        connectorId: 1,
        expiryDate: new Date(Date.now() + TEST_ONE_HOUR_MS),
        idTag: 'search-by-tag',
        reservationId: 601,
      }
      await station.addReservation(reservation)

      // Act
      const found = station.getReservationBy('idTag', 'search-by-tag')

      // Assert
      expect(found).toBeDefined()
      expect(found?.reservationId).toBe(601)
      expect(found?.connectorId).toBe(1)
    })

    await it('should query reservation by connectorId', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 3 })
      station = result.station
      const reservation = {
        connectorId: 2,
        expiryDate: new Date(Date.now() + TEST_ONE_HOUR_MS),
        idTag: 'connector-search',
        reservationId: 701,
      }
      await station.addReservation(reservation)

      // Act
      const found = station.getReservationBy('connectorId', 2)

      // Assert
      expect(found).toBeDefined()
      expect(found?.reservationId).toBe(701)
      expect(found?.idTag).toBe('connector-search')
    })

    await it('should handle isConnectorReservable check with valid reservationId', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station
      const reservation = {
        connectorId: 1,
        expiryDate: new Date(Date.now() + TEST_ONE_HOUR_MS),
        idTag: 'reservable-check',
        reservationId: 801,
      }
      await station.addReservation(reservation)

      // Act
      const isReservable = station.isConnectorReservable(801)

      // Assert - Should return false since reservation exists
      expect(isReservable).toBe(false)
    })

    await it('should handle isConnectorReservable check with non-existent reservationId', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      // Act
      const isReservable = station.isConnectorReservable(999)

      // Assert - Should return true since reservation does not exist
      expect(isReservable).toBe(true)
    })

    await it('should not allow reservation on connector 0 via isConnectorReservable', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      // Act
      const isReservable = station.isConnectorReservable(901, 'test-tag', 0)

      // Assert - Connector 0 should not be reservable
      expect(isReservable).toBe(false)
    })

    await it('should handle multiple reservations on different connectors', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 4 })
      station = result.station
      const reservation1 = {
        connectorId: 1,
        expiryDate: new Date(Date.now() + TEST_ONE_HOUR_MS),
        idTag: 'multi-test-1',
        reservationId: 1001,
      }
      const reservation2 = {
        connectorId: 2,
        expiryDate: new Date(Date.now() + TEST_ONE_HOUR_MS),
        idTag: 'multi-test-2',
        reservationId: 1002,
      }

      // Act
      await station.addReservation(reservation1)
      await station.addReservation(reservation2)

      // Assert
      const found1 = station.getReservationBy('reservationId', 1001)
      const found2 = station.getReservationBy('reservationId', 1002)
      expect(found1).toBeDefined()
      expect(found2).toBeDefined()
      expect(found1?.connectorId).toBe(1)
      expect(found2?.connectorId).toBe(2)
    })
  })
})
