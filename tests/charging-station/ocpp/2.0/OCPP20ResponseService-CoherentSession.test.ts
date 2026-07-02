/**
 * @file Tests for OCPP20ResponseService coherent MeterValues session wiring.
 * @description Regression B2: verifies that TransactionEvent(Started) creates
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
  })

  await it('should create a coherent session on Started with idTokenInfo omitted (implicit accept)', async () => {
    const request = buildStartedRequest(TEST_TRANSACTION_UUID)
    // No idTokenInfo → treated as Accepted by handleResponseTransactionEvent.
    const response: OCPP20TransactionEventResponse = {}

    await testable.handleResponseTransactionEvent(station, response, request)

    assert.strictEqual(createSpy.mock.calls.length, 1)
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
      'B2: session must not be created when idToken rejected and force override is off'
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
      'B2: session must be created when force override is enabled, mirroring OCPP 1.6'
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
      'B2: session must only be created on eventType=Started'
    )
  })
})
