/**
 * @file Tests for OCPP20ResponseService coherent MeterValues session wiring.
 * @description Verifies that TransactionEvent(Started) creates
 *   a coherent MeterValues session on OCPP 2.0.1, mirroring the OCPP 1.6 path
 *   in `OCPP16ResponseService.handleResponseStartTransaction`. Also verifies
 *   the guards: opt-in feature flag and idToken acceptance.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type {
  OCPP20TransactionEventRequest,
  OCPP20TransactionEventResponse,
  UUIDv4,
} from '../../../../src/types/index.js'

import {
  createTestableResponseService,
  type TestableOCPP20ResponseService,
} from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20ResponseService } from '../../../../src/charging-station/ocpp/2.0/OCPP20ResponseService.js'
import { OCPP20ServiceUtils } from '../../../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import {
  OCPP20AuthorizationStatusEnumType,
  OCPP20TransactionEventEnumType,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import {
  setupConnectorWithTransaction,
  standardCleanup,
} from '../../../helpers/TestLifecycleHelpers.js'
import {
  TEST_CHARGING_STATION_BASE_NAME,
  TEST_TRANSACTION_UUID,
} from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../helpers/StationHelpers.js'
import { buildTransactionEventRequest } from './OCPP20ResponseServiceTestUtils.js'

const buildStartedRequest = (transactionId: UUIDv4): OCPP20TransactionEventRequest => {
  const req = buildTransactionEventRequest(transactionId, OCPP20TransactionEventEnumType.Started)
  return req
}

await describe('OCPP20ResponseServiceCoherentSession', async () => {
  let station: ChargingStation
  let testable: TestableOCPP20ResponseService
  let createSpy: ReturnType<typeof mock.method<ChargingStation, 'createCoherentSession'>>

  beforeEach(() => {
    const { station: mockStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 1,
      evseConfiguration: { evsesCount: 1 },
      stationInfo: {
        coherentMeterValues: true,
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
      connectorStatus.transactionStarted = false
      connectorStatus.transactionPending = true
    }
    createSpy = mock.method(station, 'createCoherentSession', () => undefined)
    const responseService = new OCPP20ResponseService()
    testable = createTestableResponseService(responseService)
  })

  afterEach(() => {
    standardCleanup()
  })

  await it('should create a coherent session on Started with Accepted idToken', async () => {
    const request = buildStartedRequest(TEST_TRANSACTION_UUID)
    const response: OCPP20TransactionEventResponse = {
      idTokenInfo: { status: OCPP20AuthorizationStatusEnumType.Accepted },
    }

    await testable.handleResponseTransactionEvent(station, response, request)

    assert.strictEqual(createSpy.mock.calls.length, 1, 'createCoherentSession must fire once')
    assert.strictEqual(createSpy.mock.calls[0].arguments[0], TEST_TRANSACTION_UUID)
    assert.strictEqual(createSpy.mock.calls[0].arguments[1], 1)
    assert.strictEqual(createSpy.mock.calls[0].arguments[2], 1)
  })

  await it('should bind a Started fallback session to EVSE 2 when connector ids repeat', async () => {
    const { station: evseStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 2,
      evseConfiguration: { evsesCount: 2 },
      stationInfo: {
        coherentMeterValues: true,
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
    })
    const firstEvse = evseStation.getEvseStatus(1)
    const secondEvse = evseStation.getEvseStatus(2)
    assert.ok(firstEvse != null && secondEvse != null)
    const firstConnector = firstEvse.connectors.get(1)
    const secondConnector = secondEvse.connectors.get(2)
    assert.ok(firstConnector != null && secondConnector != null)
    secondEvse.connectors.delete(2)
    secondEvse.connectors.set(1, secondConnector)
    firstConnector.transactionId = '00000000-0000-4000-8000-000000000001'
    firstConnector.transactionPending = true
    secondConnector.transactionId = TEST_TRANSACTION_UUID
    secondConnector.transactionStarted = false
    secondConnector.transactionPending = true
    const evseCreateSpy = mock.method(evseStation, 'createCoherentSession', () => undefined)
    mock.method(OCPP20ServiceUtils, 'startUpdatedMeterValues', () => undefined)
    mock.method(OCPP20ServiceUtils, 'startEndedMeterValues', () => undefined)
    const request = buildStartedRequest(TEST_TRANSACTION_UUID)
    request.evse = { connectorId: 1, id: 2 }

    await testable.handleResponseTransactionEvent(
      evseStation,
      { idTokenInfo: { status: OCPP20AuthorizationStatusEnumType.Accepted } },
      request
    )

    assert.strictEqual(firstConnector.transactionPending, true)
    assert.strictEqual(secondConnector.transactionStarted, true)
    assert.strictEqual(evseCreateSpy.mock.callCount(), 1)
    assert.strictEqual(evseCreateSpy.mock.calls[0].arguments[0], TEST_TRANSACTION_UUID)
    assert.strictEqual(evseCreateSpy.mock.calls[0].arguments[1], 1)
    assert.strictEqual(evseCreateSpy.mock.calls[0].arguments[2], 2)
  })

  await it('should create a coherent session on Started with idTokenInfo omitted (implicit accept)', async () => {
    const request = buildStartedRequest(TEST_TRANSACTION_UUID)
    // No idTokenInfo → treated as Accepted by handleResponseTransactionEvent.
    const response: OCPP20TransactionEventResponse = {}

    await testable.handleResponseTransactionEvent(station, response, request)

    assert.strictEqual(createSpy.mock.calls.length, 1)
  })

  await it('defers restored session creation and timers until replay reconciliation', async () => {
    const connectorStatus = station.getConnectorStatus(1, 1)
    assert.ok(connectorStatus != null)
    connectorStatus.transactionRestored = true
    const startUpdatedSpy = mock.method(
      OCPP20ServiceUtils,
      'startUpdatedMeterValues',
      () => undefined
    )
    const startEndedSpy = mock.method(OCPP20ServiceUtils, 'startEndedMeterValues', () => undefined)

    await testable.handleResponseTransactionEvent(
      station,
      { idTokenInfo: { status: OCPP20AuthorizationStatusEnumType.Accepted } },
      buildStartedRequest(TEST_TRANSACTION_UUID)
    )

    assert.strictEqual(createSpy.mock.callCount(), 0)
    assert.strictEqual(startUpdatedSpy.mock.callCount(), 0)
    assert.strictEqual(startEndedSpy.mock.callCount(), 0)
    assert.strictEqual(connectorStatus.transactionRestored, true)
  })

  await it('should NOT create a coherent session on rejected idToken without force override', async () => {
    const request = buildStartedRequest(TEST_TRANSACTION_UUID)
    const response: OCPP20TransactionEventResponse = {
      idTokenInfo: { status: OCPP20AuthorizationStatusEnumType.Invalid },
    }

    await testable.handleResponseTransactionEvent(station, response, request)

    assert.strictEqual(
      createSpy.mock.calls.length,
      0,
      'session must not be created when idToken rejected and force override is off'
    )
  })

  await it('should create a coherent session on rejected idToken WHEN forceTransactionOnInvalidIdToken=true', async () => {
    assert.ok(station.stationInfo != null)
    station.stationInfo.forceTransactionOnInvalidIdToken = true
    const request = buildStartedRequest(TEST_TRANSACTION_UUID)
    const response: OCPP20TransactionEventResponse = {
      idTokenInfo: { status: OCPP20AuthorizationStatusEnumType.Invalid },
    }

    await testable.handleResponseTransactionEvent(station, response, request)

    assert.strictEqual(
      createSpy.mock.calls.length,
      1,
      'session must be created when force override is enabled, mirroring OCPP 1.6'
    )
  })

  await it('should NOT create a session for non-Started event types', async () => {
    const request = buildTransactionEventRequest(
      TEST_TRANSACTION_UUID,
      OCPP20TransactionEventEnumType.Updated
    )
    const response: OCPP20TransactionEventResponse = {
      idTokenInfo: { status: OCPP20AuthorizationStatusEnumType.Accepted },
    }

    await testable.handleResponseTransactionEvent(station, response, request)

    assert.strictEqual(
      createSpy.mock.calls.length,
      0,
      'session must only be created on eventType=Started'
    )
  })
})
