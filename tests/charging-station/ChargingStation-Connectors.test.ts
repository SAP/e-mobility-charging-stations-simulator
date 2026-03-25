/**
 * @file Tests for ChargingStation Connector and EVSE Operations
 * @description Unit tests for connector queries, EVSE management, and availability
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/index.js'

import { resetConnectorStatus } from '../../src/charging-station/Helpers.js'
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

      assert.strictEqual(station.hasConnector(0), true)
      assert.strictEqual(station.hasConnector(1), true)
      assert.strictEqual(station.hasConnector(2), true)
    })

    await it('should return false for hasConnector() with non-existing connector IDs', () => {
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      assert.strictEqual(station.hasConnector(3), false)
      assert.strictEqual(station.hasConnector(999), false)
      assert.strictEqual(station.hasConnector(-1), false)
    })

    await it('should return connector status for valid connector IDs', () => {
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      const status1 = station.getConnectorStatus(1)
      const status2 = station.getConnectorStatus(2)

      assert.notStrictEqual(status1, undefined)
      assert.notStrictEqual(status2, undefined)
    })

    await it('should return undefined for getConnectorStatus() with invalid connector IDs', () => {
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      assert.strictEqual(station.getConnectorStatus(999), undefined)
      assert.strictEqual(station.getConnectorStatus(-1), undefined)
    })

    await it('should correctly count connectors via getNumberOfConnectors()', () => {
      const result = createMockChargingStation({ connectorsCount: 3 })
      station = result.station

      // Should return 3, not 4 (connector 0 is excluded from count)
      assert.strictEqual(station.getNumberOfConnectors(), 3)
    })

    await it('should return true for isConnectorAvailable() on operative connectors', () => {
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      assert.strictEqual(station.isConnectorAvailable(1), true)
      assert.strictEqual(station.isConnectorAvailable(2), true)
    })

    await it('should return false for isConnectorAvailable() on connector 0', () => {
      // Connector 0 is never "available" per isConnectorAvailable() logic (connectorId > 0)
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      assert.strictEqual(station.isConnectorAvailable(0), false)
    })

    await it('should return false for isConnectorAvailable() on non-existing connector', () => {
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      assert.strictEqual(station.isConnectorAvailable(999), false)
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
      assert.strictEqual(station.hasConnector(0), true)
      assert.notStrictEqual(station.getConnectorStatus(0), undefined)
    })

    await it('should determine station availability via connector 0 status', () => {
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      // Initially connector 0 is operative
      assert.strictEqual(station.isChargingStationAvailable(), true)
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

      assert.strictEqual(station.hasEvses, false)
      assert.strictEqual(station.getNumberOfEvses(), 0)
    })

    await it('should return undefined for getEvseIdByConnectorId() in non-EVSE mode', () => {
      const result = createMockChargingStation({
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 0 },
      })
      station = result.station

      assert.strictEqual(station.getEvseIdByConnectorId(1), undefined)
      assert.strictEqual(station.getEvseIdByConnectorId(2), undefined)
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

      assert.strictEqual(station.hasEvses, true)
    })

    await it('should return correct EVSE count via getNumberOfEvses() in EVSE mode', () => {
      const result = createMockChargingStation({
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 1 },
      })
      station = result.station

      assert.strictEqual(station.getNumberOfEvses(), 1)
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

      assert.notStrictEqual(status1, undefined)
      assert.notStrictEqual(status2, undefined)
    })

    await it('should map connector IDs to EVSE IDs via getEvseIdByConnectorId()', () => {
      const result = createMockChargingStation({
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 1 },
      })
      station = result.station

      // In single-EVSE mode, both connectors should map to EVSE 1
      assert.strictEqual(station.getEvseIdByConnectorId(1), 1)
      assert.strictEqual(station.getEvseIdByConnectorId(2), 1)
    })

    await it('should return undefined for getEvseIdByConnectorId() with invalid connector', () => {
      const result = createMockChargingStation({
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 1 },
      })
      station = result.station

      assert.strictEqual(station.getEvseIdByConnectorId(999), undefined)
    })

    await it('should return EVSE status via getEvseStatus() for valid EVSE IDs', () => {
      const result = createMockChargingStation({
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 1 },
      })
      station = result.station

      const evseStatus = station.getEvseStatus(1)

      if (evseStatus == null) {
        assert.fail('Expected evseStatus to be defined')
      }
      assert.notStrictEqual(evseStatus.connectors, undefined)
      assert.strictEqual(evseStatus.connectors.size > 0, true)
    })

    await it('should return undefined for getEvseStatus() with invalid EVSE IDs', () => {
      const result = createMockChargingStation({
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 1 },
      })
      station = result.station

      assert.strictEqual(station.getEvseStatus(999), undefined)
    })

    await it('should return true for hasConnector() with connectors in EVSE mode', () => {
      const result = createMockChargingStation({
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 1 },
      })
      station = result.station

      assert.strictEqual(station.hasConnector(1), true)
      assert.strictEqual(station.hasConnector(2), true)
    })

    await it('should return false for hasConnector() with non-existing connector in EVSE mode', () => {
      const result = createMockChargingStation({
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 1 },
      })
      station = result.station

      assert.strictEqual(station.hasConnector(999), false)
    })

    await it('should correctly count connectors in EVSE mode via getNumberOfConnectors()', () => {
      const result = createMockChargingStation({
        connectorsCount: 4,
        evseConfiguration: { evsesCount: 2 },
      })
      station = result.station

      // Should return total connectors across all EVSEs
      assert.strictEqual(station.getNumberOfConnectors(), 4)
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
      assert.strictEqual(station.inAcceptedState(), true)
      assert.strictEqual(station.inPendingState(), false)
      assert.strictEqual(station.inRejectedState(), false)
      assert.strictEqual(station.inUnknownState(), false)
    })

    await it('should return true for inPendingState when boot status is PENDING', () => {
      // Arrange
      const result = createMockChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.PENDING,
      })
      station = result.station

      // Act & Assert
      assert.strictEqual(station.inPendingState(), true)
      assert.strictEqual(station.inAcceptedState(), false)
      assert.strictEqual(station.inRejectedState(), false)
      assert.strictEqual(station.inUnknownState(), false)
    })

    await it('should return true for inRejectedState when boot status is REJECTED', () => {
      // Arrange
      const result = createMockChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.REJECTED,
      })
      station = result.station

      // Act & Assert
      assert.strictEqual(station.inRejectedState(), true)
      assert.strictEqual(station.inAcceptedState(), false)
      assert.strictEqual(station.inPendingState(), false)
      assert.strictEqual(station.inUnknownState(), false)
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
      assert.strictEqual(station.inUnknownState(), true)
    })

    await it('should allow state transitions from PENDING to ACCEPTED', () => {
      // Arrange
      const result = createMockChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.PENDING,
      })
      station = result.station
      assert.strictEqual(station.inPendingState(), true)

      // Act - transition from PENDING to ACCEPTED
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      station.bootNotificationResponse!.status = RegistrationStatusEnumType.ACCEPTED
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      station.bootNotificationResponse!.currentTime = new Date()

      // Assert
      assert.strictEqual(station.inAcceptedState(), true)
      assert.strictEqual(station.inPendingState(), false)
    })

    await it('should allow state transitions from PENDING to REJECTED', () => {
      // Arrange
      const result = createMockChargingStation({
        bootNotificationStatus: RegistrationStatusEnumType.PENDING,
      })
      station = result.station
      assert.strictEqual(station.inPendingState(), true)

      // Act - transition from PENDING to REJECTED
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      station.bootNotificationResponse!.status = RegistrationStatusEnumType.REJECTED
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      station.bootNotificationResponse!.currentTime = new Date()

      // Assert
      assert.strictEqual(station.inRejectedState(), true)
      assert.strictEqual(station.inPendingState(), false)
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
      if (found == null) {
        assert.fail('Expected reservation to be found')
      }
      assert.strictEqual(found.idTag, 'test-tag-1')
      assert.strictEqual(found.connectorId, 1)
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
      if (found == null) {
        assert.fail('Expected reservation to be found')
      }
      assert.strictEqual(found.idTag, 'tag-2')
      assert.strictEqual(found.connectorId, 2)
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
      assert.strictEqual(found, undefined)
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
      assert.strictEqual(found, undefined)
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
      if (found == null) {
        assert.fail('Expected reservation to be found')
      }
      assert.strictEqual(found.connectorId, 2)
      assert.strictEqual(found.idTag, 'query-test-id')
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
      if (found == null) {
        assert.fail('Expected reservation to be found')
      }
      assert.strictEqual(found.reservationId, 601)
      assert.strictEqual(found.connectorId, 1)
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
      if (found == null) {
        assert.fail('Expected reservation to be found')
      }
      assert.strictEqual(found.reservationId, 701)
      assert.strictEqual(found.idTag, 'connector-search')
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
      assert.strictEqual(isReservable, false)
    })

    await it('should handle isConnectorReservable check with non-existent reservationId', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      // Act
      const isReservable = station.isConnectorReservable(999)

      // Assert - Should return true since reservation does not exist
      assert.strictEqual(isReservable, true)
    })

    await it('should not allow reservation on connector 0 via isConnectorReservable', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      // Act
      const isReservable = station.isConnectorReservable(901, 'test-tag', 0)

      // Assert - Connector 0 should not be reservable
      assert.strictEqual(isReservable, false)
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
      assert.notStrictEqual(found1, undefined)
      assert.notStrictEqual(found2, undefined)
      assert.strictEqual(found1?.connectorId, 1)
      assert.strictEqual(found2?.connectorId, 2)
    })
  })

  await describe('Connector Lock/Unlock', async () => {
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

    await it('should set locked=true on lockConnector() for valid connector', () => {
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      station.lockConnector(1)

      assert.strictEqual(station.getConnectorStatus(1)?.locked, true)
    })

    await it('should set locked=false on unlockConnector() for valid connector', () => {
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      station.lockConnector(1)
      assert.strictEqual(station.getConnectorStatus(1)?.locked, true)

      station.unlockConnector(1)
      assert.strictEqual(station.getConnectorStatus(1)?.locked, false)
    })

    await it('should be idempotent on double lockConnector()', () => {
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      station.lockConnector(1)
      station.lockConnector(1)

      assert.strictEqual(station.getConnectorStatus(1)?.locked, true)
    })

    await it('should be idempotent on double unlockConnector()', () => {
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      station.unlockConnector(1)
      station.unlockConnector(1)

      assert.strictEqual(station.getConnectorStatus(1)?.locked, false)
    })

    await it('should reject connector id 0 for lockConnector()', () => {
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      station.lockConnector(0)

      assert.notStrictEqual(station.getConnectorStatus(0)?.locked, true)
    })

    await it('should reject connector id 0 for unlockConnector()', () => {
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      station.unlockConnector(0)

      assert.notStrictEqual(station.getConnectorStatus(0)?.locked, false)
    })

    await it('should reject non-existent connector for lockConnector()', () => {
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      station.lockConnector(999)

      assert.strictEqual(station.getConnectorStatus(999), undefined)
    })

    await it('should reject non-existent connector for unlockConnector()', () => {
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      station.unlockConnector(999)

      assert.strictEqual(station.getConnectorStatus(999), undefined)
    })

    await it('should not clear locked state on resetConnectorStatus', () => {
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      station.lockConnector(1)
      assert.strictEqual(station.getConnectorStatus(1)?.locked, true)

      resetConnectorStatus(station.getConnectorStatus(1))

      assert.strictEqual(station.getConnectorStatus(1)?.locked, true)
    })
  })
})
