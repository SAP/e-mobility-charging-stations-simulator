/**
 * @file Tests for OCPP 1.6 Reservation integration flows
 * @description Multi-step integration tests for reservation lifecycle:
 * ReserveNow → CancelReservation and ReserveNow → RemoteStartTransaction flows.
 */

import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/ChargingStation.js'
import type {
  OCPP16CancelReservationRequest,
  OCPP16ReserveNowRequest,
  RemoteStartTransactionRequest,
} from '../../../../src/types/index.js'

import {
  GenericStatus,
  OCPP16AuthorizationStatus,
  OCPP16StandardParametersKey,
} from '../../../../src/types/index.js'
import { OCPP16ReservationStatus } from '../../../../src/types/ocpp/1.6/Responses.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import {
  createOCPP16IncomingRequestTestContext,
  type OCPP16IncomingRequestTestContext,
  ReservationFixtures,
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
  station.ocppRequestService.requestHandler = () =>
    Promise.resolve({ idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } })
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
      const reserveResponse = await testableService.handleRequestReserveNow(
        station,
        reserveRequest
      )

      // Assert — reservation accepted and stored
      expect(reserveResponse.status).toBe(OCPP16ReservationStatus.ACCEPTED)
      const connectorAfterReserve = station.getConnectorStatus(1)
      expect(connectorAfterReserve).toBeDefined()
      expect(connectorAfterReserve?.reservation).toBeDefined()
      expect(connectorAfterReserve?.reservation?.reservationId).toBe(100)
      expect(connectorAfterReserve?.reservation?.idTag).toBe('TAG-RESERVE-CANCEL')

      // Act — cancel
      const cancelRequest: OCPP16CancelReservationRequest = { reservationId: 100 }
      const cancelResponse = await testableService.handleRequestCancelReservation(
        station,
        cancelRequest
      )

      // Assert — cancellation accepted and reservation cleared
      expect(cancelResponse.status).toBe(GenericStatus.Accepted)
      const connectorAfterCancel = station.getConnectorStatus(1)
      expect(connectorAfterCancel).toBeDefined()
      expect(connectorAfterCancel?.reservation).toBe(undefined)
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
      const reserveResponse = await testableService.handleRequestReserveNow(
        station,
        reserveRequest
      )
      expect(reserveResponse.status).toBe(OCPP16ReservationStatus.ACCEPTED)

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
      expect(startResponse.status).toBe(GenericStatus.Accepted)
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
      const reserveResponse = await testableService.handleRequestReserveNow(
        station,
        reserveRequest
      )
      expect(reserveResponse.status).toBe(OCPP16ReservationStatus.ACCEPTED)

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
      expect(startResponse.status).toBe(GenericStatus.Accepted)

      // Assert — connector 1 reservation unchanged
      const connector1 = station.getConnectorStatus(1)
      expect(connector1).toBeDefined()
      expect(connector1?.reservation).toBeDefined()
      expect(connector1?.reservation?.reservationId).toBe(300)
      expect(connector1?.reservation?.idTag).toBe('TAG-CONN1')

      // Assert — connector 2 has no reservation
      const connector2 = station.getConnectorStatus(2)
      expect(connector2).toBeDefined()
      expect(connector2?.reservation).toBe(undefined)
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
      expect(firstResponse.status).toBe(OCPP16ReservationStatus.ACCEPTED)

      // Verify first reservation stored
      const connectorAfterFirst = station.getConnectorStatus(1)
      expect(connectorAfterFirst?.reservation?.reservationId).toBe(400)

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
      expect(secondResponse.status).toBe(OCPP16ReservationStatus.ACCEPTED)
      const connectorAfterSecond = station.getConnectorStatus(1)
      expect(connectorAfterSecond?.reservation?.reservationId).toBe(401)
      expect(connectorAfterSecond?.reservation?.idTag).toBe('TAG-SECOND')
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
      const reserveResponse = await testableService.handleRequestReserveNow(
        station,
        reserveRequest
      )
      expect(reserveResponse.status).toBe(OCPP16ReservationStatus.ACCEPTED)

      // Act — cancel with wrong reservation ID
      const cancelRequest: OCPP16CancelReservationRequest = { reservationId: 999 }
      const cancelResponse = await testableService.handleRequestCancelReservation(
        station,
        cancelRequest
      )

      // Assert — cancellation rejected
      expect(cancelResponse.status).toBe(GenericStatus.Rejected)

      // Assert — original reservation still intact
      const connector = station.getConnectorStatus(1)
      expect(connector).toBeDefined()
      expect(connector?.reservation).toBeDefined()
      expect(connector?.reservation?.reservationId).toBe(500)
      expect(connector?.reservation?.idTag).toBe('TAG-KEEP')
    })
  })
})
