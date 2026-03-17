/**
 * @file Tests for OCPP20IncomingRequestService MasterPassGroupId check
 * @description Unit tests for OCPP 2.0 MasterPassGroupId authorization (C12.FR.09)
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type { OCPP20RequestStartTransactionRequest } from '../../../../src/types/index.js'

import { addConfigurationKey } from '../../../../src/charging-station/ConfigurationKeyUtils.js'
import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import { OCPPAuthServiceFactory } from '../../../../src/charging-station/ocpp/auth/services/OCPPAuthServiceFactory.js'
import { OCPPVersion, RequestStartStopStatusEnumType } from '../../../../src/types/index.js'
import { OCPP20IdTokenEnumType } from '../../../../src/types/ocpp/2.0/Transaction.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'
import { createMockAuthService } from '../auth/helpers/MockFactories.js'
import {
  resetConnectorTransactionState,
  resetLimits,
  resetReportingValueSize,
} from './OCPP20TestUtils.js'

await describe('C12.FR.09 - MasterPassGroupId Check', async () => {
  let mockStation: ChargingStation
  let incomingRequestService: OCPP20IncomingRequestService
  let testableService: ReturnType<typeof createTestableIncomingRequestService>

  beforeEach(() => {
    const { station } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 3,
      evseConfiguration: { evsesCount: 3 },
      heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
      ocppRequestService: {
        requestHandler: async () => Promise.resolve({}),
      },
      stationInfo: {
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
    })
    mockStation = station
    incomingRequestService = new OCPP20IncomingRequestService()
    testableService = createTestableIncomingRequestService(incomingRequestService)
    const stationId = mockStation.stationInfo?.chargingStationId ?? 'unknown'
    OCPPAuthServiceFactory.setInstanceForTesting(stationId, createMockAuthService())
    resetConnectorTransactionState(mockStation)
    resetLimits(mockStation)
    resetReportingValueSize(mockStation)
  })

  afterEach(() => {
    standardCleanup()
    OCPPAuthServiceFactory.clearAllInstances()
  })

  await it('C12.FR.09 - should reject start transaction when idToken groupId matches MasterPassGroupId', async () => {
    const masterPassGroupId = 'MASTER_GROUP_1'

    addConfigurationKey(mockStation, 'MasterPassGroupId', masterPassGroupId)

    const requestWithMasterPassGroupId: OCPP20RequestStartTransactionRequest = {
      evseId: 1,
      idToken: {
        idToken: masterPassGroupId,
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 1,
    }

    const response = await testableService.handleRequestStartTransaction(
      mockStation,
      requestWithMasterPassGroupId
    )

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, RequestStartStopStatusEnumType.Rejected)
  })

  await it('C12.FR.09 - should be no-op when MasterPassGroupId not configured', async () => {
    const validRequest: OCPP20RequestStartTransactionRequest = {
      evseId: 1,
      idToken: {
        idToken: 'VALID_TOKEN_123',
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 1,
    }

    const response = await testableService.handleRequestStartTransaction(mockStation, validRequest)

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, RequestStartStopStatusEnumType.Accepted)
    assert.notStrictEqual(response.transactionId, undefined)
    assert.strictEqual(typeof response.transactionId, 'string')
  })
})
