/**
 * @file Tests for OCPP20ResponseService — `forceTransactionOnInvalidIdToken`
 *   template flag (issue #1826).
 * @description Asserts that, when the station-template flag
 *   `forceTransactionOnInvalidIdToken` is `true`, an OCPP 2.0.1
 *   `TransactionEvent(Started)` response carrying a non-Accepted
 *   `idTokenInfo.status` does NOT abort: `requestDeauthorizeTransaction` is
 *   not called, the connector is locked, the MeterValues update/ended pumps
 *   are started, and a warn-level log line containing the literal
 *   `forceTransactionOnInvalidIdToken=true` is emitted. Mid-transaction
 *   revocation (`Updated` / `Ended` event types with non-Accepted status)
 *   STILL aborts via `requestDeauthorizeTransaction` regardless of the flag,
 *   preserving OCPP 2.0.1 E05.FR.09 / E05.FR.10 / E06.FR.04 mid-tx semantics.
 *
 *   Default-off regression bound is covered by the sibling tests in
 *   `OCPP20ResponseService-TransactionEvent.test.ts` and not duplicated here.
 *
 *   Test runner: node:test (`pnpm test`). No Jest, no Vitest.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type { OCPP20TransactionEventResponse } from '../../../../src/types/index.js'

import {
  createTestableResponseService,
  type TestableOCPP20ResponseService,
} from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20ResponseService } from '../../../../src/charging-station/ocpp/2.0/OCPP20ResponseService.js'
import { OCPP20ServiceUtils } from '../../../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import {
  OCPP20AuthorizationStatusEnumType,
  OCPP20IdTokenEnumType,
  OCPP20TransactionEventEnumType,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants, logger } from '../../../../src/utils/index.js'
import {
  setupConnectorWithTransaction,
  standardCleanup,
} from '../../../helpers/TestLifecycleHelpers.js'
import {
  TEST_CHARGING_STATION_BASE_NAME,
  TEST_ID_TAG,
  TEST_TRANSACTION_UUID,
} from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../helpers/StationHelpers.js'
import { buildTransactionEventRequest } from './OCPP20ResponseServiceTestUtils.js'

await describe('OCPP20ResponseService — forceTransactionOnInvalidIdToken (issue #1826)', async () => {
  let station: ChargingStation
  let testable: TestableOCPP20ResponseService

  beforeEach(() => {
    const { station: mockStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 1,
      evseConfiguration: { evsesCount: 1 },
      stationInfo: {
        forceTransactionOnInvalidIdToken: true,
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
    })
    station = mockStation
    setupConnectorWithTransaction(station, 1, { transactionId: 100 })
    const connectorStatus = station.getConnectorStatus(1)
    if (connectorStatus != null) {
      connectorStatus.transactionId = TEST_TRANSACTION_UUID
    }
    const responseService = new OCPP20ResponseService()
    testable = createTestableResponseService(responseService)
  })

  afterEach(() => {
    standardCleanup()
  })

  // 2.0-T2 — Force-tx on Invalid `Started`: deauth NOT called, connector
  // locked, MV update + ended pumps started.
  // TODO Phase 6 (golden set): add a fake-timer fence to verify the MV pump
  // actually emits a TransactionEvent(Updated) over the wire — the helper-
  // call assertion below stubs the pump and therefore does not catch a
  // wire-level regression where startUpdatedMeterValues is invoked but the
  // interval is bound to the wrong connector. Phase 6 closes this gap.
  await it('should not deauthorize on Invalid Started when the flag is true', async () => {
    // Arrange
    const mockDeauthTransaction = mock.method(
      OCPP20ServiceUtils,
      'requestDeauthorizeTransaction',
      async () => Promise.resolve({} as OCPP20TransactionEventResponse)
    )
    const mockStartUpdated = mock.method(OCPP20ServiceUtils, 'startUpdatedMeterValues', () => {
      /* noop */
    })
    const mockStartEnded = mock.method(OCPP20ServiceUtils, 'startEndedMeterValues', () => {
      /* noop */
    })
    const payload: OCPP20TransactionEventResponse = {
      idTokenInfo: {
        status: OCPP20AuthorizationStatusEnumType.Invalid,
      },
    }
    const requestPayload = buildTransactionEventRequest(
      TEST_TRANSACTION_UUID,
      OCPP20TransactionEventEnumType.Started
    )

    // Act
    await testable.handleResponseTransactionEvent(station, payload, requestPayload)

    // Assert — deauth NOT called; locked + MV pumps started.
    assert.strictEqual(mockDeauthTransaction.mock.calls.length, 0)
    const connectorStatus = station.getConnectorStatus(1)
    if (connectorStatus == null) {
      assert.fail('Expected connector to be defined')
    }
    assert.strictEqual(connectorStatus.locked, true)
    assert.strictEqual(mockStartUpdated.mock.calls.length, 1)
    assert.strictEqual(mockStartEnded.mock.calls.length, 1)
  })

  // 2.0-T3 — Mid-transaction revocation (Updated) STILL aborts.
  await it('should still de-authorize on Invalid Updated when the flag is true', async () => {
    // Arrange
    const mockDeauthTransaction = mock.method(
      OCPP20ServiceUtils,
      'requestDeauthorizeTransaction',
      async () => Promise.resolve({} as OCPP20TransactionEventResponse)
    )
    const payload: OCPP20TransactionEventResponse = {
      idTokenInfo: {
        status: OCPP20AuthorizationStatusEnumType.Invalid,
      },
    }
    const requestPayload = buildTransactionEventRequest(
      TEST_TRANSACTION_UUID,
      OCPP20TransactionEventEnumType.Updated
    )

    // Act
    await testable.handleResponseTransactionEvent(station, payload, requestPayload)

    // Assert
    assert.strictEqual(mockDeauthTransaction.mock.calls.length, 1)
  })

  // 2.0-T4 — Mid-transaction revocation (Ended) STILL tears down (regardless of flag).
  await it('should clean up on Invalid Ended even when the flag is true (mid-tx tear-down preserved)', async () => {
    // Arrange — In OCPP 2.0.1, the Ended branch runs cleanupEndedTransaction BEFORE the
    // deauth gate. With the flag on, we cannot bypass mid-transaction tear-down: the
    // case Ended in the switch always cleans up. Asserting on connector cleanup is the
    // accurate way to pin the "mid-tx revocation always aborts" invariant for Ended.
    const { station: endedStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 1,
      evseConfiguration: { evsesCount: 1 },
      ocppRequestService: {
        requestHandler: async () => Promise.resolve({}),
      },
      stationInfo: {
        forceTransactionOnInvalidIdToken: true,
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
    })
    setupConnectorWithTransaction(endedStation, 1, { transactionId: 100 })
    const endedConnector = endedStation.getConnectorStatus(1)
    if (endedConnector != null) {
      endedConnector.transactionId = TEST_TRANSACTION_UUID
    }
    const endedTestable = createTestableResponseService(new OCPP20ResponseService())
    const mockDeauthEnded = mock.method(
      OCPP20ServiceUtils,
      'requestDeauthorizeTransaction',
      async () => Promise.resolve({} as OCPP20TransactionEventResponse)
    )
    const payload: OCPP20TransactionEventResponse = {
      idTokenInfo: {
        status: OCPP20AuthorizationStatusEnumType.Invalid,
      },
    }
    const requestPayload = buildTransactionEventRequest(
      TEST_TRANSACTION_UUID,
      OCPP20TransactionEventEnumType.Ended
    )

    // Act
    await endedTestable.handleResponseTransactionEvent(endedStation, payload, requestPayload)

    // Asserts cleanup ran AND deauth was a no-op (cleanupEndedTransaction
    // clears transactionId before the gate, so the connector lookup fails).
    // `=== 0` locks the cleanup-then-gate ordering: any regression that
    // reorders or preserves transactionId on Ended flips this to 1.
    if (endedConnector == null) {
      assert.fail('endedConnector should be defined after setupConnectorWithTransaction')
    }
    assert.strictEqual(endedConnector.transactionStarted, false)
    assert.strictEqual(endedConnector.locked, false)
    assert.strictEqual(mockDeauthEnded.mock.calls.length, 0)
  })

  // 2.0-T5 — Override marker present in warn-level log on Started override path.
  await it('should emit a warn log line containing the override marker', async () => {
    // Arrange
    mock.method(OCPP20ServiceUtils, 'requestDeauthorizeTransaction', async () =>
      Promise.resolve({} as OCPP20TransactionEventResponse)
    )
    mock.method(OCPP20ServiceUtils, 'startUpdatedMeterValues', () => {
      /* noop */
    })
    mock.method(OCPP20ServiceUtils, 'startEndedMeterValues', () => {
      /* noop */
    })
    const warnMock = mock.method(logger, 'warn', () => undefined)
    const payload: OCPP20TransactionEventResponse = {
      idTokenInfo: {
        status: OCPP20AuthorizationStatusEnumType.Invalid,
      },
    }
    const requestPayload = buildTransactionEventRequest(
      TEST_TRANSACTION_UUID,
      OCPP20TransactionEventEnumType.Started
    )

    // Act
    await testable.handleResponseTransactionEvent(station, payload, requestPayload)

    // Assert
    const overrideMarkerCalls = warnMock.mock.calls.filter(call => {
      const firstArg: unknown = call.arguments[0]
      return (
        typeof firstArg === 'string' && firstArg.includes('forceTransactionOnInvalidIdToken=true')
      )
    })
    assert.strictEqual(overrideMarkerCalls.length, 1)
  })

  // 2.0-T6 — `idTokenInfo == null` is treated as Accepted under both flag values.
  // Split into two `it()` blocks (flag-on / flag-off) so each runs against a
  // freshly-mocked station; avoids the mid-test cleanup+re-mock pattern.
  // Both branches additionally assert that the override-marker warn-log is
  // NOT emitted on null payload (locks the invariant against the A6 regression
  // where someone "fixes" the override-marker `else if` to also fire on null).
  await it('should treat null idTokenInfo as Accepted when the flag is true', async () => {
    const mockDeauthOn = mock.method(
      OCPP20ServiceUtils,
      'requestDeauthorizeTransaction',
      async () => Promise.resolve({} as OCPP20TransactionEventResponse)
    )
    mock.method(OCPP20ServiceUtils, 'startUpdatedMeterValues', () => undefined)
    mock.method(OCPP20ServiceUtils, 'startEndedMeterValues', () => undefined)
    const warnMockOn = mock.method(logger, 'warn', () => undefined)

    const payload: OCPP20TransactionEventResponse = {}
    const requestPayload = buildTransactionEventRequest(
      TEST_TRANSACTION_UUID,
      OCPP20TransactionEventEnumType.Started
    )

    await testable.handleResponseTransactionEvent(station, payload, requestPayload)

    assert.strictEqual(mockDeauthOn.mock.calls.length, 0)
    const overrideMarkerCallsOn = warnMockOn.mock.calls.filter(call => {
      const firstArg: unknown = call.arguments[0]
      return (
        typeof firstArg === 'string' && firstArg.includes('forceTransactionOnInvalidIdToken=true')
      )
    })
    assert.strictEqual(overrideMarkerCallsOn.length, 0)
  })

  await it('should treat null idTokenInfo as Accepted when the flag is false', async () => {
    const { station: flagOffStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 1,
      evseConfiguration: { evsesCount: 1 },
      stationInfo: {
        forceTransactionOnInvalidIdToken: false,
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
    })
    setupConnectorWithTransaction(flagOffStation, 1, { transactionId: 100 })
    const flagOffConnector = flagOffStation.getConnectorStatus(1)
    if (flagOffConnector != null) {
      flagOffConnector.transactionId = TEST_TRANSACTION_UUID
    }
    const mockDeauthOff = mock.method(
      OCPP20ServiceUtils,
      'requestDeauthorizeTransaction',
      async () => Promise.resolve({} as OCPP20TransactionEventResponse)
    )
    mock.method(OCPP20ServiceUtils, 'startUpdatedMeterValues', () => undefined)
    mock.method(OCPP20ServiceUtils, 'startEndedMeterValues', () => undefined)
    const warnMockOff = mock.method(logger, 'warn', () => undefined)
    const flagOffTestable = createTestableResponseService(new OCPP20ResponseService())

    const payload: OCPP20TransactionEventResponse = {}
    const requestPayload = buildTransactionEventRequest(
      TEST_TRANSACTION_UUID,
      OCPP20TransactionEventEnumType.Started
    )

    await flagOffTestable.handleResponseTransactionEvent(flagOffStation, payload, requestPayload)

    assert.strictEqual(mockDeauthOff.mock.calls.length, 0)
    const overrideMarkerCallsOff = warnMockOff.mock.calls.filter(call => {
      const firstArg: unknown = call.arguments[0]
      return (
        typeof firstArg === 'string' && firstArg.includes('forceTransactionOnInvalidIdToken=true')
      )
    })
    assert.strictEqual(overrideMarkerCallsOff.length, 0)
  })

  // 2.0-T7 — Status-enum parity: every non-Accepted status follows the override
  // path on Started when the flag is true (deauth NOT called, MV pumps run).
  // ConcurrentTx is omitted: per OCPP 2.0.1 it is not a rejection of the IdToken
  // itself but a signal that another transaction is already running, handled in
  // a different code path that is outside this issue's scope.
  // `Object.values(enum)` derivation makes future enum additions auto-covered.
  for (const status of Object.values(OCPP20AuthorizationStatusEnumType).filter(
    s =>
      s !== OCPP20AuthorizationStatusEnumType.Accepted &&
      s !== OCPP20AuthorizationStatusEnumType.ConcurrentTx
  )) {
    await it(`should override Started for status=${status} when the flag is true`, async () => {
      // Arrange
      const mockDeauthTransaction = mock.method(
        OCPP20ServiceUtils,
        'requestDeauthorizeTransaction',
        async () => Promise.resolve({} as OCPP20TransactionEventResponse)
      )
      const mockStartUpdated = mock.method(OCPP20ServiceUtils, 'startUpdatedMeterValues', () => {
        /* noop */
      })
      const mockStartEnded = mock.method(OCPP20ServiceUtils, 'startEndedMeterValues', () => {
        /* noop */
      })
      const payload: OCPP20TransactionEventResponse = {
        idTokenInfo: {
          status,
        },
      }
      const requestPayload = buildTransactionEventRequest(
        TEST_TRANSACTION_UUID,
        OCPP20TransactionEventEnumType.Started
      )

      // Act
      await testable.handleResponseTransactionEvent(station, payload, requestPayload)

      // Assert
      assert.strictEqual(mockDeauthTransaction.mock.calls.length, 0)
      assert.strictEqual(mockStartUpdated.mock.calls.length, 1)
      assert.strictEqual(mockStartEnded.mock.calls.length, 1)
    })
  }

  // 2.0-T8 — Auth-cache update invariant (C10.FR.01/04/05): the cache is
  // written with the CSMS-supplied idTokenInfo regardless of whether the
  // override path was taken. Mocks `OCPP20ServiceUtils.updateAuthorizationCache`
  // and asserts call-count = 1 with the right idToken + idTokenInfo for both
  // flag states.
  for (const flagState of [true, false] as const) {
    await it(`should update the authorization cache regardless of the flag (flag=${String(flagState)})`, async () => {
      const { station: cacheStation } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
        stationInfo: {
          forceTransactionOnInvalidIdToken: flagState,
          ocppStrictCompliance: false,
          ocppVersion: OCPPVersion.VERSION_201,
        },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })
      setupConnectorWithTransaction(cacheStation, 1, { transactionId: 100 })
      const cacheConnector = cacheStation.getConnectorStatus(1)
      if (cacheConnector != null) {
        cacheConnector.transactionId = TEST_TRANSACTION_UUID
      }
      const cacheTestable = createTestableResponseService(new OCPP20ResponseService())
      mock.method(OCPP20ServiceUtils, 'requestDeauthorizeTransaction', async () =>
        Promise.resolve({} as OCPP20TransactionEventResponse)
      )
      mock.method(OCPP20ServiceUtils, 'startUpdatedMeterValues', () => undefined)
      mock.method(OCPP20ServiceUtils, 'startEndedMeterValues', () => undefined)
      const updateAuthMock = mock.method(
        OCPP20ServiceUtils,
        'updateAuthorizationCache',
        () => undefined
      )
      const idToken = { idToken: TEST_ID_TAG, type: OCPP20IdTokenEnumType.ISO14443 }
      const payload: OCPP20TransactionEventResponse = {
        idTokenInfo: { status: OCPP20AuthorizationStatusEnumType.Invalid },
      }
      const requestPayload = buildTransactionEventRequest(
        TEST_TRANSACTION_UUID,
        OCPP20TransactionEventEnumType.Started,
        idToken
      )

      await cacheTestable.handleResponseTransactionEvent(cacheStation, payload, requestPayload)

      assert.strictEqual(updateAuthMock.mock.calls.length, 1)
      assert.deepStrictEqual(updateAuthMock.mock.calls[0].arguments[1], idToken)
      assert.deepStrictEqual(updateAuthMock.mock.calls[0].arguments[2], {
        status: OCPP20AuthorizationStatusEnumType.Invalid,
      })
    })
  }
})
