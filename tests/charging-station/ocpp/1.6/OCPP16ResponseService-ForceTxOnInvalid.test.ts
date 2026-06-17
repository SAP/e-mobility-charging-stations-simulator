/**
 * @file Tests for OCPP16ResponseService — `forceTransactionOnInvalidIdToken`
 *   template flag (issue #1826).
 * @description Asserts that, when the station-template flag
 *   `forceTransactionOnInvalidIdToken` is `true`, a StartTransaction response
 *   carrying `idTagInfo.status === Invalid` does NOT abort: the connector
 *   adopts the transaction (transactionStarted, transactionId, transactionIdTag,
 *   locked) as if Accepted, the MeterValues sample timer is initialized, and a
 *   warn-log entry containing the literal `forceTransactionOnInvalidIdToken=true`
 *   is emitted. The authorization cache update is NOT relaxed (it always
 *   reflects what CSMS replied). Pre-Start local-state guards (e.g.
 *   remote-start with un-authorized idTag) are NOT relaxed by the flag.
 *
 *   Default-off regression bound is covered by the sibling test in
 *   `OCPP16ResponseService-Transactions.test.ts:212` and is intentionally not
 *   duplicated here.
 *
 *   Test runner: node:test (`pnpm test`). No Jest, no Vitest.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type { OCPP16ResponseService } from '../../../../src/charging-station/ocpp/1.6/OCPP16ResponseService.js'
import type {
  OCPP16StartTransactionRequest,
  OCPP16StartTransactionResponse,
} from '../../../../src/types/index.js'

import { OCPP16ServiceUtils } from '../../../../src/charging-station/ocpp/1.6/OCPP16ServiceUtils.js'
import {
  OCPP16AuthorizationStatus,
  OCPP16MeterValueUnit,
  OCPP16RequestCommand,
} from '../../../../src/types/index.js'
import { logger } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_ID_TAG } from '../../ChargingStationTestConstants.js'
import { createOCPP16ResponseTestContext, setMockRequestHandler } from './OCPP16TestUtils.js'

await describe('OCPP16ResponseService — forceTransactionOnInvalidIdToken (issue #1826)', async () => {
  let station: ChargingStation
  let responseService: OCPP16ResponseService

  beforeEach(() => {
    const ctx = createOCPP16ResponseTestContext({
      stationInfo: { forceTransactionOnInvalidIdToken: true },
    })
    station = ctx.station
    responseService = ctx.responseService
    setMockRequestHandler(station, async () => Promise.resolve({}))
    mock.method(OCPP16ServiceUtils, 'startUpdatedMeterValues', () => {
      /* noop */
    })
    mock.method(OCPP16ServiceUtils, 'stopUpdatedMeterValues', () => {
      /* noop */
    })
    for (const { connectorId } of station.iterateConnectors(true)) {
      const connectorStatus = station.getConnectorStatus(connectorId)
      if (connectorStatus != null) {
        connectorStatus.MeterValues = [{ unit: OCPP16MeterValueUnit.WATT_HOUR, value: '0' }]
      }
    }
  })

  afterEach(() => {
    standardCleanup()
  })

  // 1.6-T2 — Force-tx on Invalid: transaction continues as if Accepted.
  // TODO Phase 6 (golden set): add a fake-timer fence to verify the MV pump
  // actually emits a MeterValues request over the wire — the helper-call
  // assertion below stubs the pump and therefore does not catch a wire-level
  // regression where startUpdatedMeterValues is invoked but the interval is
  // bound to the wrong connector. Phase 6 closes this gap.
  await it('should continue the transaction when CSMS replies Invalid and the flag is true', async () => {
    // Arrange
    const connectorId = 1
    const transactionId = 4242
    const startUpdatedMeterValuesMock = mock.method(
      OCPP16ServiceUtils,
      'startUpdatedMeterValues',
      () => {
        /* noop */
      }
    )
    const requestPayload: OCPP16StartTransactionRequest = {
      connectorId,
      idTag: TEST_ID_TAG,
      meterStart: 0,
      timestamp: new Date('2025-01-01T12:00:00Z'),
    }
    const responsePayload: OCPP16StartTransactionResponse = {
      idTagInfo: { status: OCPP16AuthorizationStatus.INVALID },
      transactionId,
    }

    // Act — public dispatcher routes to private handleResponseStartTransaction.
    await responseService.responseHandler(
      station,
      OCPP16RequestCommand.START_TRANSACTION,
      responsePayload,
      requestPayload
    )

    // Assert — connector adopted the transaction.
    const connectorStatus = station.getConnectorStatus(connectorId)
    if (connectorStatus == null) {
      assert.fail('Expected connector to be defined')
    }
    assert.strictEqual(connectorStatus.transactionStarted, true)
    assert.strictEqual(connectorStatus.transactionId, transactionId)
    assert.strictEqual(connectorStatus.transactionIdTag, TEST_ID_TAG)
    assert.strictEqual(connectorStatus.transactionEnergyActiveImportRegisterValue, 0)
    assert.strictEqual(connectorStatus.locked, true)
    assert.deepStrictEqual(connectorStatus.transactionStart, requestPayload.timestamp)
    // MV pump initialized so the simulator actually meters the override session.
    assert.strictEqual(startUpdatedMeterValuesMock.mock.calls.length, 1)
  })

  // 1.6-T3 — Override marker present in warn-level log.
  await it('should emit a warn log line containing the override marker', async () => {
    // Arrange
    const warnMock = mock.method(logger, 'warn', () => undefined)
    const connectorId = 1
    const requestPayload: OCPP16StartTransactionRequest = {
      connectorId,
      idTag: TEST_ID_TAG,
      meterStart: 0,
      timestamp: new Date(),
    }
    const responsePayload: OCPP16StartTransactionResponse = {
      idTagInfo: { status: OCPP16AuthorizationStatus.INVALID },
      transactionId: 7,
    }

    // Act
    await responseService.responseHandler(
      station,
      OCPP16RequestCommand.START_TRANSACTION,
      responsePayload,
      requestPayload
    )

    // Assert — at least one warn call carries the literal override marker.
    const overrideMarkerCalls = warnMock.mock.calls.filter(call => {
      const firstArg: unknown = call.arguments[0]
      return (
        typeof firstArg === 'string' && firstArg.includes('forceTransactionOnInvalidIdToken=true')
      )
    })
    assert.strictEqual(overrideMarkerCalls.length, 1)
  })

  // 1.6-T4 — Authorization cache update is NOT relaxed by the flag.
  await it('should still update the authorization cache with the CSMS-supplied idTagInfo', async () => {
    // Arrange
    const updateAuthMock = mock.method(
      OCPP16ServiceUtils,
      'updateAuthorizationCache',
      () => undefined
    )
    const connectorId = 1
    const requestPayload: OCPP16StartTransactionRequest = {
      connectorId,
      idTag: TEST_ID_TAG,
      meterStart: 0,
      timestamp: new Date(),
    }
    const responsePayload: OCPP16StartTransactionResponse = {
      idTagInfo: { status: OCPP16AuthorizationStatus.INVALID },
      transactionId: 11,
    }

    // Act
    await responseService.responseHandler(
      station,
      OCPP16RequestCommand.START_TRANSACTION,
      responsePayload,
      requestPayload
    )

    // Assert — exactly one cache update with the Invalid idTagInfo.
    assert.strictEqual(updateAuthMock.mock.calls.length, 1)
    assert.strictEqual(updateAuthMock.mock.calls[0].arguments[1], TEST_ID_TAG)
    assert.deepStrictEqual(updateAuthMock.mock.calls[0].arguments[2], {
      status: OCPP16AuthorizationStatus.INVALID,
    })
  })

  // 1.6-T5 — Pre-Start local-state guards are NOT relaxed.
  // The remote-start guard at :315-329 must still abort even when the flag is true.
  await it('should still abort on the pre-Start unauthorized-remote-start guard regardless of the flag', async () => {
    // Arrange — drive the guard at OCPP16ResponseService.ts:315-329:
    // transactionRemoteStarted=true, AuthorizeRemoteTxRequests=true,
    // remoteAuthorization=true, idTagAuthorized=false, idTagLocalAuthorized=false.
    const connectorId = 1
    const connectorStatus = station.getConnectorStatus(connectorId)
    if (connectorStatus == null) {
      assert.fail('Expected connector to be defined')
    }
    connectorStatus.transactionRemoteStarted = true
    connectorStatus.idTagAuthorized = false
    connectorStatus.idTagLocalAuthorized = false
    connectorStatus.authorizeIdTag = TEST_ID_TAG
    ;(
      station as unknown as { getAuthorizeRemoteTxRequests: () => boolean }
    ).getAuthorizeRemoteTxRequests = () => true
    const stationInfo = station.stationInfo
    if (stationInfo != null) {
      stationInfo.remoteAuthorization = true
    }

    const requestPayload: OCPP16StartTransactionRequest = {
      connectorId,
      idTag: TEST_ID_TAG,
      meterStart: 0,
      timestamp: new Date(),
    }
    const responsePayload: OCPP16StartTransactionResponse = {
      // INVALID + flag=true exercises the regression: without the pre-Start
      // guard the override would skip the abort path. The guard MUST still
      // win. ACCEPTED would not exercise the flag-vs-guard interaction.
      idTagInfo: { status: OCPP16AuthorizationStatus.INVALID },
      transactionId: 22,
    }

    // Act
    await responseService.responseHandler(
      station,
      OCPP16RequestCommand.START_TRANSACTION,
      responsePayload,
      requestPayload
    )

    // Assert — guard fires: connector reset, no transaction adopted.
    assert.strictEqual(connectorStatus.transactionStarted, false)
    assert.strictEqual(connectorStatus.transactionId, undefined)
    assert.strictEqual(connectorStatus.transactionIdTag, undefined)
  })

  // 1.6-T6 — Status-enum parity: every non-Accepted, non-ConcurrentTx status
  // follows the override path on StartTransaction when the flag is true.
  // ConcurrentTx is excluded because OCPP 1.6 routes it through a different
  // code path (concurrent transaction detection), outside this issue's scope.
  for (const status of Object.values(OCPP16AuthorizationStatus).filter(
    s => s !== OCPP16AuthorizationStatus.ACCEPTED && s !== OCPP16AuthorizationStatus.CONCURRENT_TX
  )) {
    await it(`should continue the transaction for status=${status} when the flag is true`, async () => {
      const startUpdatedMeterValuesMock = mock.method(
        OCPP16ServiceUtils,
        'startUpdatedMeterValues',
        () => undefined
      )
      const connectorId = 1
      const requestPayload: OCPP16StartTransactionRequest = {
        connectorId,
        idTag: TEST_ID_TAG,
        meterStart: 0,
        timestamp: new Date(),
      }
      const responsePayload: OCPP16StartTransactionResponse = {
        idTagInfo: { status },
        transactionId: 4242,
      }

      await responseService.responseHandler(
        station,
        OCPP16RequestCommand.START_TRANSACTION,
        responsePayload,
        requestPayload
      )

      const connectorStatus = station.getConnectorStatus(connectorId)
      if (connectorStatus == null) {
        assert.fail('Expected connector to be defined')
      }
      assert.strictEqual(connectorStatus.transactionStarted, true)
      assert.strictEqual(startUpdatedMeterValuesMock.mock.calls.length, 1)
    })
  }
})
