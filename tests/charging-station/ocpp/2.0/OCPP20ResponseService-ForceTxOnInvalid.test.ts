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
import type {
  OCPP20TransactionEventRequest,
  OCPP20TransactionEventResponse,
  UUIDv4,
} from '../../../../src/types/index.js'

import { OCPP20ResponseService } from '../../../../src/charging-station/ocpp/2.0/OCPP20ResponseService.js'
import { OCPP20ServiceUtils } from '../../../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import {
  OCPP20AuthorizationStatusEnumType,
  OCPP20TransactionEventEnumType,
  OCPP20TriggerReasonEnumType,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants, logger } from '../../../../src/utils/index.js'
import {
  setupConnectorWithTransaction,
  standardCleanup,
} from '../../../helpers/TestLifecycleHelpers.js'
import {
  TEST_CHARGING_STATION_BASE_NAME,
  TEST_TRANSACTION_UUID,
} from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../helpers/StationHelpers.js'

interface TestableOCPP20ResponseService {
  handleResponseTransactionEvent: (
    chargingStation: ChargingStation,
    payload: OCPP20TransactionEventResponse,
    requestPayload: OCPP20TransactionEventRequest
  ) => Promise<void>
}

/**
 * Builds a minimal OCPP20TransactionEventRequest with the given event type and
 * transaction id. Used as the request-payload twin in handler dispatch.
 * @param transactionId - The transaction UUID embedded in transactionInfo
 * @param eventType - The TransactionEvent type (Started/Updated/Ended)
 * @returns A minimal OCPP20TransactionEventRequest
 */
function buildTransactionEventRequest (
  transactionId: UUIDv4,
  eventType: OCPP20TransactionEventEnumType
): OCPP20TransactionEventRequest {
  return {
    eventType,
    meterValue: [],
    seqNo: 0,
    timestamp: new Date(),
    transactionInfo: {
      transactionId,
    },
    triggerReason: OCPP20TriggerReasonEnumType.Authorized,
  }
}

/**
 * Wraps an OCPP20ResponseService instance so its private
 * `handleResponseTransactionEvent` is reachable by tests via a typed cast.
 * Mirrors the helper in `OCPP20ResponseService-TransactionEvent.test.ts`.
 * @param service - The OCPP20ResponseService instance to wrap
 * @returns A typed interface exposing the private handler
 */
function createTestableResponseService (
  service: OCPP20ResponseService
): TestableOCPP20ResponseService {
  const serviceImpl = service as unknown as TestableOCPP20ResponseService
  return {
    handleResponseTransactionEvent: serviceImpl.handleResponseTransactionEvent.bind(service),
  }
}

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
  await it('does NOT deauthorize on Invalid Started when the flag is true', async () => {
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
  await it('still de-authorizes on Invalid Updated when the flag is true', async () => {
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
  await it('cleans up on Invalid Ended even when the flag is true (mid-tx tear-down preserved)', async () => {
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

    // Assert: connector is reset / unlocked (cleanupEndedTransaction ran), proving the
    // Ended path is not bypassed by the flag.
    if (endedConnector == null) {
      assert.fail('endedConnector should be defined after setupConnectorWithTransaction')
    }
    assert.strictEqual(endedConnector.transactionStarted, false)
    assert.strictEqual(endedConnector.locked, false)
  })

  // 2.0-T5 — Override marker present in warn-level log on Started override path.
  await it('emits a warn log line containing the override marker', async () => {
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
  await it('treats null idTokenInfo as Accepted regardless of the flag', async () => {
    // Arrange — flag-on station already; the flag-off station is built ad-hoc.
    const mockDeauthOn = mock.method(
      OCPP20ServiceUtils,
      'requestDeauthorizeTransaction',
      async () => Promise.resolve({} as OCPP20TransactionEventResponse)
    )
    mock.method(OCPP20ServiceUtils, 'startUpdatedMeterValues', () => {
      /* noop */
    })
    mock.method(OCPP20ServiceUtils, 'startEndedMeterValues', () => {
      /* noop */
    })

    const payload: OCPP20TransactionEventResponse = {}
    const requestPayload = buildTransactionEventRequest(
      TEST_TRANSACTION_UUID,
      OCPP20TransactionEventEnumType.Started
    )

    // Act — flag ON
    await testable.handleResponseTransactionEvent(station, payload, requestPayload)
    // Assert — no deauth.
    assert.strictEqual(mockDeauthOn.mock.calls.length, 0)

    // Arrange — flag OFF (separate station + service to reset deauth mock state).
    standardCleanup()
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
    mock.method(OCPP20ServiceUtils, 'startUpdatedMeterValues', () => {
      /* noop */
    })
    mock.method(OCPP20ServiceUtils, 'startEndedMeterValues', () => {
      /* noop */
    })
    const flagOffTestable = createTestableResponseService(new OCPP20ResponseService())

    // Act — flag OFF
    await flagOffTestable.handleResponseTransactionEvent(flagOffStation, payload, requestPayload)
    // Assert — still no deauth (idTokenInfo absence == Accepted convention).
    assert.strictEqual(mockDeauthOff.mock.calls.length, 0)
  })

  // 2.0-T7 — Status-enum parity: every non-Accepted status follows the override
  // path on Started when the flag is true (deauth NOT called, MV pumps run).
  // ConcurrentTx is omitted: per OCPP 2.0.1 it is not a rejection of the IdToken
  // itself but a signal that another transaction is already running, handled in
  // a different code path that is outside this issue's scope.
  for (const status of [
    OCPP20AuthorizationStatusEnumType.Blocked,
    OCPP20AuthorizationStatusEnumType.Expired,
    OCPP20AuthorizationStatusEnumType.Invalid,
    OCPP20AuthorizationStatusEnumType.NoCredit,
    OCPP20AuthorizationStatusEnumType.NotAllowedTypeEVSE,
    OCPP20AuthorizationStatusEnumType.NotAtThisLocation,
    OCPP20AuthorizationStatusEnumType.NotAtThisTime,
    OCPP20AuthorizationStatusEnumType.Unknown,
  ]) {
    await it(`overrides Started for status=${status} when the flag is true`, async () => {
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
})
