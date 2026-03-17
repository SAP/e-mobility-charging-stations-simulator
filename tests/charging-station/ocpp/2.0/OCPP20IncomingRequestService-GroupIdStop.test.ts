/**
 * @file Tests for OCPP 2.0 GroupId-based stop transaction authorization
 * @description Unit tests for C01.FR.03, C09.FR.03, C09.FR.07 conformance
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type { OCPP20RequestStartTransactionRequest } from '../../../../src/types/index.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import { OCPPAuthServiceFactory } from '../../../../src/charging-station/ocpp/auth/services/OCPPAuthServiceFactory.js'
import { RequestStartStopStatusEnumType } from '../../../../src/types/index.js'
import { OCPP20IdTokenEnumType } from '../../../../src/types/ocpp/2.0/Transaction.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockAuthService } from '../auth/helpers/MockFactories.js'
import {
  createOCPP20ListenerStation,
  resetConnectorTransactionState,
  resetLimits,
  resetReportingValueSize,
} from './OCPP20TestUtils.js'

const GROUP_ID_TOKEN = 'GROUP_ALPHA'
const DIFFERENT_GROUP_ID_TOKEN = 'GROUP_BETA'
const START_TOKEN = 'START_USER_001'
const STOP_TOKEN_SAME_GROUP = 'STOP_USER_002'
const STOP_TOKEN_DIFFERENT_GROUP = 'STOP_USER_003'

await describe('C09 - GroupId-based Stop Transaction Authorization', async () => {
  let mockStation: ChargingStation
  let incomingRequestService: OCPP20IncomingRequestService
  let testableService: ReturnType<typeof createTestableIncomingRequestService>

  beforeEach(() => {
    const { station } = createOCPP20ListenerStation(TEST_CHARGING_STATION_BASE_NAME)
    mockStation = station
    incomingRequestService = new OCPP20IncomingRequestService()
    testableService = createTestableIncomingRequestService(incomingRequestService)
    const stationId = mockStation.stationInfo?.chargingStationId ?? 'unknown'
    OCPPAuthServiceFactory.setInstanceForTesting(stationId, createMockAuthService())
    resetLimits(mockStation)
    resetReportingValueSize(mockStation)
    resetConnectorTransactionState(mockStation)
  })

  afterEach(() => {
    standardCleanup()
    OCPPAuthServiceFactory.clearAllInstances()
  })

  /**
   * Start a transaction with group ID token.
   * @param station - The charging station instance
   * @param evseId - The EVSE ID (default: 1)
   * @param remoteStartId - The remote start ID (default: 1)
   * @param idToken - The ID token (default: START_TOKEN)
   * @param groupIdToken - The group ID token (optional)
   * @returns The transaction ID
   */
  async function startTransactionWithGroup (
    station: ChargingStation,
    evseId = 1,
    remoteStartId = 1,
    idToken = START_TOKEN,
    groupIdToken?: string
  ): Promise<string> {
    const startRequest: OCPP20RequestStartTransactionRequest = {
      evseId,
      groupIdToken:
        groupIdToken != null
          ? { idToken: groupIdToken, type: OCPP20IdTokenEnumType.Central }
          : undefined,
      idToken: {
        idToken,
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId,
    }

    const startResponse = await testableService.handleRequestStartTransaction(station, startRequest)

    assert.strictEqual(startResponse.status, RequestStartStopStatusEnumType.Accepted)
    assert.notStrictEqual(startResponse.transactionId, undefined)
    return startResponse.transactionId as string
  }

  // FR: C09.FR.03
  await it('C09.FR.03 - should authorize stop by same GroupIdToken without AuthorizationRequest', async () => {
    await startTransactionWithGroup(mockStation, 1, 100, START_TOKEN, GROUP_ID_TOKEN)

    const connectorStatus = mockStation.getConnectorStatus(1)
    assert.notStrictEqual(connectorStatus, undefined)
    if (connectorStatus == null) {
      assert.fail('Expected connectorStatus to be defined')
    }
    assert.strictEqual(connectorStatus.transactionGroupIdToken, GROUP_ID_TOKEN)

    const isAuthorized = testableService.isAuthorizedToStopTransaction(
      mockStation,
      1,
      { idToken: STOP_TOKEN_SAME_GROUP, type: OCPP20IdTokenEnumType.ISO14443 },
      { idToken: GROUP_ID_TOKEN, type: OCPP20IdTokenEnumType.Central }
    )

    assert.strictEqual(isAuthorized, true)
  })

  // FR: C09.FR.07
  await it('C09.FR.07 - should end authorization without CSMS request when GroupIdToken matches', async () => {
    await startTransactionWithGroup(mockStation, 2, 200, START_TOKEN, GROUP_ID_TOKEN)

    const connectorStatus = mockStation.getConnectorStatus(2)
    if (connectorStatus == null) {
      assert.fail('Expected connectorStatus to be defined')
    }
    assert.strictEqual(connectorStatus.transactionGroupIdToken, GROUP_ID_TOKEN)
    assert.strictEqual(connectorStatus.transactionStarted, true)

    const isAuthorized = testableService.isAuthorizedToStopTransaction(
      mockStation,
      2,
      { idToken: STOP_TOKEN_SAME_GROUP, type: OCPP20IdTokenEnumType.ISO14443 },
      { idToken: GROUP_ID_TOKEN, type: OCPP20IdTokenEnumType.Central }
    )

    assert.strictEqual(isAuthorized, true)
  })

  await it('should NOT authorize stop by different GroupIdToken', async () => {
    await startTransactionWithGroup(mockStation, 1, 300, START_TOKEN, GROUP_ID_TOKEN)

    const isAuthorized = testableService.isAuthorizedToStopTransaction(
      mockStation,
      1,
      { idToken: STOP_TOKEN_DIFFERENT_GROUP, type: OCPP20IdTokenEnumType.ISO14443 },
      { idToken: DIFFERENT_GROUP_ID_TOKEN, type: OCPP20IdTokenEnumType.Central }
    )

    assert.strictEqual(isAuthorized, false)
  })

  // FR: C01.FR.03(a)
  await it('should authorize stop by same idToken as start without GroupIdToken', async () => {
    await startTransactionWithGroup(mockStation, 1, 400, START_TOKEN)

    const isAuthorized = testableService.isAuthorizedToStopTransaction(mockStation, 1, {
      idToken: START_TOKEN,
      type: OCPP20IdTokenEnumType.ISO14443,
    })

    assert.strictEqual(isAuthorized, true)
  })

  await it('should NOT authorize stop when no active transaction on connector', () => {
    const isAuthorized = testableService.isAuthorizedToStopTransaction(
      mockStation,
      1,
      { idToken: START_TOKEN, type: OCPP20IdTokenEnumType.ISO14443 },
      { idToken: GROUP_ID_TOKEN, type: OCPP20IdTokenEnumType.Central }
    )

    assert.strictEqual(isAuthorized, false)
  })

  await it('should NOT authorize stop when presented GroupIdToken is undefined but start had one', async () => {
    await startTransactionWithGroup(mockStation, 1, 500, START_TOKEN, GROUP_ID_TOKEN)

    const isAuthorized = testableService.isAuthorizedToStopTransaction(mockStation, 1, {
      idToken: STOP_TOKEN_SAME_GROUP,
      type: OCPP20IdTokenEnumType.ISO14443,
    })

    assert.strictEqual(isAuthorized, false)
  })

  await it('should store transactionGroupIdToken on connector during start', async () => {
    await startTransactionWithGroup(mockStation, 1, 600, START_TOKEN, GROUP_ID_TOKEN)

    const connectorStatus = mockStation.getConnectorStatus(1)
    if (connectorStatus == null) {
      assert.fail('Expected connectorStatus to be defined')
    }
    assert.strictEqual(connectorStatus.transactionGroupIdToken, GROUP_ID_TOKEN)
    assert.strictEqual(connectorStatus.transactionIdTag, START_TOKEN)
  })

  await it('should not store transactionGroupIdToken when start has no groupIdToken', async () => {
    await startTransactionWithGroup(mockStation, 1, 700, START_TOKEN)

    const connectorStatus = mockStation.getConnectorStatus(1)
    if (connectorStatus == null) {
      assert.fail('Expected connectorStatus to be defined')
    }
    assert.strictEqual(connectorStatus.transactionGroupIdToken, undefined)
  })
})
