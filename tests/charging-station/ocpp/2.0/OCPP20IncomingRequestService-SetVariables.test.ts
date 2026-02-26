/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from '@std/expect'
import { millisecondsToSeconds } from 'date-fns'
import { describe, it } from 'node:test'

import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  AttributeEnumType,
  GetVariableStatusEnumType,
  OCPP20ComponentName,
  type OCPP20GetVariableDataType,
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
import { createChargingStation } from '../../../ChargingStationFactory.js'
import {
  TEST_CHARGING_STATION_BASE_NAME,
  TEST_CONNECTOR_VALID_INSTANCE,
} from './OCPP20TestConstants.js'
import {
  resetLimits,
  resetValueSizeLimits,
  setConfigurationValueSize,
  setStrictLimits,
  setValueSize,
  upsertConfigurationKey,
} from './OCPP20TestUtils.js'

interface IncomingRequestServicePrivate {
  handleRequestGetVariables: (
    chargingStation: any,
    request: OCPP20GetVariablesRequest
  ) => { getVariableResult: OCPP20GetVariableResultType[] }
  handleRequestSetVariables: (
    chargingStation: any,
    request: OCPP20SetVariablesRequest
  ) => { setVariableResult: OCPP20SetVariableResultType[] }
}

interface OCPP20GetVariablesRequest {
  getVariableData: OCPP20GetVariableDataType[]
}

await describe('B05 - Set Variables', async () => {
  const mockChargingStation = createChargingStation({
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

  const incomingRequestService = new OCPP20IncomingRequestService()
  const svc = incomingRequestService as unknown as IncomingRequestServicePrivate

  // FR: B05.FR.01, B05.FR.10
  await it('Should handle SetVariables request with valid writable variables', () => {
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
      svc.handleRequestSetVariables(mockChargingStation, request)

    expect(response).toBeDefined()
    expect(response.setVariableResult).toBeDefined()
    expect(Array.isArray(response.setVariableResult)).toBe(true)
    expect(response.setVariableResult).toHaveLength(2)

    const firstResult = response.setVariableResult[0]
    expect(firstResult.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
    expect(firstResult.attributeType).toBe(AttributeEnumType.Actual)
    expect(firstResult.component.name).toBe(OCPP20ComponentName.ChargingStation)
    expect(firstResult.variable.name).toBe(OCPP20OptionalVariableName.WebSocketPingInterval)
    expect(firstResult.attributeStatusInfo).toBeUndefined()

    const secondResult = response.setVariableResult[1]
    expect(secondResult.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
    expect(secondResult.attributeType).toBe(AttributeEnumType.Actual)
    expect(secondResult.component.name).toBe(OCPP20ComponentName.OCPPCommCtrlr)
    expect(secondResult.variable.name).toBe(OCPP20OptionalVariableName.HeartbeatInterval)
    expect(secondResult.attributeStatusInfo).toBeUndefined()
  })

  // FR: B07.FR.02
  await it('Should handle SetVariables request with invalid variables/components', () => {
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
      svc.handleRequestSetVariables(mockChargingStation, request)

    expect(response.setVariableResult).toHaveLength(2)
    const firstResult = response.setVariableResult[0]
    expect(firstResult.attributeStatus).toBe(SetVariableStatusEnumType.UnknownVariable)
    expect(firstResult.attributeStatusInfo).toBeDefined()
    const secondResult = response.setVariableResult[1]
    expect(secondResult.attributeStatus).toBe(SetVariableStatusEnumType.UnknownComponent)
    expect(secondResult.attributeStatusInfo).toBeDefined()
  })

  // FR: B07.FR.03
  await it('Should handle SetVariables request with unsupported attribute type', () => {
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
      svc.handleRequestSetVariables(mockChargingStation, request)

    expect(response.setVariableResult).toHaveLength(1)
    const result = response.setVariableResult[0]
    expect(result.attributeStatus).toBe(SetVariableStatusEnumType.NotSupportedAttributeType)
    expect(result.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.UnsupportedParam)
  })

  // FR: B07.FR.04
  await it('Should reject AuthorizeRemoteStart under Connector component for write', () => {
    const request: OCPP20SetVariablesRequest = {
      setVariableData: [
        {
          attributeValue: 'true',
          component: {
            instance: TEST_CONNECTOR_VALID_INSTANCE,
            name: OCPP20ComponentName.Connector,
          },
          variable: { name: OCPP20RequiredVariableName.AuthorizeRemoteStart },
        },
      ],
    }
    const response: { setVariableResult: OCPP20SetVariableResultType[] } =
      svc.handleRequestSetVariables(mockChargingStation, request)
    expect(response.setVariableResult).toHaveLength(1)
    const result = response.setVariableResult[0]
    expect(result.attributeStatus).toBe(SetVariableStatusEnumType.UnknownComponent)
  })

  // FR: B07.FR.05
  await it('Should reject value exceeding max length at service level', () => {
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
      svc.handleRequestSetVariables(mockChargingStation, request)

    expect(response.setVariableResult).toHaveLength(1)
    const result = response.setVariableResult[0]
    expect(result.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
    expect(result.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.TooLargeElement)
  })

  // FR: B07.FR.07
  await it('Should handle mixed SetVariables request with multiple outcomes', () => {
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
      svc.handleRequestSetVariables(mockChargingStation, request)

    expect(response.setVariableResult).toHaveLength(5)
    const [accepted, unknownVariable, unsupportedAttrHeartbeat, unsupportedAttrWs, oversize] =
      response.setVariableResult
    expect(accepted.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
    expect(accepted.attributeStatusInfo).toBeUndefined()
    expect(unknownVariable.attributeStatus).toBe(SetVariableStatusEnumType.UnknownVariable)
    expect(unsupportedAttrHeartbeat.attributeStatus).toBe(
      SetVariableStatusEnumType.NotSupportedAttributeType
    )
    expect(unsupportedAttrWs.attributeStatus).toBe(
      SetVariableStatusEnumType.NotSupportedAttributeType
    )
    expect(oversize.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
    expect(oversize.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.TooLargeElement)
  })

  // FR: B07.FR.08
  await it('Should reject Target attribute for WebSocketPingInterval explicitly', () => {
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
      svc.handleRequestSetVariables(mockChargingStation, request)
    expect(response.setVariableResult).toHaveLength(1)
    const result = response.setVariableResult[0]
    expect(result.attributeStatus).toBe(SetVariableStatusEnumType.NotSupportedAttributeType)
    expect(result.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.UnsupportedParam)
  })

  // FR: B07.FR.09
  await it('Should reject immutable DateTime variable', () => {
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
      svc.handleRequestSetVariables(mockChargingStation, request)
    expect(response.setVariableResult).toHaveLength(1)
    const result = response.setVariableResult[0]
    expect(result.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
    expect(result.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.ReadOnly)
  })

  // FR: B07.FR.10
  await it('Should persist HeartbeatInterval and WebSocketPingInterval after setting', () => {
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
    svc.handleRequestSetVariables(mockChargingStation, setRequest)

    const getResponse: { getVariableResult: OCPP20GetVariableResultType[] } =
      svc.handleRequestGetVariables(mockChargingStation, {
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

    expect(getResponse.getVariableResult).toHaveLength(2)
    const hbResult = getResponse.getVariableResult[0]
    const wsResult = getResponse.getVariableResult[1]
    expect(hbResult.attributeStatus).toBeDefined()
    expect(hbResult.attributeValue).toBe(hbNew)
    expect(wsResult.attributeValue).toBe(wsNew)
  })

  // FR: B07.FR.11
  await it('Should revert non-persistent TxUpdatedInterval after runtime reset', async () => {
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
    svc.handleRequestSetVariables(mockChargingStation, setRequest)

    const getBefore: { getVariableResult: OCPP20GetVariableResultType[] } =
      svc.handleRequestGetVariables(mockChargingStation, {
        getVariableData: [
          {
            attributeType: AttributeEnumType.Actual,
            component: { name: OCPP20ComponentName.SampledDataCtrlr },
            variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
          },
        ],
      })
    expect(getBefore.getVariableResult[0].attributeValue).toBe(txValue)

    const { OCPP20VariableManager } =
      await import('../../../../src/charging-station/ocpp/2.0/OCPP20VariableManager.js')
    OCPP20VariableManager.getInstance().resetRuntimeOverrides()

    const getAfter: { getVariableResult: OCPP20GetVariableResultType[] } =
      svc.handleRequestGetVariables(mockChargingStation, {
        getVariableData: [
          {
            component: { name: OCPP20ComponentName.SampledDataCtrlr },
            variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
          },
        ],
      })
    expect(getAfter.getVariableResult[0].attributeValue).toBe('30') // default
  })

  // FR: B07.FR.12
  await it('Should reject all SetVariables when ItemsPerMessage limit exceeded', () => {
    setStrictLimits(mockChargingStation, 1, 10000)
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
      svc.handleRequestSetVariables(mockChargingStation, request)
    expect(response.setVariableResult).toHaveLength(2)
    response.setVariableResult.forEach(r => {
      expect(r.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(r.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.TooManyElements)
      expect(r.attributeStatusInfo?.additionalInfo).toMatch(/ItemsPerMessage limit 1 exceeded/)
    })
    resetLimits(mockChargingStation)
  })

  await it('Should reject all SetVariables when BytesPerMessage limit exceeded (pre-calculation)', () => {
    // Set strict bytes limit low enough for request pre-estimate to exceed
    setStrictLimits(mockChargingStation, 100, 10)
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
      svc.handleRequestSetVariables(mockChargingStation, request)
    expect(response.setVariableResult).toHaveLength(2)
    response.setVariableResult.forEach(r => {
      expect(r.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(r.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.TooLargeElement)
      expect(r.attributeStatusInfo?.additionalInfo).toMatch(/BytesPerMessage limit 10 exceeded/)
    })
    resetLimits(mockChargingStation)
  })

  await it('Should reject all SetVariables when BytesPerMessage limit exceeded (post-calculation)', () => {
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
      mockChargingStation,
      OCPP20RequiredVariableName.BytesPerMessage,
      postCalcLimit.toString(),
      false
    )
    expect(preEstimate).toBeLessThan(postCalcLimit)
    const response: { setVariableResult: OCPP20SetVariableResultType[] } =
      svc.handleRequestSetVariables(mockChargingStation, request)
    const actualSize = Buffer.byteLength(JSON.stringify(response.setVariableResult), 'utf8')
    expect(actualSize).toBeGreaterThan(postCalcLimit)
    expect(response.setVariableResult).toHaveLength(request.setVariableData.length)
    response.setVariableResult.forEach(r => {
      expect(r.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(r.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.TooLargeElement)
      expect(r.attributeStatusInfo?.additionalInfo).toMatch(
        new RegExp(`BytesPerMessage limit ${postCalcLimit.toString()} exceeded`)
      )
    })
    resetLimits(mockChargingStation)
  })

  // Effective ConfigurationValueSize / ValueSize propagation tests
  await it('Should enforce ConfigurationValueSize when ValueSize unset (service propagation)', () => {
    resetValueSizeLimits(mockChargingStation)
    setConfigurationValueSize(mockChargingStation, 100)
    upsertConfigurationKey(mockChargingStation, OCPP20RequiredVariableName.ValueSize, '')
    const prefix = 'wss://example.com/'
    const withinLimit = prefix + 'a'.repeat(100 - prefix.length)
    const overLimit = prefix + 'a'.repeat(100 - prefix.length + 1)
    let response = svc.handleRequestSetVariables(mockChargingStation, {
      setVariableData: [
        {
          attributeValue: withinLimit,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ],
    })
    expect(response.setVariableResult[0].attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
    response = svc.handleRequestSetVariables(mockChargingStation, {
      setVariableData: [
        {
          attributeValue: overLimit,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ],
    })
    const res = response.setVariableResult[0]
    expect(res.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
    expect(res.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.TooLargeElement)
    resetValueSizeLimits(mockChargingStation)
  })

  await it('Should enforce ValueSize when ConfigurationValueSize unset (service propagation)', () => {
    resetValueSizeLimits(mockChargingStation)
    upsertConfigurationKey(
      mockChargingStation,
      OCPP20RequiredVariableName.ConfigurationValueSize,
      ''
    )
    setValueSize(mockChargingStation, 120)
    const prefix = 'wss://example.com/'
    const withinLimit = prefix + 'b'.repeat(120 - prefix.length)
    const overLimit = prefix + 'b'.repeat(120 - prefix.length + 1)
    let response = svc.handleRequestSetVariables(mockChargingStation, {
      setVariableData: [
        {
          attributeValue: withinLimit,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ],
    })
    expect(response.setVariableResult[0].attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
    response = svc.handleRequestSetVariables(mockChargingStation, {
      setVariableData: [
        {
          attributeValue: overLimit,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ],
    })
    const res = response.setVariableResult[0]
    expect(res.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
    expect(res.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.TooLargeElement)
    resetValueSizeLimits(mockChargingStation)
  })

  await it('Should use smaller ValueSize when ValueSize < ConfigurationValueSize (service propagation)', () => {
    resetValueSizeLimits(mockChargingStation)
    setConfigurationValueSize(mockChargingStation, 400)
    setValueSize(mockChargingStation, 350)
    const prefix = 'wss://example.com/'
    const withinLimit = prefix + 'c'.repeat(350 - prefix.length)
    const overLimit = prefix + 'c'.repeat(350 - prefix.length + 1)
    let response = svc.handleRequestSetVariables(mockChargingStation, {
      setVariableData: [
        {
          attributeValue: withinLimit,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ],
    })
    expect(response.setVariableResult[0].attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
    response = svc.handleRequestSetVariables(mockChargingStation, {
      setVariableData: [
        {
          attributeValue: overLimit,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ],
    })
    const res = response.setVariableResult[0]
    expect(res.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
    expect(res.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.TooLargeElement)
    resetValueSizeLimits(mockChargingStation)
  })

  await it('Should use smaller ConfigurationValueSize when ConfigurationValueSize < ValueSize (service propagation)', () => {
    resetValueSizeLimits(mockChargingStation)
    setConfigurationValueSize(mockChargingStation, 260)
    setValueSize(mockChargingStation, 500)
    const prefix = 'wss://example.com/'
    const withinLimit = prefix + 'd'.repeat(260 - prefix.length)
    const overLimit = prefix + 'd'.repeat(260 - prefix.length + 1)
    let response = svc.handleRequestSetVariables(mockChargingStation, {
      setVariableData: [
        {
          attributeValue: withinLimit,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ],
    })
    expect(response.setVariableResult[0].attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
    response = svc.handleRequestSetVariables(mockChargingStation, {
      setVariableData: [
        {
          attributeValue: overLimit,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ],
    })
    const res = response.setVariableResult[0]
    expect(res.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
    expect(res.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.TooLargeElement)
    resetValueSizeLimits(mockChargingStation)
  })

  await it('Should fallback to default absolute max length when both limits invalid/non-positive', () => {
    resetValueSizeLimits(mockChargingStation)
    setConfigurationValueSize(mockChargingStation, 0)
    setValueSize(mockChargingStation, -5)
    const prefix = 'wss://example.com/'
    const validValue = prefix + 'e'.repeat(300 - prefix.length) // 300 < default absolute max length and < ConnectionUrl maxLength
    const response = svc.handleRequestSetVariables(mockChargingStation, {
      setVariableData: [
        {
          attributeValue: validValue,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ],
    })
    const res = response.setVariableResult[0]
    expect(res.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
    expect(res.attributeStatusInfo).toBeUndefined()
    resetValueSizeLimits(mockChargingStation)
  })

  // FR: B07.FR.12 (updated behavior: ConnectionUrl now readable after set)
  await it('Should allow ConnectionUrl read-back after setting', () => {
    resetLimits(mockChargingStation)
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
    svc.handleRequestSetVariables(mockChargingStation, setRequest)
    const getResponse: { getVariableResult: OCPP20GetVariableResultType[] } =
      svc.handleRequestGetVariables(mockChargingStation, {
        getVariableData: [
          {
            attributeType: AttributeEnumType.Actual,
            component: { name: OCPP20ComponentName.ChargingStation },
            variable: { name: OCPP20VendorVariableName.ConnectionUrl },
          },
        ],
      })
    expect(getResponse.getVariableResult).toHaveLength(1)
    const result = getResponse.getVariableResult[0]
    expect(result.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
    expect(result.attributeValue).toBe(url)
    expect(result.attributeStatusInfo).toBeUndefined()
    resetLimits(mockChargingStation)
  })

  await it('Should accept ConnectionUrl with custom mqtt scheme (no scheme restriction)', () => {
    resetLimits(mockChargingStation)
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
      svc.handleRequestSetVariables(mockChargingStation, setRequest)
    expect(response.setVariableResult).toHaveLength(1)
    const setResult = response.setVariableResult[0]
    expect(setResult.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
    expect(setResult.attributeStatusInfo).toBeUndefined()
    const getResponse: { getVariableResult: OCPP20GetVariableResultType[] } =
      svc.handleRequestGetVariables(mockChargingStation, {
        getVariableData: [
          {
            attributeType: AttributeEnumType.Actual,
            component: { name: OCPP20ComponentName.ChargingStation },
            variable: { name: OCPP20VendorVariableName.ConnectionUrl },
          },
        ],
      })
    expect(getResponse.getVariableResult).toHaveLength(1)
    const getResult = getResponse.getVariableResult[0]
    expect(getResult.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
    expect(getResult.attributeValue).toBe(url)
    expect(getResult.attributeStatusInfo).toBeUndefined()
    resetLimits(mockChargingStation)
  })
})
