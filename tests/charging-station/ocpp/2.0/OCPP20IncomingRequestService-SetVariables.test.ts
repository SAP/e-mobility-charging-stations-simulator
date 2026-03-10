/**
 * @file Tests for OCPP20IncomingRequestService SetVariables
 * @description Unit tests for OCPP 2.0 SetVariables command handling
 */

import { millisecondsToSeconds } from 'date-fns'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import { OCPP20VariableManager } from '../../../../src/charging-station/ocpp/2.0/OCPP20VariableManager.js'
import {
  AttributeEnumType,
  GetVariableStatusEnumType,
  OCPP20ComponentName,
  type OCPP20GetVariableResultType,
  OCPP20OptionalVariableName,
  OCPP20RequiredVariableName,
  type OCPP20SetVariableResultType,
  type OCPP20SetVariablesRequest,
  OCPP20VendorVariableName,
  OCPPVersion,
  ReasonCodeEnumType,
  SetVariableStatusEnumType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import {
  TEST_CHARGING_STATION_BASE_NAME,
  TEST_CONNECTOR_ID_VALID_INSTANCE,
} from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'
import {
  resetLimits,
  resetValueSizeLimits,
  setConfigurationValueSize,
  setStrictLimits,
  setValueSize,
  upsertConfigurationKey,
} from './OCPP20TestUtils.js'

await describe('B05 - Set Variables', async () => {
  let mockStation: ChargingStation
  let incomingRequestService: OCPP20IncomingRequestService
  let testableService: ReturnType<typeof createTestableIncomingRequestService>

  beforeEach(() => {
    const { station } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 3,
      evseConfiguration: { evsesCount: 3 },
      heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
      stationInfo: {
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
    })
    mockStation = station
    incomingRequestService = new OCPP20IncomingRequestService()
    testableService = createTestableIncomingRequestService(incomingRequestService)
  })

  // Reset singleton state after each test to ensure test isolation
  afterEach(() => {
    standardCleanup()
    OCPP20VariableManager.getInstance().resetRuntimeOverrides()
  })

  // FR: B05.FR.01, B05.FR.10
  await it('should handle SetVariables request with valid writable variables', () => {
    const request: OCPP20SetVariablesRequest = {
      setVariableData: [
        {
          attributeType: AttributeEnumType.Actual,
          attributeValue: (Constants.DEFAULT_WEBSOCKET_PING_INTERVAL + 1).toString(),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
        {
          attributeType: AttributeEnumType.Actual,
          attributeValue: (
            millisecondsToSeconds(Constants.DEFAULT_HEARTBEAT_INTERVAL) + 1
          ).toString(),
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ],
    }

    const response: { setVariableResult: OCPP20SetVariableResultType[] } =
      testableService.handleRequestSetVariables(mockStation, request)

    assert.notStrictEqual(response, undefined)
    assert.notStrictEqual(response.setVariableResult, undefined)
    assert.ok(Array.isArray(response.setVariableResult))
    assert.strictEqual(response.setVariableResult.length, 2)

    const firstResult = response.setVariableResult[0]
    assert.strictEqual(firstResult.attributeStatus, SetVariableStatusEnumType.Accepted)
    assert.strictEqual(firstResult.attributeType, AttributeEnumType.Actual)
    assert.strictEqual(firstResult.component.name, OCPP20ComponentName.ChargingStation)
    assert.strictEqual(firstResult.variable.name, OCPP20OptionalVariableName.WebSocketPingInterval)
    assert.strictEqual(firstResult.attributeStatusInfo, undefined)

    const secondResult = response.setVariableResult[1]
    assert.strictEqual(secondResult.attributeStatus, SetVariableStatusEnumType.Accepted)
    assert.strictEqual(secondResult.attributeType, AttributeEnumType.Actual)
    assert.strictEqual(secondResult.component.name, OCPP20ComponentName.OCPPCommCtrlr)
    assert.strictEqual(secondResult.variable.name, OCPP20OptionalVariableName.HeartbeatInterval)
    assert.strictEqual(secondResult.attributeStatusInfo, undefined)
  })

  // FR: B07.FR.02
  await it('should handle SetVariables request with invalid variables/components', () => {
    const request: OCPP20SetVariablesRequest = {
      setVariableData: [
        {
          attributeValue: '10',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: 'InvalidVariable' },
        },
        {
          attributeValue: '20',
          component: { name: 'InvalidComponent' },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ],
    }

    const response: { setVariableResult: OCPP20SetVariableResultType[] } =
      testableService.handleRequestSetVariables(mockStation, request)

    assert.strictEqual(response.setVariableResult.length, 2)
    const firstResult = response.setVariableResult[0]
    assert.strictEqual(firstResult.attributeStatus, SetVariableStatusEnumType.UnknownVariable)
    assert.notStrictEqual(firstResult.attributeStatusInfo, undefined)
    const secondResult = response.setVariableResult[1]
    assert.strictEqual(secondResult.attributeStatus, SetVariableStatusEnumType.UnknownComponent)
    assert.notStrictEqual(secondResult.attributeStatusInfo, undefined)
  })

  // FR: B07.FR.03
  await it('should handle SetVariables request with unsupported attribute type', () => {
    const request: OCPP20SetVariablesRequest = {
      setVariableData: [
        {
          attributeType: AttributeEnumType.Target, // Not supported for HeartbeatInterval
          attributeValue: '30',
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ],
    }

    const response: { setVariableResult: OCPP20SetVariableResultType[] } =
      testableService.handleRequestSetVariables(mockStation, request)

    assert.strictEqual(response.setVariableResult.length, 1)
    const result = response.setVariableResult[0]
    assert.strictEqual(result.attributeStatus, SetVariableStatusEnumType.NotSupportedAttributeType)
    assert.strictEqual(result.attributeStatusInfo?.reasonCode, ReasonCodeEnumType.UnsupportedParam)
  })

  // FR: B07.FR.04
  await it('should reject AuthorizeRemoteStart under Connector component for write', () => {
    const request: OCPP20SetVariablesRequest = {
      setVariableData: [
        {
          attributeValue: 'true',
          component: {
            instance: TEST_CONNECTOR_ID_VALID_INSTANCE,
            name: OCPP20ComponentName.Connector,
          },
          variable: { name: OCPP20RequiredVariableName.AuthorizeRemoteStart },
        },
      ],
    }
    const response: { setVariableResult: OCPP20SetVariableResultType[] } =
      testableService.handleRequestSetVariables(mockStation, request)
    assert.strictEqual(response.setVariableResult.length, 1)
    const result = response.setVariableResult[0]
    assert.strictEqual(result.attributeStatus, SetVariableStatusEnumType.UnknownComponent)
  })

  // FR: B07.FR.05
  await it('should reject value exceeding max length at service level', () => {
    const longValue = 'x'.repeat(2501)
    const request: OCPP20SetVariablesRequest = {
      setVariableData: [
        {
          attributeValue: longValue,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
      ],
    }

    const response: { setVariableResult: OCPP20SetVariableResultType[] } =
      testableService.handleRequestSetVariables(mockStation, request)

    assert.strictEqual(response.setVariableResult.length, 1)
    const result = response.setVariableResult[0]
    assert.strictEqual(result.attributeStatus, SetVariableStatusEnumType.Rejected)
    assert.strictEqual(result.attributeStatusInfo?.reasonCode, ReasonCodeEnumType.TooLargeElement)
  })

  // FR: B07.FR.07
  await it('should handle mixed SetVariables request with multiple outcomes', () => {
    const longValue = 'y'.repeat(2501)
    const request: OCPP20SetVariablesRequest = {
      setVariableData: [
        // Accepted
        {
          attributeValue: (Constants.DEFAULT_WEBSOCKET_PING_INTERVAL + 3).toString(),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
        // UnknownVariable
        {
          attributeValue: '10',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: 'UnknownVariable' },
        },
        // Unsupported attribute type (HeartbeatInterval)
        {
          attributeType: AttributeEnumType.Target,
          attributeValue: '35',
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
        // Unsupported attribute type (WebSocketPingInterval)
        {
          attributeType: AttributeEnumType.Target,
          attributeValue: (Constants.DEFAULT_WEBSOCKET_PING_INTERVAL + 10).toString(),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
        // Oversize value
        {
          attributeValue: longValue,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
      ],
    }

    const response: { setVariableResult: OCPP20SetVariableResultType[] } =
      testableService.handleRequestSetVariables(mockStation, request)

    assert.strictEqual(response.setVariableResult.length, 5)
    const [accepted, unknownVariable, unsupportedAttrHeartbeat, unsupportedAttrWs, oversize] =
      response.setVariableResult
    assert.strictEqual(accepted.attributeStatus, SetVariableStatusEnumType.Accepted)
    assert.strictEqual(accepted.attributeStatusInfo, undefined)
    assert.strictEqual(unknownVariable.attributeStatus, SetVariableStatusEnumType.UnknownVariable)
    assert.strictEqual(unsupportedAttrHeartbeat.attributeStatus,
      SetVariableStatusEnumType.NotSupportedAttributeType
    )
    assert.strictEqual(unsupportedAttrWs.attributeStatus,
      SetVariableStatusEnumType.NotSupportedAttributeType
    )
    assert.strictEqual(oversize.attributeStatus, SetVariableStatusEnumType.Rejected)
    assert.strictEqual(oversize.attributeStatusInfo?.reasonCode, ReasonCodeEnumType.TooLargeElement)
  })

  // FR: B07.FR.08
  await it('should reject Target attribute for WebSocketPingInterval explicitly', () => {
    const request: OCPP20SetVariablesRequest = {
      setVariableData: [
        {
          attributeType: AttributeEnumType.Target,
          attributeValue: (Constants.DEFAULT_WEBSOCKET_PING_INTERVAL + 6).toString(),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
      ],
    }
    const response: { setVariableResult: OCPP20SetVariableResultType[] } =
      testableService.handleRequestSetVariables(mockStation, request)
    assert.strictEqual(response.setVariableResult.length, 1)
    const result = response.setVariableResult[0]
    assert.strictEqual(result.attributeStatus, SetVariableStatusEnumType.NotSupportedAttributeType)
    assert.strictEqual(result.attributeStatusInfo?.reasonCode, ReasonCodeEnumType.UnsupportedParam)
  })

  // FR: B07.FR.09
  await it('should reject immutable DateTime variable', () => {
    const request: OCPP20SetVariablesRequest = {
      setVariableData: [
        {
          attributeType: AttributeEnumType.Actual,
          attributeValue: new Date(Date.now() + 1000).toISOString(),
          component: { name: OCPP20ComponentName.ClockCtrlr },
          variable: { name: OCPP20RequiredVariableName.DateTime },
        },
      ],
    }
    const response: { setVariableResult: OCPP20SetVariableResultType[] } =
      testableService.handleRequestSetVariables(mockStation, request)
    assert.strictEqual(response.setVariableResult.length, 1)
    const result = response.setVariableResult[0]
    assert.strictEqual(result.attributeStatus, SetVariableStatusEnumType.Rejected)
    assert.strictEqual(result.attributeStatusInfo?.reasonCode, ReasonCodeEnumType.ReadOnly)
  })

  // FR: B07.FR.10
  await it('should persist HeartbeatInterval and WebSocketPingInterval after setting', () => {
    const hbNew = (millisecondsToSeconds(Constants.DEFAULT_HEARTBEAT_INTERVAL) + 20).toString()
    const wsNew = (Constants.DEFAULT_WEBSOCKET_PING_INTERVAL + 20).toString()
    const setRequest: OCPP20SetVariablesRequest = {
      setVariableData: [
        {
          attributeValue: hbNew,
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
        {
          attributeValue: wsNew,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
      ],
    }
    testableService.handleRequestSetVariables(mockStation, setRequest)

    const getResponse: { getVariableResult: OCPP20GetVariableResultType[] } =
      testableService.handleRequestGetVariables(mockStation, {
        getVariableData: [
          {
            attributeType: AttributeEnumType.Actual,
            component: { name: OCPP20ComponentName.OCPPCommCtrlr },
            variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
          },
          {
            attributeType: AttributeEnumType.Actual,
            component: { name: OCPP20ComponentName.ChargingStation },
            variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
          },
        ],
      })

    assert.strictEqual(getResponse.getVariableResult.length, 2)
    const hbResult = getResponse.getVariableResult[0]
    const wsResult = getResponse.getVariableResult[1]
    assert.notStrictEqual(hbResult.attributeStatus, undefined)
    assert.strictEqual(hbResult.attributeValue, hbNew)
    assert.strictEqual(wsResult.attributeValue, wsNew)
  })

  // FR: B07.FR.11
  await it('should revert non-persistent TxUpdatedInterval after runtime reset', async () => {
    const txValue = '77'
    const setRequest: OCPP20SetVariablesRequest = {
      setVariableData: [
        {
          attributeValue: txValue,
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ],
    }
    testableService.handleRequestSetVariables(mockStation, setRequest)

    const getBefore: { getVariableResult: OCPP20GetVariableResultType[] } =
      testableService.handleRequestGetVariables(mockStation, {
        getVariableData: [
          {
            attributeType: AttributeEnumType.Actual,
            component: { name: OCPP20ComponentName.SampledDataCtrlr },
            variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
          },
        ],
      })
    assert.strictEqual(getBefore.getVariableResult[0].attributeValue, txValue)

    const { OCPP20VariableManager } =
      await import('../../../../src/charging-station/ocpp/2.0/OCPP20VariableManager.js')
    OCPP20VariableManager.getInstance().resetRuntimeOverrides()

    const getAfter: { getVariableResult: OCPP20GetVariableResultType[] } =
      testableService.handleRequestGetVariables(mockStation, {
        getVariableData: [
          {
            component: { name: OCPP20ComponentName.SampledDataCtrlr },
            variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
          },
        ],
      })
    assert.strictEqual(getAfter.getVariableResult[0].attributeValue, '30') // default
  })

  // FR: B07.FR.12
  await it('should reject all SetVariables when ItemsPerMessage limit exceeded', () => {
    setStrictLimits(mockStation, 1, 10000)
    const request: OCPP20SetVariablesRequest = {
      setVariableData: [
        {
          attributeValue: (Constants.DEFAULT_WEBSOCKET_PING_INTERVAL + 2).toString(),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
        {
          attributeValue: (
            millisecondsToSeconds(Constants.DEFAULT_HEARTBEAT_INTERVAL) + 2
          ).toString(),
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ],
    }
    const response: { setVariableResult: OCPP20SetVariableResultType[] } =
      testableService.handleRequestSetVariables(mockStation, request)
    assert.strictEqual(response.setVariableResult.length, 2)
    response.setVariableResult.forEach(r => {
      assert.strictEqual(r.attributeStatus, SetVariableStatusEnumType.Rejected)
      if (r.attributeStatusInfo == null) { assert.fail('Expected attributeStatusInfo to be defined') }
      assert.strictEqual(r.attributeStatusInfo.reasonCode, ReasonCodeEnumType.TooManyElements)
      if (r.attributeStatusInfo.additionalInfo == null) { assert.fail('Expected additionalInfo to be defined') }
      assert.match(r.attributeStatusInfo.additionalInfo, /ItemsPerMessage limit 1 exceeded/)
    })
    resetLimits(mockStation)
  })

  await it('should reject all SetVariables when BytesPerMessage limit exceeded (pre-calculation)', () => {
    // Set strict bytes limit low enough for request pre-estimate to exceed
    setStrictLimits(mockStation, 100, 10)
    const request: OCPP20SetVariablesRequest = {
      setVariableData: [
        {
          attributeValue: '5',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
        {
          attributeValue: '10',
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ],
    }
    const response: { setVariableResult: OCPP20SetVariableResultType[] } =
      testableService.handleRequestSetVariables(mockStation, request)
    assert.strictEqual(response.setVariableResult.length, 2)
    response.setVariableResult.forEach(r => {
      assert.strictEqual(r.attributeStatus, SetVariableStatusEnumType.Rejected)
      if (r.attributeStatusInfo == null) { assert.fail('Expected attributeStatusInfo to be defined') }
      assert.strictEqual(r.attributeStatusInfo.reasonCode, ReasonCodeEnumType.TooLargeElement)
      if (r.attributeStatusInfo.additionalInfo == null) { assert.fail('Expected additionalInfo to be defined') }
      assert.match(r.attributeStatusInfo.additionalInfo, /BytesPerMessage limit 10 exceeded/)
    })
    resetLimits(mockStation)
  })

  await it('should reject all SetVariables when BytesPerMessage limit exceeded (post-calculation)', () => {
    const request: OCPP20SetVariablesRequest = {
      setVariableData: [
        {
          attributeType: AttributeEnumType.Target,
          attributeValue: '60',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
        {
          attributeValue: '10',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: 'UnknownVariableA' },
        },
        {
          attributeValue: '11',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: 'UnknownVariableB' },
        },
        {
          attributeValue: '12',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: 'UnknownVariableC' },
        },
        {
          attributeValue: '13',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: 'UnknownVariableD' },
        },
        {
          attributeValue: '14',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: 'UnknownVariableE' },
        },
        {
          attributeValue: '15',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: 'UnknownVariableF' },
        },
      ],
    }
    const preEstimate = Buffer.byteLength(JSON.stringify(request.setVariableData), 'utf8')
    const postCalcLimit = preEstimate + 10
    upsertConfigurationKey(
      mockStation,
      OCPP20RequiredVariableName.BytesPerMessage,
      postCalcLimit.toString(),
      false
    )
    assert.ok(preEstimate < postCalcLimit)
    const response: { setVariableResult: OCPP20SetVariableResultType[] } =
      testableService.handleRequestSetVariables(mockStation, request)
    const actualSize = Buffer.byteLength(JSON.stringify(response.setVariableResult), 'utf8')
    assert.ok(actualSize > postCalcLimit)
    assert.strictEqual(response.setVariableResult.length, request.setVariableData.length)
    response.setVariableResult.forEach(r => {
      assert.strictEqual(r.attributeStatus, SetVariableStatusEnumType.Rejected)
      if (r.attributeStatusInfo == null) { assert.fail('Expected attributeStatusInfo to be defined') }
      assert.strictEqual(r.attributeStatusInfo.reasonCode, ReasonCodeEnumType.TooLargeElement)
      if (r.attributeStatusInfo.additionalInfo == null) { assert.fail('Expected additionalInfo to be defined') }
      assert.match(r.attributeStatusInfo.additionalInfo,
        new RegExp(`BytesPerMessage limit ${postCalcLimit.toString()} exceeded`)
      )
    })
    resetLimits(mockStation)
  })

  // Effective ConfigurationValueSize / ValueSize propagation tests
  await it('should enforce ConfigurationValueSize when ValueSize unset (service propagation)', () => {
    resetValueSizeLimits(mockStation)
    setConfigurationValueSize(mockStation, 100)
    upsertConfigurationKey(mockStation, OCPP20RequiredVariableName.ValueSize, '')
    const prefix = 'wss://example.com/'
    const withinLimit = prefix + 'a'.repeat(100 - prefix.length)
    const overLimit = prefix + 'a'.repeat(100 - prefix.length + 1)
    let response = testableService.handleRequestSetVariables(mockStation, {
      setVariableData: [
        {
          attributeValue: withinLimit,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ],
    })
    assert.strictEqual(response.setVariableResult[0].attributeStatus, SetVariableStatusEnumType.Accepted)
    response = testableService.handleRequestSetVariables(mockStation, {
      setVariableData: [
        {
          attributeValue: overLimit,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ],
    })
    const res = response.setVariableResult[0]
    assert.strictEqual(res.attributeStatus, SetVariableStatusEnumType.Rejected)
    assert.strictEqual(res.attributeStatusInfo?.reasonCode, ReasonCodeEnumType.TooLargeElement)
    resetValueSizeLimits(mockStation)
  })

  await it('should enforce ValueSize when ConfigurationValueSize unset (service propagation)', () => {
    resetValueSizeLimits(mockStation)
    upsertConfigurationKey(mockStation, OCPP20RequiredVariableName.ConfigurationValueSize, '')
    setValueSize(mockStation, 120)
    const prefix = 'wss://example.com/'
    const withinLimit = prefix + 'b'.repeat(120 - prefix.length)
    const overLimit = prefix + 'b'.repeat(120 - prefix.length + 1)
    let response = testableService.handleRequestSetVariables(mockStation, {
      setVariableData: [
        {
          attributeValue: withinLimit,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ],
    })
    assert.strictEqual(response.setVariableResult[0].attributeStatus, SetVariableStatusEnumType.Accepted)
    response = testableService.handleRequestSetVariables(mockStation, {
      setVariableData: [
        {
          attributeValue: overLimit,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ],
    })
    const res = response.setVariableResult[0]
    assert.strictEqual(res.attributeStatus, SetVariableStatusEnumType.Rejected)
    assert.strictEqual(res.attributeStatusInfo?.reasonCode, ReasonCodeEnumType.TooLargeElement)
    resetValueSizeLimits(mockStation)
  })

  await it('should use smaller ValueSize when ValueSize < ConfigurationValueSize (service propagation)', () => {
    resetValueSizeLimits(mockStation)
    setConfigurationValueSize(mockStation, 400)
    setValueSize(mockStation, 350)
    const prefix = 'wss://example.com/'
    const withinLimit = prefix + 'c'.repeat(350 - prefix.length)
    const overLimit = prefix + 'c'.repeat(350 - prefix.length + 1)
    let response = testableService.handleRequestSetVariables(mockStation, {
      setVariableData: [
        {
          attributeValue: withinLimit,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ],
    })
    assert.strictEqual(response.setVariableResult[0].attributeStatus, SetVariableStatusEnumType.Accepted)
    response = testableService.handleRequestSetVariables(mockStation, {
      setVariableData: [
        {
          attributeValue: overLimit,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ],
    })
    const res = response.setVariableResult[0]
    assert.strictEqual(res.attributeStatus, SetVariableStatusEnumType.Rejected)
    assert.strictEqual(res.attributeStatusInfo?.reasonCode, ReasonCodeEnumType.TooLargeElement)
    resetValueSizeLimits(mockStation)
  })

  await it('should use smaller ConfigurationValueSize when ConfigurationValueSize < ValueSize (service propagation)', () => {
    resetValueSizeLimits(mockStation)
    setConfigurationValueSize(mockStation, 260)
    setValueSize(mockStation, 500)
    const prefix = 'wss://example.com/'
    const withinLimit = prefix + 'd'.repeat(260 - prefix.length)
    const overLimit = prefix + 'd'.repeat(260 - prefix.length + 1)
    let response = testableService.handleRequestSetVariables(mockStation, {
      setVariableData: [
        {
          attributeValue: withinLimit,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ],
    })
    assert.strictEqual(response.setVariableResult[0].attributeStatus, SetVariableStatusEnumType.Accepted)
    response = testableService.handleRequestSetVariables(mockStation, {
      setVariableData: [
        {
          attributeValue: overLimit,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ],
    })
    const res = response.setVariableResult[0]
    assert.strictEqual(res.attributeStatus, SetVariableStatusEnumType.Rejected)
    assert.strictEqual(res.attributeStatusInfo?.reasonCode, ReasonCodeEnumType.TooLargeElement)
    resetValueSizeLimits(mockStation)
  })

  await it('should fallback to default absolute max length when both limits invalid/non-positive', () => {
    resetValueSizeLimits(mockStation)
    setConfigurationValueSize(mockStation, 0)
    setValueSize(mockStation, -5)
    const prefix = 'wss://example.com/'
    const validValue = prefix + 'e'.repeat(300 - prefix.length) // 300 < default absolute max length and < ConnectionUrl maxLength
    const response = testableService.handleRequestSetVariables(mockStation, {
      setVariableData: [
        {
          attributeValue: validValue,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ],
    })
    const res = response.setVariableResult[0]
    assert.strictEqual(res.attributeStatus, SetVariableStatusEnumType.Accepted)
    assert.strictEqual(res.attributeStatusInfo, undefined)
    resetValueSizeLimits(mockStation)
  })

  // FR: B07.FR.12 (updated behavior: ConnectionUrl now readable after set)
  await it('should allow ConnectionUrl read-back after setting', () => {
    resetLimits(mockStation)
    const url = 'wss://central.example.com/ocpp'
    const setRequest: OCPP20SetVariablesRequest = {
      setVariableData: [
        {
          attributeValue: url,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ],
    }
    testableService.handleRequestSetVariables(mockStation, setRequest)
    const getResponse: { getVariableResult: OCPP20GetVariableResultType[] } =
      testableService.handleRequestGetVariables(mockStation, {
        getVariableData: [
          {
            attributeType: AttributeEnumType.Actual,
            component: { name: OCPP20ComponentName.ChargingStation },
            variable: { name: OCPP20VendorVariableName.ConnectionUrl },
          },
        ],
      })
    assert.strictEqual(getResponse.getVariableResult.length, 1)
    const result = getResponse.getVariableResult[0]
    assert.strictEqual(result.attributeStatus, GetVariableStatusEnumType.Accepted)
    assert.strictEqual(result.attributeValue, url)
    assert.strictEqual(result.attributeStatusInfo, undefined)
    resetLimits(mockStation)
  })

  await it('should accept ConnectionUrl with custom mqtt scheme (no scheme restriction)', () => {
    resetLimits(mockStation)
    const url = 'mqtt://broker.internal:1883/ocpp'
    const setRequest: OCPP20SetVariablesRequest = {
      setVariableData: [
        {
          attributeValue: url,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ],
    }
    const response: { setVariableResult: OCPP20SetVariableResultType[] } =
      testableService.handleRequestSetVariables(mockStation, setRequest)
    assert.strictEqual(response.setVariableResult.length, 1)
    const setResult = response.setVariableResult[0]
    assert.strictEqual(setResult.attributeStatus, SetVariableStatusEnumType.Accepted)
    assert.strictEqual(setResult.attributeStatusInfo, undefined)
    const getResponse: { getVariableResult: OCPP20GetVariableResultType[] } =
      testableService.handleRequestGetVariables(mockStation, {
        getVariableData: [
          {
            attributeType: AttributeEnumType.Actual,
            component: { name: OCPP20ComponentName.ChargingStation },
            variable: { name: OCPP20VendorVariableName.ConnectionUrl },
          },
        ],
      })
    assert.strictEqual(getResponse.getVariableResult.length, 1)
    const getResult = getResponse.getVariableResult[0]
    assert.strictEqual(getResult.attributeStatus, GetVariableStatusEnumType.Accepted)
    assert.strictEqual(getResult.attributeValue, url)
    assert.strictEqual(getResult.attributeStatusInfo, undefined)
    resetLimits(mockStation)
  })
})
