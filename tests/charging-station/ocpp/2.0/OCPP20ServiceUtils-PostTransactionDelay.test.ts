/**
 * @file Tests for OCPP20ServiceUtils postTransactionDelay
 * @description Verifies the postTransactionDelay feature in OCPP 2.0.x cleanupEndedTransaction:
 * delayed Available transitions, zero-delay immediate transitions,
 * and shutdown-during-delay safety.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type { ConnectorStatus } from '../../../../src/types/index.js'

import { OCPP20ServiceUtils } from '../../../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import { OCPPVersion } from '../../../../src/types/index.js'
import {
  flushMicrotasks,
  standardCleanup,
  withMockTimers,
} from '../../../helpers/TestLifecycleHelpers.js'
import { createMockChargingStation } from '../../helpers/StationHelpers.js'

await describe('OCPP20ServiceUtils — PostTransactionDelay', async () => {
  let station: ChargingStation
  let connectorStatus: ConnectorStatus
  let requestHandlerMock: ReturnType<typeof mock.fn>

  beforeEach(() => {
    const requestHandler = mock.fn(async () => Promise.resolve({}))
    requestHandlerMock = requestHandler
    const result = createMockChargingStation({
      connectorsCount: 1,
      ocppRequestService: {
        requestHandler: requestHandler as (...args: unknown[]) => Promise<unknown>,
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
    if (cs == null) {
      throw new Error('Expected connector 1 to exist')
    }
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

    // Act
    await OCPP20ServiceUtils.cleanupEndedTransaction(station, 1, connectorStatus)

    // Assert
    assert.strictEqual(connectorStatus.transactionStarted, false)
    assert.strictEqual(connectorStatus.transactionId, undefined)
    assert.strictEqual(connectorStatus.locked, false)
    assert.ok(requestHandlerMock.mock.calls.length >= 1, 'Should send StatusNotification')
  })

  await it('should skip cleanup when station stops during delay', async t => {
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

    // Assert — transaction state reset before sleep, but locked and status notification deferred
    assert.strictEqual(connectorStatus.transactionStarted, false)
    assert.strictEqual(connectorStatus.transactionId, undefined)
    assert.strictEqual(connectorStatus.locked, true)
    assert.strictEqual(
      requestHandlerMock.mock.calls.length,
      0,
      'No StatusNotification should be sent'
    )
  })
})
