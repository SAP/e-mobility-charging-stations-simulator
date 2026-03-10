/**
 * @file Tests for OCPP16IncomingRequestService — RemoteStopTransaction and UnlockConnector
 * @description Verifies the RemoteStopTransaction (§5.12) and UnlockConnector (§5.17)
 * incoming request handlers for OCPP 1.6, covering accepted/rejected transaction lookups,
 * connector unlock with and without active transactions, and invalid connector handling.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/ChargingStation.js'
import type { TestableOCPP16IncomingRequestService } from '../../../../src/charging-station/ocpp/1.6/__testable__/index.js'
import type { MockOCPPRequestService } from '../../ChargingStationTestUtils.js'

import { OCPP16UnlockStatus } from '../../../../src/types/ocpp/1.6/Responses.js'
import { OCPP16AuthorizationStatus } from '../../../../src/types/ocpp/1.6/Transaction.js'
import { GenericStatus } from '../../../../src/types/ocpp/Common.js'
import {
  setupConnectorWithTransaction,
  standardCleanup,
} from '../../../helpers/TestLifecycleHelpers.js'
import { createOCPP16IncomingRequestTestContext } from './OCPP16TestUtils.js'

await describe('OCPP16IncomingRequestService — RemoteStopTransaction and UnlockConnector', async () => {
  let station: ChargingStation
  let testableService: TestableOCPP16IncomingRequestService

  beforeEach(() => {
    const ctx = createOCPP16IncomingRequestTestContext()
    station = ctx.station
    testableService = ctx.testableService

    // Mock requestHandler so OCPP requests (StatusNotification, StopTransaction) resolve
    ;(station.ocppRequestService as unknown as MockOCPPRequestService).requestHandler =
      async () => Promise.resolve({ idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } })

    // Mock stopTransactionOnConnector — called by UnlockConnector when transaction is active
    station.stopTransactionOnConnector = async () =>
      Promise.resolve({ idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } })
  })

  afterEach(() => {
    standardCleanup()
  })

  // ─── RemoteStopTransaction (§5.12) ────────────────────────────────────

  await describe('handleRequestRemoteStopTransaction', async () => {
    // @spec §5.12 — TC_016_CS
    await it('should return Accepted when transactionId matches an active connector', () => {
      // Arrange
      setupConnectorWithTransaction(station, 1, { transactionId: 42 })

      // Act
      const response = testableService.handleRequestRemoteStopTransaction(station, {
        transactionId: 42,
      })

      // Assert
      assert.strictEqual(response.status, GenericStatus.Accepted)
    })

    // @spec §5.12 — TC_020_CS
    await it('should return Rejected when transactionId does not match any connector', () => {
      // Act
      const response = testableService.handleRequestRemoteStopTransaction(station, {
        transactionId: 99999,
      })

      // Assert
      assert.strictEqual(response.status, GenericStatus.Rejected)
    })

    await it('should return a response with exactly one status property', () => {
      // Act
      const response = testableService.handleRequestRemoteStopTransaction(station, {
        transactionId: 1,
      })

      // Assert
      assert.strictEqual(Object.keys(response).length, 1)
      assert.notStrictEqual(response.status, undefined)
    })
  })

  // ─── UnlockConnector (§5.17) ──────────────────────────────────────────

  await describe('handleRequestUnlockConnector', async () => {
    // @spec §5.17 — TC_026_CS
    await it('should return Unlocked for valid connectorId with no active transaction', async () => {
      // Act
      const response = await testableService.handleRequestUnlockConnector(station, {
        connectorId: 1,
      })

      // Assert
      assert.strictEqual(response.status, OCPP16UnlockStatus.UNLOCKED)
    })

    // @spec §5.17 — TC_027_CS
    await it('should return Unlocked when connector has active transaction and stop succeeds', async () => {
      // Arrange
      setupConnectorWithTransaction(station, 1, { transactionId: 100 })

      // Act
      const response = await testableService.handleRequestUnlockConnector(station, {
        connectorId: 1,
      })

      // Assert
      assert.strictEqual(response.status, OCPP16UnlockStatus.UNLOCKED)
    })

    // @spec §5.17 — TC_029_CS
    await it('should return NotSupported for connectorId=0', async () => {
      // Act
      const response = await testableService.handleRequestUnlockConnector(station, {
        connectorId: 0,
      })

      // Assert
      assert.strictEqual(response.status, OCPP16UnlockStatus.NOT_SUPPORTED)
    })

    // @spec §5.17 — TC_037_CS
    await it('should return NotSupported for non-existent connectorId', async () => {
      // Act
      const response = await testableService.handleRequestUnlockConnector(station, {
        connectorId: 99,
      })

      // Assert
      assert.strictEqual(response.status, OCPP16UnlockStatus.NOT_SUPPORTED)
    })

    await it('should return UnlockFailed when active transaction stop is rejected', async () => {
      // Arrange
      setupConnectorWithTransaction(station, 1, { transactionId: 200 })
      station.stopTransactionOnConnector = async () =>
        Promise.resolve({ idTagInfo: { status: OCPP16AuthorizationStatus.INVALID } })

      // Act
      const response = await testableService.handleRequestUnlockConnector(station, {
        connectorId: 1,
      })

      // Assert
      assert.strictEqual(response.status, OCPP16UnlockStatus.UNLOCK_FAILED)
    })

    await it('should return a response with exactly one status property', async () => {
      // Act
      const response = await testableService.handleRequestUnlockConnector(station, {
        connectorId: 1,
      })

      // Assert
      assert.strictEqual(Object.keys(response).length, 1)
      assert.notStrictEqual(response.status, undefined)
    })
  })
})
