/**
 * @file Tests for FinishingStatusDelay
 * @description Verifies the postTransactionDelay feature for both OCPP 1.6 and 2.0.x,
 * covering delayed Finishing→Available transitions, zero-delay immediate transitions,
 * RemoteStartTransaction guards during finishing, and availability re-evaluation.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../src/charging-station/index.js'
import type { OCPP16ResponseService } from '../../../src/charging-station/ocpp/1.6/OCPP16ResponseService.js'
import type {
  OCPP16StopTransactionRequest,
  OCPP16StopTransactionResponse,
  RemoteStartTransactionRequest,
} from '../../../src/types/index.js'

import { OCPP16ServiceUtils } from '../../../src/charging-station/ocpp/1.6/OCPP16ServiceUtils.js'
import { OCPP20ServiceUtils } from '../../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import {
  AvailabilityType,
  ConnectorStatusEnum,
  GenericStatus,
  OCPP16AuthorizationStatus,
  OCPP16ChargePointStatus,
  OCPP16RequestCommand,
  OCPPVersion,
} from '../../../src/types/index.js'
import {
  flushMicrotasks,
  setupConnectorWithTransaction,
  standardCleanup,
  withMockTimers,
} from '../../helpers/TestLifecycleHelpers.js'
import { TEST_ID_TAG } from '../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../helpers/StationHelpers.js'
import {
  createOCPP16IncomingRequestTestContext,
  createOCPP16ResponseTestContext,
  type OCPP16IncomingRequestTestContext,
  setMockRequestHandler,
} from './1.6/OCPP16TestUtils.js'

await describe('FinishingStatusDelay', async () => {
  afterEach(() => {
    standardCleanup()
  })

  // ─── OCPP 1.6 ────────────────────────────────────────────────────────

  await describe('OCPP 1.6', async () => {
    let station: ChargingStation
    let responseService: OCPP16ResponseService
    let requestCalls: unknown[][]

    beforeEach(() => {
      const ctx = createOCPP16ResponseTestContext({
        stationInfo: { postTransactionDelay: 5 },
      })
      station = ctx.station
      responseService = ctx.responseService
      station.started = true

      // Track all requestHandler calls to verify StatusNotification sequence
      requestCalls = []
      setMockRequestHandler(station, (...args: unknown[]) => {
        requestCalls.push(args)
        return Promise.resolve({})
      })

      // Mock meter value helpers to avoid real timer setup
      mock.method(OCPP16ServiceUtils, 'startUpdatedMeterValues', () => {
        /* noop */
      })
      mock.method(OCPP16ServiceUtils, 'stopUpdatedMeterValues', () => {
        /* noop */
      })
    })

    await it('should send Finishing then Available after configured delay for OCPP 1.6', async t => {
      // Arrange
      setupConnectorWithTransaction(station, 1, { transactionId: 100 })
      const requestPayload: OCPP16StopTransactionRequest = {
        meterStop: 1000,
        timestamp: new Date(),
        transactionId: 100,
      }
      const responsePayload: OCPP16StopTransactionResponse = {
        idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED },
      }

      // Act
      await withMockTimers(t, ['setTimeout'], async () => {
        const promise = responseService.responseHandler(
          station,
          OCPP16RequestCommand.STOP_TRANSACTION,
          responsePayload,
          requestPayload
        )
        // Drain microtasks so async code advances past awaits before sleep()
        for (let i = 0; i < 10; i++) {
          await flushMicrotasks()
        }
        t.mock.timers.tick(5000)
        // Drain remaining microtasks after sleep resolves
        for (let i = 0; i < 10; i++) {
          await flushMicrotasks()
        }
        await promise
      })

      // Assert — StatusNotification sequence: Finishing then Available
      const statusCalls = requestCalls.filter(
        call =>
          call[1] === OCPP16RequestCommand.STATUS_NOTIFICATION &&
          (call[2] as Record<string, unknown>).connectorId === 1
      )
      assert.ok(
        statusCalls.length >= 2,
        `Expected at least 2 status calls, got ${String(statusCalls.length)}`
      )
      const firstPayload = statusCalls[0][2] as Record<string, unknown>
      assert.strictEqual(firstPayload.status, OCPP16ChargePointStatus.Finishing)
      const secondPayload = statusCalls[1][2] as Record<string, unknown>
      assert.strictEqual(secondPayload.status, OCPP16ChargePointStatus.Available)
    })

    await it('should send Available immediately when postTransactionDelay is 0 for OCPP 1.6', async () => {
      // Arrange — override postTransactionDelay to 0
      assert.ok(station.stationInfo != null, 'stationInfo should be defined')
      station.stationInfo.postTransactionDelay = 0
      setupConnectorWithTransaction(station, 1, { transactionId: 200 })
      const requestPayload: OCPP16StopTransactionRequest = {
        meterStop: 2000,
        timestamp: new Date(),
        transactionId: 200,
      }
      const responsePayload: OCPP16StopTransactionResponse = {
        idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED },
      }

      // Act
      await responseService.responseHandler(
        station,
        OCPP16RequestCommand.STOP_TRANSACTION,
        responsePayload,
        requestPayload
      )

      // Assert — no Finishing status should have been sent
      const statusCalls = requestCalls.filter(
        call =>
          call[1] === OCPP16RequestCommand.STATUS_NOTIFICATION &&
          (call[2] as Record<string, unknown>).connectorId === 1
      )
      const finishingCalls = statusCalls.filter(
        call => (call[2] as Record<string, unknown>).status === OCPP16ChargePointStatus.Finishing
      )
      assert.strictEqual(
        finishingCalls.length,
        0,
        'No Finishing status should be sent when delay is 0'
      )
      // Should have sent Available directly
      const availableCalls = statusCalls.filter(
        call => (call[2] as Record<string, unknown>).status === OCPP16ChargePointStatus.Available
      )
      assert.ok(availableCalls.length >= 1, 'Should send Available status')
    })

    await it('should send Unavailable after delay when station becomes unavailable during finishing', async t => {
      // Arrange
      setupConnectorWithTransaction(station, 1, { transactionId: 300 })
      // Make connector 0 (station-level) unavailable to simulate station going offline
      const connector0 = station.getConnectorStatus(0)
      if (connector0 != null) {
        connector0.availability = AvailabilityType.Inoperative
      }

      const requestPayload: OCPP16StopTransactionRequest = {
        meterStop: 3000,
        timestamp: new Date(),
        transactionId: 300,
      }
      const responsePayload: OCPP16StopTransactionResponse = {
        idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED },
      }

      // Act
      await withMockTimers(t, ['setTimeout'], async () => {
        const promise = responseService.responseHandler(
          station,
          OCPP16RequestCommand.STOP_TRANSACTION,
          responsePayload,
          requestPayload
        )
        // Drain microtasks so async code advances past awaits before sleep()
        for (let i = 0; i < 10; i++) {
          await flushMicrotasks()
        }
        t.mock.timers.tick(5000)
        for (let i = 0; i < 10; i++) {
          await flushMicrotasks()
        }
        await promise
      })

      // Assert — after delay, re-evaluates and sends Unavailable
      const statusCalls = requestCalls.filter(
        call =>
          call[1] === OCPP16RequestCommand.STATUS_NOTIFICATION &&
          (call[2] as Record<string, unknown>).connectorId === 1
      )
      assert.ok(
        statusCalls.length >= 2,
        `Expected at least 2 status calls, got ${String(statusCalls.length)}`
      )
      const firstPayload = statusCalls[0][2] as Record<string, unknown>
      assert.strictEqual(firstPayload.status, OCPP16ChargePointStatus.Finishing)
      const secondPayload = statusCalls[1][2] as Record<string, unknown>
      assert.strictEqual(secondPayload.status, OCPP16ChargePointStatus.Unavailable)
    })
  })

  // ─── OCPP 2.0.x ──────────────────────────────────────────────────────

  await describe('OCPP 2.0.x', async () => {
    await it('should delay Available transition after transaction end for OCPP 2.0.x', async t => {
      // Arrange
      const requestHandler = mock.fn(async (..._args: unknown[]) => Promise.resolve({}))
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_20,
        started: true,
        stationInfo: {
          ocppVersion: OCPPVersion.VERSION_20,
          postTransactionDelay: 3,
        },
      })
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus == null) {
        assert.fail('Expected connector 1 to exist')
      }
      connectorStatus.transactionStarted = true
      connectorStatus.transactionId = 'tx-1'

      // Act
      await withMockTimers(t, ['setTimeout'], async () => {
        const promise = OCPP20ServiceUtils.cleanupEndedTransaction(station, 1, connectorStatus)
        for (let i = 0; i < 10; i++) {
          await flushMicrotasks()
        }
        t.mock.timers.tick(3000)
        for (let i = 0; i < 10; i++) {
          await flushMicrotasks()
        }
        await promise
      })

      // Assert — connector should be reset after cleanup
      assert.strictEqual(connectorStatus.transactionStarted, false)
      assert.strictEqual(connectorStatus.transactionId, undefined)
      assert.strictEqual(connectorStatus.locked, false)
      // requestHandler should have been called for StatusNotification
      assert.ok(requestHandler.mock.calls.length >= 1, 'Should send StatusNotification')
    })

    await it('should send Available immediately when postTransactionDelay is 0 for OCPP 2.0.x', async () => {
      // Arrange
      const requestHandler = mock.fn(async (..._args: unknown[]) => Promise.resolve({}))
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_20,
        stationInfo: {
          ocppVersion: OCPPVersion.VERSION_20,
          postTransactionDelay: 0,
        },
      })
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus == null) {
        assert.fail('Expected connector 1 to exist')
      }
      connectorStatus.transactionStarted = true
      connectorStatus.transactionId = 'tx-2'

      // Act — no timer mocking needed since delay is 0
      await OCPP20ServiceUtils.cleanupEndedTransaction(station, 1, connectorStatus)

      // Assert — connector should be reset immediately
      assert.strictEqual(connectorStatus.transactionStarted, false)
      assert.strictEqual(connectorStatus.transactionId, undefined)
      assert.strictEqual(connectorStatus.locked, false)
      // Should have sent StatusNotification
      assert.ok(requestHandler.mock.calls.length >= 1, 'Should send StatusNotification')
    })
  })

  // ─── RemoteStartTransaction guard ────────────────────────────────────

  await describe('RemoteStartTransaction guard', async () => {
    let testContext: OCPP16IncomingRequestTestContext

    beforeEach(() => {
      testContext = createOCPP16IncomingRequestTestContext({
        stationInfo: { postTransactionDelay: 5 },
      })
    })

    await it('should reject RemoteStartTransaction when connector is in Finishing state', async () => {
      // Arrange
      const { station, testableService } = testContext
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.status = ConnectorStatusEnum.Finishing
      }
      const request: RemoteStartTransactionRequest = {
        connectorId: 1,
        idTag: TEST_ID_TAG,
      }

      // Act
      const response = await testableService.handleRequestRemoteStartTransaction(station, request)

      // Assert
      assert.strictEqual(response.status, GenericStatus.Rejected)
    })

    await it('should accept RemoteStartTransaction when connector is Available', async () => {
      // Arrange
      const { station, testableService } = testContext
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.status = ConnectorStatusEnum.Available
      }
      const request: RemoteStartTransactionRequest = {
        connectorId: 1,
        idTag: TEST_ID_TAG,
      }

      // Act
      const response = await testableService.handleRequestRemoteStartTransaction(station, request)

      // Assert
      assert.strictEqual(response.status, GenericStatus.Accepted)
    })
  })
})
