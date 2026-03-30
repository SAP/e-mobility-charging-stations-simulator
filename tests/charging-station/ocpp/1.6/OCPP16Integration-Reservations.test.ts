/**
 * @file Tests for OCPP 1.6 Reservation integration flows
 * @module OCPP 1.6 — §8.2 ReserveNow, §8.1 CancelReservation, §5.11 RemoteStartTransaction
 * @description Multi-step integration tests for reservation lifecycle:
 * ReserveNow → CancelReservation and ReserveNow → RemoteStartTransaction flows.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type {
  OCPP16CancelReservationRequest,
  OCPP16ReserveNowRequest,
  RemoteStartTransactionRequest,
} from '../../../../src/types/index.js'

import {
  GenericStatus,
  OCPP16AuthorizationStatus,
  OCPP16ReservationStatus,
  OCPP16StandardParametersKey,
} from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import {
  createOCPP16IncomingRequestTestContext,
  type OCPP16IncomingRequestTestContext,
  ReservationFixtures,
  setMockRequestHandler,
  upsertConfigurationKey,
} from './OCPP16TestUtils.js'

/**
 * Enable the Reservation feature profile and mock auth to accept requests.
 * @param context - Test context with station and service
 */
function enableReservationProfile (context: OCPP16IncomingRequestTestContext): void {
  const { station } = context
  upsertConfigurationKey(
    station,
    OCPP16StandardParametersKey.SupportedFeatureProfiles,
    'Core,Reservation'
  )
  upsertConfigurationKey(
    station,
    OCPP16StandardParametersKey.ReserveConnectorZeroSupported,
    'false'
  )
  const stationWithReserve = station as ChargingStation & {
    getReserveConnectorZeroSupported: () => boolean
  }
  stationWithReserve.getReserveConnectorZeroSupported = () => false
  // Mock auth: remote authorization returns Accepted
  setMockRequestHandler(station, async () =>
    Promise.resolve({ idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } })
  )
}

await describe('OCPP16 Integration — Reservation Flow', async () => {
  let context: OCPP16IncomingRequestTestContext

  beforeEach(() => {
    context = createOCPP16IncomingRequestTestContext()
  })

  afterEach(() => {
    standardCleanup()
  })

  // ===========================================================================
  // Reserve → Cancel
  // ===========================================================================

  await describe('ReserveNow → CancelReservation', async () => {
    await it('should reserve then cancel, restoring connector to available', async () => {
      // Arrange
      const { station, testableService } = context
      enableReservationProfile(context)
      const reservation = ReservationFixtures.createReservation(1, 100, 'TAG-RESERVE-CANCEL')
      const reserveRequest: OCPP16ReserveNowRequest = {
        connectorId: reservation.connectorId,
        expiryDate: reservation.expiryDate,
        idTag: reservation.idTag,
        reservationId: reservation.reservationId,
      }

      // Act — reserve
      const reserveResponse = await testableService.handleRequestReserveNow(station, reserveRequest)

      // Assert — reservation accepted and stored
      assert.strictEqual(reserveResponse.status, OCPP16ReservationStatus.ACCEPTED)
      const connectorAfterReserve = station.getConnectorStatus(1)
      if (connectorAfterReserve == null) {
        assert.fail('Expected connector to be defined after reserve')
      }
      if (connectorAfterReserve.reservation == null) {
        assert.fail('Expected reservation to be defined after reserve')
      }
      assert.strictEqual(connectorAfterReserve.reservation.reservationId, 100)
      assert.strictEqual(connectorAfterReserve.reservation.idTag, 'TAG-RESERVE-CANCEL')

      // Act — cancel
      const cancelRequest: OCPP16CancelReservationRequest = { reservationId: 100 }
      const cancelResponse = await testableService.handleRequestCancelReservation(
        station,
        cancelRequest
      )

      // Assert — cancellation accepted and reservation cleared
      assert.strictEqual(cancelResponse.status, GenericStatus.Accepted)
      const connectorAfterCancel = station.getConnectorStatus(1)
      assert.notStrictEqual(connectorAfterCancel, undefined)
      assert.strictEqual(connectorAfterCancel?.reservation, undefined)
    })
  })

  // ===========================================================================
  // Reserve → Start (same connector)
  // ===========================================================================

  await describe('ReserveNow → RemoteStartTransaction', async () => {
    await it('should accept remote start on a reserved connector with matching idTag', async () => {
      // Arrange
      const { station, testableService } = context
      enableReservationProfile(context)
      const idTag = 'TAG-RESERVE-START'
      const reservation = ReservationFixtures.createReservation(1, 200, idTag)
      const reserveRequest: OCPP16ReserveNowRequest = {
        connectorId: reservation.connectorId,
        expiryDate: reservation.expiryDate,
        idTag: reservation.idTag,
        reservationId: reservation.reservationId,
      }

      // Act — reserve
      const reserveResponse = await testableService.handleRequestReserveNow(station, reserveRequest)
      assert.strictEqual(reserveResponse.status, OCPP16ReservationStatus.ACCEPTED)

      // Act — remote start on same connector with matching idTag
      const startRequest: RemoteStartTransactionRequest = {
        connectorId: 1,
        idTag,
      }
      const startResponse = await testableService.handleRequestRemoteStartTransaction(
        station,
        startRequest
      )

      // Assert — remote start accepted on the reserved connector
      assert.strictEqual(startResponse.status, GenericStatus.Accepted)
    })
  })

  // ===========================================================================
  // Reserve → Start on different connector
  // ===========================================================================

  await describe('ReserveNow connector 1 → RemoteStartTransaction connector 2', async () => {
    await it('should preserve reservation on connector 1 when starting on connector 2', async () => {
      // Arrange
      const { station, testableService } = context
      enableReservationProfile(context)
      const reservation = ReservationFixtures.createReservation(1, 300, 'TAG-CONN1')
      const reserveRequest: OCPP16ReserveNowRequest = {
        connectorId: reservation.connectorId,
        expiryDate: reservation.expiryDate,
        idTag: reservation.idTag,
        reservationId: reservation.reservationId,
      }

      // Act — reserve connector 1
      const reserveResponse = await testableService.handleRequestReserveNow(station, reserveRequest)
      assert.strictEqual(reserveResponse.status, OCPP16ReservationStatus.ACCEPTED)

      // Act — remote start on connector 2 (different connector)
      const startRequest: RemoteStartTransactionRequest = {
        connectorId: 2,
        idTag: 'TAG-CONN2',
      }
      const startResponse = await testableService.handleRequestRemoteStartTransaction(
        station,
        startRequest
      )

      // Assert — start accepted on connector 2
      assert.strictEqual(startResponse.status, GenericStatus.Accepted)

      // Assert — connector 1 reservation unchanged
      const connector1 = station.getConnectorStatus(1)
      if (connector1 == null) {
        assert.fail('Expected connector 1 to be defined')
      }
      if (connector1.reservation == null) {
        assert.fail('Expected reservation to be defined on connector 1')
      }
      assert.strictEqual(connector1.reservation.reservationId, 300)
      assert.strictEqual(connector1.reservation.idTag, 'TAG-CONN1')

      // Assert — connector 2 has no reservation
      const connector2 = station.getConnectorStatus(2)
      assert.notStrictEqual(connector2, undefined)
      assert.strictEqual(connector2?.reservation, undefined)
    })
  })

  // ===========================================================================
  // Double reservation on same connector
  // ===========================================================================

  await describe('Double ReserveNow on same connector', async () => {
    await it('should replace existing reservation when new reservation is added', async () => {
      // Arrange
      const { station, testableService } = context
      enableReservationProfile(context)
      const firstReservation = ReservationFixtures.createReservation(1, 400, 'TAG-FIRST')
      const firstRequest: OCPP16ReserveNowRequest = {
        connectorId: firstReservation.connectorId,
        expiryDate: firstReservation.expiryDate,
        idTag: firstReservation.idTag,
        reservationId: firstReservation.reservationId,
      }

      // Act — first reservation
      const firstResponse = await testableService.handleRequestReserveNow(station, firstRequest)
      assert.strictEqual(firstResponse.status, OCPP16ReservationStatus.ACCEPTED)

      // Verify first reservation stored
      const connectorAfterFirst = station.getConnectorStatus(1)
      assert.strictEqual(connectorAfterFirst?.reservation?.reservationId, 400)

      // Act — second reservation with different ID on same connector
      const secondReservation = ReservationFixtures.createReservation(1, 401, 'TAG-SECOND')
      const secondRequest: OCPP16ReserveNowRequest = {
        connectorId: secondReservation.connectorId,
        expiryDate: secondReservation.expiryDate,
        idTag: secondReservation.idTag,
        reservationId: secondReservation.reservationId,
      }
      const secondResponse = await testableService.handleRequestReserveNow(station, secondRequest)

      // Assert — second reservation accepted, replaces first
      assert.strictEqual(secondResponse.status, OCPP16ReservationStatus.ACCEPTED)
      const connectorAfterSecond = station.getConnectorStatus(1)
      if (connectorAfterSecond == null) {
        assert.fail('Expected connector to be defined after second reservation')
      }
      if (connectorAfterSecond.reservation == null) {
        assert.fail('Expected reservation to be defined after second reservation')
      }
      assert.strictEqual(connectorAfterSecond.reservation.reservationId, 401)
      assert.strictEqual(connectorAfterSecond.reservation.idTag, 'TAG-SECOND')
    })
  })

  // ===========================================================================
  // Reserve → Cancel non-existent (wrong ID)
  // ===========================================================================

  await describe('ReserveNow → CancelReservation with wrong ID', async () => {
    await it('should reject cancel with wrong ID and preserve original reservation', async () => {
      // Arrange
      const { station, testableService } = context
      enableReservationProfile(context)
      const reservation = ReservationFixtures.createReservation(1, 500, 'TAG-KEEP')
      const reserveRequest: OCPP16ReserveNowRequest = {
        connectorId: reservation.connectorId,
        expiryDate: reservation.expiryDate,
        idTag: reservation.idTag,
        reservationId: reservation.reservationId,
      }

      // Act — create reservation
      const reserveResponse = await testableService.handleRequestReserveNow(station, reserveRequest)
      assert.strictEqual(reserveResponse.status, OCPP16ReservationStatus.ACCEPTED)

      // Act — cancel with wrong reservation ID
      const cancelRequest: OCPP16CancelReservationRequest = { reservationId: 999 }
      const cancelResponse = await testableService.handleRequestCancelReservation(
        station,
        cancelRequest
      )

      // Assert — cancellation rejected
      assert.strictEqual(cancelResponse.status, GenericStatus.Rejected)

      // Assert — original reservation still intact
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus == null) {
        assert.fail('Expected connector to be defined')
      }
      if (connectorStatus.reservation == null) {
        assert.fail('Expected reservation to be defined')
      }
      assert.strictEqual(connectorStatus.reservation.reservationId, 500)
      assert.strictEqual(connectorStatus.reservation.idTag, 'TAG-KEEP')
    })
  })
})
