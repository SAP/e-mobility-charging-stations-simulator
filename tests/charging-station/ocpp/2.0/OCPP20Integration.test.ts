/**
 * @file Tests for OCPP 2.0 integration (SetVariables → GetVariables consistency)
 * @description Verifies that SetVariables and GetVariables produce consistent results
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type {
  OCPP20GetVariablesRequest,
  OCPP20GetVariablesResponse,
  OCPP20SetVariablesRequest,
  OCPP20SetVariablesResponse,
} from '../../../../src/types/index.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import { OCPPAuthServiceFactory } from '../../../../src/charging-station/ocpp/auth/index.js'
import {
  AttributeEnumType,
  GetVariableStatusEnumType,
  OCPP20ComponentName,
  OCPPVersion,
  SetVariableStatusEnumType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'
import { resetLimits } from './OCPP20TestUtils.js'

/** @returns A mock station configured for integration tests */
function createIntegrationStation (): ChargingStation {
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
    websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL,
  })
  return station
}

await describe('OCPP 2.0 Integration — SetVariables → GetVariables consistency', async () => {
  let station: ChargingStation
  let incomingRequestService: OCPP20IncomingRequestService
  let testableService: ReturnType<typeof createTestableIncomingRequestService>

  beforeEach(() => {
    station = createIntegrationStation()
    incomingRequestService = new OCPP20IncomingRequestService()
    testableService = createTestableIncomingRequestService(incomingRequestService)
    resetLimits(station)
  })

  afterEach(() => {
    standardCleanup()
    OCPPAuthServiceFactory.clearAllInstances()
  })

  await it('should read back the same value that was written via SetVariables→GetVariables', () => {
    const setRequest: OCPP20SetVariablesRequest = {
      setVariableData: [
        {
          attributeValue: '60',
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: 'HeartbeatInterval' },
        },
      ],
    }
    const getRequest: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          attributeType: AttributeEnumType.Actual,
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: 'HeartbeatInterval' },
        },
      ],
    }

    const setResponse: OCPP20SetVariablesResponse = testableService.handleRequestSetVariables(
      station,
      setRequest
    )

    assert.strictEqual(setResponse.setVariableResult.length, 1)
    const setResult = setResponse.setVariableResult[0]
    assert.strictEqual(setResult.attributeStatus, SetVariableStatusEnumType.Accepted)

    const getResponse: OCPP20GetVariablesResponse = testableService.handleRequestGetVariables(
      station,
      getRequest
    )

    assert.strictEqual(getResponse.getVariableResult.length, 1)
    const getResult = getResponse.getVariableResult[0]
    assert.strictEqual(getResult.attributeStatus, GetVariableStatusEnumType.Accepted)
    assert.strictEqual(getResult.attributeValue, '60')
  })

  await it('should return UnknownVariable for GetVariables on an unknown variable name', () => {
    const getRequest: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: 'ThisVariableDoesNotExistInRegistry' },
        },
      ],
    }

    const getResponse = testableService.handleRequestGetVariables(station, getRequest)

    assert.strictEqual(getResponse.getVariableResult.length, 1)
    const result = getResponse.getVariableResult[0]
    assert.strictEqual(
      result.attributeStatus === GetVariableStatusEnumType.UnknownVariable ||
        result.attributeStatus === GetVariableStatusEnumType.UnknownComponent,
      true
    )
  })

  await it('should handle multiple variables in a single SetVariables→GetVariables round trip', () => {
    const setRequest: OCPP20SetVariablesRequest = {
      setVariableData: [
        {
          attributeValue: '30',
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: 'HeartbeatInterval' },
        },
        {
          attributeValue: '20',
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: 'WebSocketPingInterval' },
        },
      ],
    }

    const setResponse = testableService.handleRequestSetVariables(station, setRequest)
    assert.strictEqual(setResponse.setVariableResult.length, 2)

    const getRequest: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: 'HeartbeatInterval' },
        },
        {
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: 'WebSocketPingInterval' },
        },
      ],
    }
    const getResponse = testableService.handleRequestGetVariables(station, getRequest)

    assert.strictEqual(getResponse.getVariableResult.length, 2)
    for (const result of getResponse.getVariableResult) {
      assert.strictEqual(result.attributeStatus, GetVariableStatusEnumType.Accepted)
    }
  })

  await it('should reject SetVariables on an unknown component and confirm GetVariables returns UnknownComponent', () => {
    const unknownComponent = { name: 'NonExistentComponent' as OCPP20ComponentName }
    const variableName = 'SomeVariable'

    // Attempt to set a variable on a component that does not exist in the registry
    const setRequest: OCPP20SetVariablesRequest = {
      setVariableData: [
        {
          attributeValue: '999',
          component: unknownComponent,
          variable: { name: variableName },
        },
      ],
    }
    const setResponse = testableService.handleRequestSetVariables(station, setRequest)

    assert.strictEqual(setResponse.setVariableResult.length, 1)
    const setResult = setResponse.setVariableResult[0]
    assert.strictEqual(
      setResult.attributeStatus === SetVariableStatusEnumType.UnknownComponent ||
        setResult.attributeStatus === SetVariableStatusEnumType.UnknownVariable ||
        setResult.attributeStatus === SetVariableStatusEnumType.Rejected,
      true
    )

    // Confirm GetVariables also rejects lookup on the same unknown component
    const getRequest: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          component: unknownComponent,
          variable: { name: variableName },
        },
      ],
    }
    const getResponse = testableService.handleRequestGetVariables(station, getRequest)

    assert.strictEqual(getResponse.getVariableResult.length, 1)
    const getResult = getResponse.getVariableResult[0]
    assert.strictEqual(
      getResult.attributeStatus === GetVariableStatusEnumType.UnknownComponent ||
        getResult.attributeStatus === GetVariableStatusEnumType.UnknownVariable,
      true
    )
  })
})
