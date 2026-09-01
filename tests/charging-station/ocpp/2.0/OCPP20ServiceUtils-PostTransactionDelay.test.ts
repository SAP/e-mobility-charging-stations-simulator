/**
 * @file Tests for OCPP20ServiceUtils postTransactionDelay
 * @description Verifies the postTransactionDelay feature in OCPP 2.0.x cleanupEndedTransaction:
 * delayed Available transitions, zero-delay immediate transitions,
 * and shutdown-during-delay safety.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation, CoherentSession } from '../../../../src/charging-station/index.js'
import type { ConnectorStatus } from '../../../../src/types/index.js'

import { OCPP20ServiceUtils } from '../../../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import {
  ConnectorStatusEnum,
  CurrentType,
  OCPPVersion,
  Voltage,
} from '../../../../src/types/index.js'
import {
  flushMicrotasks,
  standardCleanup,
  withMockTimers,
} from '../../../helpers/TestLifecycleHelpers.js'
import { createMockChargingStation } from '../../helpers/StationHelpers.js'

await describe('OCPP20ServiceUtilsPostTransactionDelay', async () => {
  let station: ChargingStation
  let connectorStatus: ConnectorStatus
  let requestHandlerMock: ReturnType<typeof mock.fn>

  beforeEach(() => {
    const requestHandler = mock.fn(async () => Promise.resolve({}))
    requestHandlerMock = requestHandler
    const result = createMockChargingStation({
      connectorsCount: 1,
      ocppRequestService: {
        requestHandler,
      },
      ocppVersion: OCPPVersion.VERSION_20,
      started: true,
      stationInfo: {
        ocppVersion: OCPPVersion.VERSION_20,
        postTransactionDelay: 3,
      },
    })
    station = result.station
    const cs = station.getConnectorStatus(1)
    assert.ok(cs != null, 'Expected connector 1 to exist')
    connectorStatus = cs
    connectorStatus.transactionStarted = true
    connectorStatus.transactionId = 'tx-1'
    connectorStatus.locked = true
  })

  afterEach(() => {
    standardCleanup()
  })

  await it('should delay Available transition after transaction end', async t => {
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

    // Assert
    assert.strictEqual(connectorStatus.transactionStarted, false)
    assert.strictEqual(connectorStatus.transactionId, undefined)
    assert.strictEqual(connectorStatus.locked, false)
    assert.ok(requestHandlerMock.mock.calls.length >= 1, 'Should send StatusNotification')
  })

  await it('should send Available immediately when postTransactionDelay is 0', async () => {
    // Arrange
    assert.ok(station.stationInfo != null, 'stationInfo should be defined')
    station.stationInfo.postTransactionDelay = 0
    const saveQueueSpy = mock.method(station, 'saveTransactionEventQueues')

    // Act
    await OCPP20ServiceUtils.cleanupEndedTransaction(station, 1, connectorStatus)

    // Assert
    assert.strictEqual(connectorStatus.transactionStarted, false)
    assert.strictEqual(connectorStatus.transactionId, undefined)
    assert.strictEqual(connectorStatus.locked, false)
    assert.ok(requestHandlerMock.mock.calls.length >= 1, 'Should send StatusNotification')
    assert.strictEqual(saveQueueSpy.mock.callCount(), 1)
  })

  await it('should abort post-transaction delay with the station lifecycle', async t => {
    await withMockTimers(t, ['setTimeout'], async () => {
      const lifecycleAbortController = new AbortController()
      Object.defineProperty(station, 'lifecycleAbortSignal', {
        configurable: true,
        get: () => lifecycleAbortController.signal,
      })
      const cleanup = OCPP20ServiceUtils.cleanupEndedTransaction(station, 1, connectorStatus)
      await flushMicrotasks()

      lifecycleAbortController.abort()
      await cleanup

      assert.strictEqual(connectorStatus.transactionStarted, false)
      assert.strictEqual(connectorStatus.transactionId, undefined)
      assert.strictEqual(connectorStatus.locked, false)
      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
    })
  })

  await it('should not block cleanup on the post-transaction status response', async () => {
    assert.ok(station.stationInfo != null, 'stationInfo should be defined')
    station.stationInfo.postTransactionDelay = 0
    const statusResponse = Promise.withResolvers<Record<string, never>>()
    requestHandlerMock.mock.mockImplementation(() => statusResponse.promise)
    const cleanup = OCPP20ServiceUtils.cleanupEndedTransaction(station, 1, connectorStatus)

    const outcome = await Promise.race([
      cleanup.then(() => 'resolved' as const),
      new Promise<'pending'>(resolve => {
        setImmediate(() => {
          resolve('pending')
        })
      }),
    ])

    assert.strictEqual(outcome, 'resolved')
    assert.strictEqual(connectorStatus.transactionStarted, false)
    assert.strictEqual(connectorStatus.transactionId, undefined)
    assert.strictEqual(connectorStatus.locked, false)
    assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
    assert.strictEqual(connectorStatus.status, ConnectorStatusEnum.Available)
    connectorStatus.status = ConnectorStatusEnum.Occupied
    statusResponse.resolve({})
    await flushMicrotasks()
    assert.strictEqual(connectorStatus.status, ConnectorStatusEnum.Occupied)
  })

  await it('should finish local cleanup when station stops during delay', async t => {
    // Act
    await withMockTimers(t, ['setTimeout'], async () => {
      const promise = OCPP20ServiceUtils.cleanupEndedTransaction(station, 1, connectorStatus)
      for (let i = 0; i < 10; i++) {
        await flushMicrotasks()
      }
      station.started = false
      t.mock.timers.tick(3000)
      for (let i = 0; i < 10; i++) {
        await flushMicrotasks()
      }
      await promise
    })

    // Local state must be reusable after restart; only the wire notification is skipped.
    assert.strictEqual(connectorStatus.transactionStarted, false)
    assert.strictEqual(connectorStatus.transactionId, undefined)
    assert.strictEqual(connectorStatus.locked, false)
    assert.strictEqual(
      requestHandlerMock.mock.calls.length,
      0,
      'No StatusNotification should be sent'
    )
  })

  await it('should destroy the coherent session even when the station stops during delay', async t => {
    const stubSession: CoherentSession = {
      connectorId: 1,
      currentType: CurrentType.AC,
      numberOfPhases: 1,
      profile: {
        batteryCapacityWh: 1,
        chargingCurve: [{ powerFraction: 0, socPercent: 0 }],
        id: 'stub',
        initialSocPercentMax: 0,
        initialSocPercentMin: 0,
        maxPowerW: 1,
        weight: 1,
      },
      rampUpDurationMs: 0,
      sessionStartMs: 0,
      socPercent: 0,
      transactionId: 'tx-1',
      voltageOutNominal: Voltage.VOLTAGE_230,
    }
    station.__injectCoherentSession('tx-1', stubSession)
    assert.ok(
      station.getCoherentSession('tx-1') != null,
      'session should exist before cleanupEndedTransaction'
    )

    await withMockTimers(t, ['setTimeout'], async () => {
      const promise = OCPP20ServiceUtils.cleanupEndedTransaction(station, 1, connectorStatus)
      for (let i = 0; i < 10; i++) {
        await flushMicrotasks()
      }
      station.started = false
      t.mock.timers.tick(3000)
      for (let i = 0; i < 10; i++) {
        await flushMicrotasks()
      }
      await promise
    })

    assert.strictEqual(
      station.getCoherentSession('tx-1'),
      undefined,
      'coherent session leaked when station stopped during postTransactionDelay'
    )
  })
})
