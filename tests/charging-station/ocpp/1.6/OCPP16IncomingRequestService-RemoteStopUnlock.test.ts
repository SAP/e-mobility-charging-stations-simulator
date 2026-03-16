/**
 * @file Tests for OCPP16IncomingRequestService — RemoteStopTransaction and UnlockConnector
 * @description Verifies the RemoteStopTransaction (§5.12) and UnlockConnector (§5.17)
 * incoming request handlers for OCPP 1.6, covering accepted/rejected transaction lookups,
 * connector unlock with and without active transactions, and invalid connector handling.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/ChargingStation.js'
import type { TestableOCPP16IncomingRequestService } from '../../../../src/charging-station/ocpp/1.6/__testable__/index.js'
import type { RemoteStopTransactionRequest } from '../../../../src/types/ocpp/1.6/Requests.js'
import type { GenericResponse } from '../../../../src/types/ocpp/Common.js'

import { OCPP16IncomingRequestService } from '../../../../src/charging-station/ocpp/1.6/OCPP16IncomingRequestService.js'
import { OCPP16ServiceUtils } from '../../../../src/charging-station/ocpp/1.6/OCPP16ServiceUtils.js'
import { OCPP16IncomingRequestCommand } from '../../../../src/types/ocpp/1.6/Requests.js'
import { OCPP16UnlockStatus } from '../../../../src/types/ocpp/1.6/Responses.js'
import { OCPP16AuthorizationStatus } from '../../../../src/types/ocpp/1.6/Transaction.js'
import { GenericStatus } from '../../../../src/types/ocpp/Common.js'
import {
  flushMicrotasks,
  setupConnectorWithTransaction,
  standardCleanup,
} from '../../../helpers/TestLifecycleHelpers.js'
import {
  createOCPP16IncomingRequestTestContext,
  createOCPP16ListenerStation,
  setMockRequestHandler,
} from './OCPP16TestUtils.js'

await describe('OCPP16IncomingRequestService — RemoteStopTransaction and UnlockConnector', async () => {
  let station: ChargingStation
  let testableService: TestableOCPP16IncomingRequestService

  beforeEach(() => {
    const ctx = createOCPP16IncomingRequestTestContext()
    station = ctx.station
    testableService = ctx.testableService

    // Mock requestHandler so OCPP requests (StatusNotification, StopTransaction) resolve
    setMockRequestHandler(station, async () =>
      Promise.resolve({ idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } })
    )

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

  // ─── REMOTE_STOP_TRANSACTION event listener ───────────────────────────

  await describe('REMOTE_STOP_TRANSACTION event listener', async () => {
    let incomingRequestService: OCPP16IncomingRequestService
    let listenerStation: ChargingStation

    beforeEach(() => {
      incomingRequestService = new OCPP16IncomingRequestService()
      ;({ station: listenerStation } = createOCPP16ListenerStation('test-remote-stop-listener'))
    })

    afterEach(() => {
      standardCleanup()
    })

    await it('should register REMOTE_STOP_TRANSACTION event listener in constructor', () => {
      // Assert
      assert.strictEqual(
        incomingRequestService.listenerCount(OCPP16IncomingRequestCommand.REMOTE_STOP_TRANSACTION),
        1
      )
    })

    await it('should call remoteStopTransaction when response is Accepted', async () => {
      // Arrange
      setupConnectorWithTransaction(listenerStation, 1, { transactionId: 42 })

      const mockRemoteStop = mock.method(OCPP16ServiceUtils, 'remoteStopTransaction', () =>
        Promise.resolve({ status: GenericStatus.Accepted } satisfies GenericResponse)
      )

      const request: RemoteStopTransactionRequest = { transactionId: 42 }
      const response: GenericResponse = { status: GenericStatus.Accepted }

      // Act
      incomingRequestService.emit(
        OCPP16IncomingRequestCommand.REMOTE_STOP_TRANSACTION,
        listenerStation,
        request,
        response
      )

      // Flush microtask queue so the async .then() executes
      await flushMicrotasks()

      // Assert
      assert.strictEqual(mockRemoteStop.mock.callCount(), 1)
      assert.strictEqual(mockRemoteStop.mock.calls[0].arguments[0], listenerStation)
      assert.strictEqual(mockRemoteStop.mock.calls[0].arguments[1], 1)
    })

    await it('should NOT call remoteStopTransaction when response is Rejected', () => {
      // Arrange
      const mockRemoteStop = mock.method(OCPP16ServiceUtils, 'remoteStopTransaction', () =>
        Promise.resolve({ status: GenericStatus.Rejected } satisfies GenericResponse)
      )

      const request: RemoteStopTransactionRequest = { transactionId: 99 }
      const response: GenericResponse = { status: GenericStatus.Rejected }

      // Act
      incomingRequestService.emit(
        OCPP16IncomingRequestCommand.REMOTE_STOP_TRANSACTION,
        listenerStation,
        request,
        response
      )

      // Assert
      assert.strictEqual(mockRemoteStop.mock.callCount(), 0)
    })

    await it('should handle remoteStopTransaction failure gracefully', async () => {
      // Arrange
      setupConnectorWithTransaction(listenerStation, 1, { transactionId: 77 })

      mock.method(OCPP16ServiceUtils, 'remoteStopTransaction', () =>
        Promise.reject(new Error('remoteStopTransaction failed'))
      )

      const request: RemoteStopTransactionRequest = { transactionId: 77 }
      const response: GenericResponse = { status: GenericStatus.Accepted }

      // Act — should not throw
      incomingRequestService.emit(
        OCPP16IncomingRequestCommand.REMOTE_STOP_TRANSACTION,
        listenerStation,
        request,
        response
      )

      // Flush microtask queue so .catch() executes
      await flushMicrotasks()

      // Assert — no crash, test completes normally
    })
  })
})
