/**
 * @file Tests for OCPP20IncomingRequestService MasterPassGroupId check
 * @description Unit tests for OCPP 2.0 MasterPassGroupId authorization (C12.FR.09)
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type {
  OCPP20GetVariableDataType,
  OCPP20RequestStartTransactionRequest,
} from '../../../../src/types/index.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import { OCPP20VariableManager } from '../../../../src/charging-station/ocpp/2.0/OCPP20VariableManager.js'
import { OCPPAuthServiceFactory } from '../../../../src/charging-station/ocpp/auth/index.js'
import {
  GetVariableStatusEnumType,
  OCPP20IdTokenEnumType,
  OCPP20OptionalVariableName,
  OCPPVersion,
  RequestStartStopStatusEnumType,
} from '../../../../src/types/index.js'
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
  let testableService: ReturnType<typeof createTestableIncomingRequestService>

  beforeEach(() => {
    const { station } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 3,
      evseConfiguration: { evsesCount: 3 },
      ocppRequestService: {
        requestHandler: async () => Promise.resolve({}),
      },
      stationInfo: {
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
    })
    mockStation = station
    const incomingRequestService = new OCPP20IncomingRequestService()
    testableService = createTestableIncomingRequestService(incomingRequestService)
    const stationId = mockStation.stationInfo?.chargingStationId ?? 'unknown'
    OCPPAuthServiceFactory.setInstanceForTesting(stationId, createMockAuthService())
    resetConnectorTransactionState(mockStation)
    resetLimits(mockStation)
    resetReportingValueSize(mockStation)
  })

  afterEach(() => {
    OCPP20VariableManager.getInstance().resetRuntimeOverrides()
    OCPP20VariableManager.getInstance().invalidateMappingsCache()
    standardCleanup()
    OCPPAuthServiceFactory.clearAllInstances()
  })

  await it('C12.FR.09 - should reject start transaction when groupIdToken matches MasterPassGroupId', async () => {
    const masterPassGroupId = 'MASTER_GROUP_1'

    const originalGetVariables = OCPP20VariableManager.getInstance().getVariables.bind(
      OCPP20VariableManager.getInstance()
    )
    mock.method(
      OCPP20VariableManager.getInstance(),
      'getVariables',
      (station: ChargingStation, requests: OCPP20GetVariableDataType[]) => {
        const results = originalGetVariables(station, requests)
        for (let i = 0; i < (requests as { variable?: { name?: string } }[]).length; i++) {
          const req = (requests as { variable?: { name?: string } }[])[i]
          if (req.variable?.name === OCPP20OptionalVariableName.MasterPassGroupId) {
            results[i] = {
              ...results[i],
              attributeStatus: GetVariableStatusEnumType.Accepted,
              attributeValue: masterPassGroupId,
            }
          }
        }
        return results
      }
    )

    const request: OCPP20RequestStartTransactionRequest = {
      evseId: 1,
      groupIdToken: {
        idToken: masterPassGroupId,
        type: OCPP20IdTokenEnumType.Central,
      },
      idToken: {
        idToken: 'SOME_USER_TOKEN',
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 1,
    }

    const response = await testableService.handleRequestStartTransaction(mockStation, request)

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, RequestStartStopStatusEnumType.Rejected)
  })

  await it('C12.FR.09 - should be no-op when MasterPassGroupId not configured', async () => {
    const request: OCPP20RequestStartTransactionRequest = {
      evseId: 1,
      idToken: {
        idToken: 'VALID_TOKEN_123',
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 1,
    }

    const response = await testableService.handleRequestStartTransaction(mockStation, request)

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, RequestStartStopStatusEnumType.Accepted)
    assert.notStrictEqual(response.transactionId, undefined)
  })

  await it('C12.FR.09 - should allow start when groupIdToken does not match MasterPassGroupId', async () => {
    const masterPassGroupId = 'MASTER_GROUP_1'

    const originalGetVariables = OCPP20VariableManager.getInstance().getVariables.bind(
      OCPP20VariableManager.getInstance()
    )
    mock.method(
      OCPP20VariableManager.getInstance(),
      'getVariables',
      (station: ChargingStation, requests: OCPP20GetVariableDataType[]) => {
        const results = originalGetVariables(station, requests)
        for (let i = 0; i < (requests as { variable?: { name?: string } }[]).length; i++) {
          const req = (requests as { variable?: { name?: string } }[])[i]
          if (req.variable?.name === OCPP20OptionalVariableName.MasterPassGroupId) {
            results[i] = {
              ...results[i],
              attributeStatus: GetVariableStatusEnumType.Accepted,
              attributeValue: masterPassGroupId,
            }
          }
        }
        return results
      }
    )

    const request: OCPP20RequestStartTransactionRequest = {
      evseId: 1,
      groupIdToken: {
        idToken: 'DIFFERENT_GROUP',
        type: OCPP20IdTokenEnumType.Central,
      },
      idToken: {
        idToken: 'SOME_USER_TOKEN',
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 1,
    }

    const response = await testableService.handleRequestStartTransaction(mockStation, request)

    assert.strictEqual(response.status, RequestStartStopStatusEnumType.Accepted)
  })

  await it('C12.FR.09 - should not reject when idToken matches MasterPassGroupId but groupIdToken does not', async () => {
    const masterPassGroupId = 'MASTER_GROUP_1'

    const originalGetVariables = OCPP20VariableManager.getInstance().getVariables.bind(
      OCPP20VariableManager.getInstance()
    )
    mock.method(
      OCPP20VariableManager.getInstance(),
      'getVariables',
      (station: ChargingStation, requests: OCPP20GetVariableDataType[]) => {
        const results = originalGetVariables(station, requests)
        for (let i = 0; i < (requests as { variable?: { name?: string } }[]).length; i++) {
          const req = (requests as { variable?: { name?: string } }[])[i]
          if (req.variable?.name === OCPP20OptionalVariableName.MasterPassGroupId) {
            results[i] = {
              ...results[i],
              attributeStatus: GetVariableStatusEnumType.Accepted,
              attributeValue: masterPassGroupId,
            }
          }
        }
        return results
      }
    )

    const request: OCPP20RequestStartTransactionRequest = {
      evseId: 1,
      groupIdToken: {
        idToken: 'DIFFERENT_GROUP',
        type: OCPP20IdTokenEnumType.Central,
      },
      idToken: {
        idToken: masterPassGroupId,
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 1,
    }

    const response = await testableService.handleRequestStartTransaction(mockStation, request)

    assert.strictEqual(response.status, RequestStartStopStatusEnumType.Accepted)
  })
})
