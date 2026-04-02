/**
 * @file Tests for OCPP16IncomingRequestService Reservation handlers
 * @description Unit tests for OCPP 1.6 ReserveNow (§8.2) and CancelReservation (§8.1)
 * incoming request handlers
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type {
  OCPP16CancelReservationRequest,
  OCPP16ReserveNowRequest,
} from '../../../../src/types/index.js'

import {
  GenericStatus,
  OCPP16AuthorizationStatus,
  OCPP16ChargePointStatus,
  OCPP16ReservationStatus,
  OCPP16StandardParametersKey,
} from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_ID_TAG } from '../../ChargingStationTestConstants.js'
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
 * @param reserveConnectorZeroSupported - Whether connector 0 reservation is supported
 */
function enableReservationProfile (
  context: OCPP16IncomingRequestTestContext,
  reserveConnectorZeroSupported = false
): void {
  const { station } = context
  upsertConfigurationKey(
    station,
    OCPP16StandardParametersKey.SupportedFeatureProfiles,
    'Core,Reservation'
  )
  upsertConfigurationKey(
    station,
    OCPP16StandardParametersKey.ReserveConnectorZeroSupported,
    reserveConnectorZeroSupported ? 'true' : 'false'
  )
  // Mock getReserveConnectorZeroSupported (not on mock station by default)
  const stationWithReserve = station as ChargingStation & {
    getReserveConnectorZeroSupported: () => boolean
  }
  stationWithReserve.getReserveConnectorZeroSupported = () => reserveConnectorZeroSupported
  // Mock auth: remote authorization returns Accepted
  setMockRequestHandler(station, async () =>
    Promise.resolve({ idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } })
  )
}

await describe('OCPP16IncomingRequestService — Reservation', async () => {
  let context: OCPP16IncomingRequestTestContext

  beforeEach(() => {
    context = createOCPP16IncomingRequestTestContext()
  })

  afterEach(() => {
    standardCleanup()
  })

  // =========================================================================
  // ReserveNow (§8.2)
  // =========================================================================

  await describe('handleRequestReserveNow', async () => {
    // @spec §8.2 — TC_049_CS
    await it('should accept reservation for available connector', async () => {
      // Arrange
      const { station, testableService } = context
      enableReservationProfile(context)
      const reservation = ReservationFixtures.createReservation(1, 1, TEST_ID_TAG)
      const request: OCPP16ReserveNowRequest = {
        connectorId: reservation.connectorId,
        expiryDate: reservation.expiryDate,
        idTag: reservation.idTag,
        reservationId: reservation.reservationId,
      }

      // Act
      const response = await testableService.handleRequestReserveNow(station, request)

      // Assert
      assert.strictEqual(response.status, OCPP16ReservationStatus.ACCEPTED)
    })

    // @spec §8.2 — TC_050_CS
    await it('should accept reservation for connectorId=0 when ReserveConnectorZeroSupported is true', async () => {
      // Arrange
      const { station, testableService } = context
      enableReservationProfile(context, true)
      const request: OCPP16ReserveNowRequest = {
        connectorId: 0,
        expiryDate: new Date(Date.now() + 3600000),
        idTag: TEST_ID_TAG,
        reservationId: 10,
      }

      // Act
      const response = await testableService.handleRequestReserveNow(station, request)

      // Assert
      assert.strictEqual(response.status, OCPP16ReservationStatus.ACCEPTED)
    })

    // @spec §8.2 — TC_050_CS
    await it('should reject reservation for connectorId=0 when ReserveConnectorZeroSupported is false', async () => {
      // Arrange
      const { station, testableService } = context
      enableReservationProfile(context, false)
      const request: OCPP16ReserveNowRequest = {
        connectorId: 0,
        expiryDate: new Date(Date.now() + 3600000),
        idTag: TEST_ID_TAG,
        reservationId: 10,
      }

      // Act
      const response = await testableService.handleRequestReserveNow(station, request)

      // Assert
      assert.strictEqual(response.status, OCPP16ReservationStatus.REJECTED)
    })

    // @spec §8.2 — TC_052_CS
    await it('should return occupied when connector has active transaction', async () => {
      // Arrange
      const { station, testableService } = context
      enableReservationProfile(context)
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.status = OCPP16ChargePointStatus.Charging
      }
      const request: OCPP16ReserveNowRequest = {
        connectorId: 1,
        expiryDate: new Date(Date.now() + 3600000),
        idTag: TEST_ID_TAG,
        reservationId: 2,
      }

      // Act
      const response = await testableService.handleRequestReserveNow(station, request)

      // Assert
      assert.strictEqual(response.status, OCPP16ReservationStatus.OCCUPIED)
    })

    await it('should reject reservation when feature profile is not enabled', async () => {
      // Arrange
      const { station, testableService } = context
      // Do NOT enable Reservation feature profile
      upsertConfigurationKey(station, OCPP16StandardParametersKey.SupportedFeatureProfiles, 'Core')
      const request: OCPP16ReserveNowRequest = {
        connectorId: 1,
        expiryDate: new Date(Date.now() + 3600000),
        idTag: TEST_ID_TAG,
        reservationId: 3,
      }

      // Act
      const response = await testableService.handleRequestReserveNow(station, request)

      // Assert
      assert.strictEqual(response.status, OCPP16ReservationStatus.REJECTED)
    })

    await it('should reject reservation for non-existing connectorId', async () => {
      // Arrange
      const { station, testableService } = context
      enableReservationProfile(context)
      const request: OCPP16ReserveNowRequest = {
        connectorId: 99,
        expiryDate: new Date(Date.now() + 3600000),
        idTag: TEST_ID_TAG,
        reservationId: 4,
      }

      // Act
      const response = await testableService.handleRequestReserveNow(station, request)

      // Assert
      assert.strictEqual(response.status, OCPP16ReservationStatus.REJECTED)
    })
  })

  // =========================================================================
  // CancelReservation (§8.1)
  // =========================================================================

  await describe('handleRequestCancelReservation', async () => {
    // @spec §8.1 — TC_051_CS
    await it('should accept cancellation for existing reservation', async () => {
      // Arrange
      const { station, testableService } = context
      enableReservationProfile(context)

      // First create a reservation via ReserveNow
      const reservation = ReservationFixtures.createReservation(1, 42, TEST_ID_TAG)
      const reserveRequest: OCPP16ReserveNowRequest = {
        connectorId: reservation.connectorId,
        expiryDate: reservation.expiryDate,
        idTag: reservation.idTag,
        reservationId: reservation.reservationId,
      }
      const reserveResponse = await testableService.handleRequestReserveNow(station, reserveRequest)
      assert.strictEqual(reserveResponse.status, OCPP16ReservationStatus.ACCEPTED)

      // Act — cancel the reservation
      const cancelRequest: OCPP16CancelReservationRequest = {
        reservationId: 42,
      }
      const response = await testableService.handleRequestCancelReservation(station, cancelRequest)

      // Assert
      assert.strictEqual(response.status, GenericStatus.Accepted)
    })

    await it('should reject cancellation for non-existent reservation', async () => {
      // Arrange
      const { station, testableService } = context
      enableReservationProfile(context)
      const cancelRequest: OCPP16CancelReservationRequest = {
        reservationId: 999,
      }

      // Act
      const response = await testableService.handleRequestCancelReservation(station, cancelRequest)

      // Assert
      assert.strictEqual(response.status, GenericStatus.Rejected)
    })

    await it('should reject cancellation when feature profile is not enabled', async () => {
      // Arrange
      const { station, testableService } = context
      // Do NOT enable Reservation feature profile
      upsertConfigurationKey(station, OCPP16StandardParametersKey.SupportedFeatureProfiles, 'Core')
      const cancelRequest: OCPP16CancelReservationRequest = {
        reservationId: 1,
      }

      // Act
      const response = await testableService.handleRequestCancelReservation(station, cancelRequest)

      // Assert
      assert.strictEqual(response.status, GenericStatus.Rejected)
    })
  })
})
