/**
 * @file Tests for OCPP16ResponseService postTransactionDelay
 * @description Verifies the postTransactionDelay feature in OCPP 1.6 StopTransaction response
 * handling: Finishing→Available transitions, zero-delay immediate transitions,
 * availability re-evaluation, and shutdown-during-delay safety.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type { OCPP16ResponseService } from '../../../../src/charging-station/ocpp/1.6/OCPP16ResponseService.js'
import type {
  OCPP16StopTransactionRequest,
  OCPP16StopTransactionResponse,
} from '../../../../src/types/index.js'

import { OCPP16ServiceUtils } from '../../../../src/charging-station/ocpp/1.6/OCPP16ServiceUtils.js'
import {
  AvailabilityType,
  OCPP16AuthorizationStatus,
  OCPP16ChargePointStatus,
  OCPP16RequestCommand,
} from '../../../../src/types/index.js'
import {
  flushMicrotasks,
  setupConnectorWithTransaction,
  standardCleanup,
  withMockTimers,
} from '../../../helpers/TestLifecycleHelpers.js'
import { createOCPP16ResponseTestContext, setMockRequestHandler } from './OCPP16TestUtils.js'

await describe('OCPP16ResponseService — PostTransactionDelay', async () => {
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

    requestCalls = []
    setMockRequestHandler(station, (...args: unknown[]) => {
      requestCalls.push(args)
      return Promise.resolve({})
    })

    mock.method(OCPP16ServiceUtils, 'startUpdatedMeterValues', () => {
      /* noop */
    })
    mock.method(OCPP16ServiceUtils, 'stopUpdatedMeterValues', () => {
      /* noop */
    })
  })

  afterEach(() => {
    standardCleanup()
  })

  await it('should send Finishing then Available after configured delay', async t => {
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
      for (let i = 0; i < 10; i++) {
        await flushMicrotasks()
      }
      t.mock.timers.tick(5000)
      for (let i = 0; i < 10; i++) {
        await flushMicrotasks()
      }
      await promise
    })

    // Assert
    const statusCalls = requestCalls.filter(
      call =>
        call[1] === OCPP16RequestCommand.STATUS_NOTIFICATION &&
        (call[2] as Record<string, unknown>).connectorId === 1
    )
    assert.ok(
      statusCalls.length >= 2,
      `Expected at least 2 status calls, got ${String(statusCalls.length)}`
    )
    assert.strictEqual(
      (statusCalls[0][2] as Record<string, unknown>).status,
      OCPP16ChargePointStatus.Finishing
    )
    assert.strictEqual(
      (statusCalls[1][2] as Record<string, unknown>).status,
      OCPP16ChargePointStatus.Available
    )
  })

  await it('should send Available immediately when postTransactionDelay is 0', async () => {
    // Arrange
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

    // Assert
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
    const availableCalls = statusCalls.filter(
      call => (call[2] as Record<string, unknown>).status === OCPP16ChargePointStatus.Available
    )
    assert.ok(availableCalls.length >= 1, 'Should send Available status')
  })

  await it('should send Unavailable after delay when station becomes unavailable during finishing', async t => {
    // Arrange
    setupConnectorWithTransaction(station, 1, { transactionId: 300 })
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
      for (let i = 0; i < 10; i++) {
        await flushMicrotasks()
      }
      t.mock.timers.tick(5000)
      for (let i = 0; i < 10; i++) {
        await flushMicrotasks()
      }
      await promise
    })

    // Assert
    const statusCalls = requestCalls.filter(
      call =>
        call[1] === OCPP16RequestCommand.STATUS_NOTIFICATION &&
        (call[2] as Record<string, unknown>).connectorId === 1
    )
    assert.ok(
      statusCalls.length >= 2,
      `Expected at least 2 status calls, got ${String(statusCalls.length)}`
    )
    assert.strictEqual(
      (statusCalls[0][2] as Record<string, unknown>).status,
      OCPP16ChargePointStatus.Finishing
    )
    assert.strictEqual(
      (statusCalls[1][2] as Record<string, unknown>).status,
      OCPP16ChargePointStatus.Unavailable
    )
  })

  await it('should skip cleanup when station stops during delay', async t => {
    // Arrange
    setupConnectorWithTransaction(station, 1, { transactionId: 400 })
    const requestPayload: OCPP16StopTransactionRequest = {
      meterStop: 4000,
      timestamp: new Date(),
      transactionId: 400,
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
      for (let i = 0; i < 10; i++) {
        await flushMicrotasks()
      }
      station.started = false
      t.mock.timers.tick(5000)
      for (let i = 0; i < 10; i++) {
        await flushMicrotasks()
      }
      await promise
    })

    // Assert
    const statusCalls = requestCalls.filter(
      call =>
        call[1] === OCPP16RequestCommand.STATUS_NOTIFICATION &&
        (call[2] as Record<string, unknown>).connectorId === 1
    )
    assert.strictEqual(statusCalls.length, 1, 'Only Finishing status should be sent')
    assert.strictEqual(
      (statusCalls[0][2] as Record<string, unknown>).status,
      OCPP16ChargePointStatus.Finishing
    )
    const connectorStatus = station.getConnectorStatus(1)
    if (connectorStatus == null) {
      assert.fail('Expected connector 1 to exist')
    }
    assert.strictEqual(connectorStatus.transactionStarted, true)
    assert.strictEqual(connectorStatus.transactionId, 400)
  })
})
