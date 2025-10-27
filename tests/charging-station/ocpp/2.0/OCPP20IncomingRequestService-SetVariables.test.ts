import { expect } from '@std/expect'
import { millisecondsToSeconds } from 'date-fns'
import { describe, it } from 'node:test'

import { addConfigurationKey } from '../../../../src/charging-station/ConfigurationKeyUtils.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  AttributeEnumType,
  OCPP20ComponentName,
  type OCPP20GetVariableDataType,
  type OCPP20GetVariableResultType,
  OCPP20OptionalVariableName,
  OCPP20RequiredVariableName,
  type OCPP20SetVariableResultType,
  type OCPP20SetVariablesRequest,
  OCPP20VendorVariableName,
  ReasonCodeEnumType,
  SetVariableStatusEnumType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { createChargingStationWithEvses } from '../../../ChargingStationFactory.js'
import {
  TEST_CHARGING_STATION_NAME,
  TEST_CONNECTOR_INVALID_INSTANCE,
  TEST_CONNECTOR_VALID_INSTANCE,
} from './OCPP20TestConstants.js'

interface IncomingRequestServicePrivate {
  handleRequestGetVariables: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chargingStation: any,
    request: OCPP20GetVariablesRequest
  ) => { getVariableResult: OCPP20GetVariableResultType[] }
  handleRequestSetVariables: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chargingStation: any,
    request: OCPP20SetVariablesRequest
  ) => { setVariableResult: OCPP20SetVariableResultType[] }
}

interface OCPP20GetVariablesRequest {
  getVariableData: OCPP20GetVariableDataType[]
}

/* eslint-disable @typescript-eslint/no-floating-promises */
describe('B07 - Set Variables', () => {
  const mockChargingStation = createChargingStationWithEvses({
    baseName: TEST_CHARGING_STATION_NAME,
    heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
    stationInfo: {
      ocppStrictCompliance: false,
    },
    websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
  })

  const incomingRequestService = new OCPP20IncomingRequestService()
  const svc = incomingRequestService as unknown as IncomingRequestServicePrivate

  // FR: B07.FR.01
  it('Should handle SetVariables request with valid writable variables', () => {
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
          component: { name: OCPP20ComponentName.ChargingStation },
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
    expect(secondResult.component.name).toBe(OCPP20ComponentName.ChargingStation)
    expect(secondResult.variable.name).toBe(OCPP20OptionalVariableName.HeartbeatInterval)
    expect(secondResult.attributeStatusInfo).toBeUndefined()
  })

  // FR: B07.FR.02
  it('Should handle SetVariables request with invalid variables/components', () => {
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
  it('Should handle SetVariables request with unsupported attribute type', () => {
    const request: OCPP20SetVariablesRequest = {
      setVariableData: [
        {
          attributeType: AttributeEnumType.Target, // Not supported for HeartbeatInterval
          attributeValue: '30',
          component: { name: OCPP20ComponentName.ChargingStation },
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
  it('Should handle SetVariables request with Connector components (valid & invalid)', () => {
    const request: OCPP20SetVariablesRequest = {
      setVariableData: [
        {
          attributeValue: '1',
          component: {
            instance: TEST_CONNECTOR_VALID_INSTANCE,
            name: OCPP20ComponentName.Connector,
          },
          variable: { name: OCPP20RequiredVariableName.AuthorizeRemoteStart },
        },
        {
          attributeValue: '1',
          component: {
            instance: TEST_CONNECTOR_INVALID_INSTANCE,
            name: OCPP20ComponentName.Connector,
          },
          variable: { name: OCPP20RequiredVariableName.AuthorizeRemoteStart },
        },
      ],
    }

    const response: { setVariableResult: OCPP20SetVariableResultType[] } =
      svc.handleRequestSetVariables(mockChargingStation, request)

    expect(response.setVariableResult).toHaveLength(2)
    const firstResult = response.setVariableResult[0]
    expect(firstResult.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
    const secondResult = response.setVariableResult[1]
    expect(secondResult.attributeStatus).toBe(SetVariableStatusEnumType.UnknownComponent)
  })

  // FR: B07.FR.05
  it('Should reject value exceeding max length at service level', () => {
    const longValue = 'x'.repeat(1001)
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
    expect(result.attributeStatusInfo?.reasonCode).toBe(
      ReasonCodeEnumType.PropertyConstraintViolation
    )
  })

  // FR: B07.FR.06
  it('Should flag reboot required when setting a reboot flagged configuration key', () => {
    addConfigurationKey(
      mockChargingStation,
      OCPP20RequiredVariableName.MessageTimeout as unknown as string,
      mockChargingStation.getConnectionTimeout().toString(),
      { reboot: true }
    )

    const newValue = (mockChargingStation.getConnectionTimeout() + 5).toString()
    const request: OCPP20SetVariablesRequest = {
      setVariableData: [
        {
          attributeType: AttributeEnumType.Actual,
          attributeValue: newValue,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.MessageTimeout },
        },
      ],
    }

    const response: { setVariableResult: OCPP20SetVariableResultType[] } =
      svc.handleRequestSetVariables(mockChargingStation, request)

    expect(response.setVariableResult).toHaveLength(1)
    const result = response.setVariableResult[0]
    expect(result.attributeStatus).toBe(SetVariableStatusEnumType.RebootRequired)
    expect(result.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.ChangeRequiresReboot)
  })

  // FR: B07.FR.07
  it('Should handle mixed SetVariables request with multiple outcomes', () => {
    const longValue = 'y'.repeat(1001)
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
          component: { name: OCPP20ComponentName.ChargingStation },
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
  })

  // FR: B07.FR.08
  it('Should reject Target attribute for WebSocketPingInterval explicitly', () => {
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
  it('Should reject immutable DateTime variable', () => {
    const request: OCPP20SetVariablesRequest = {
      setVariableData: [
        {
          attributeType: AttributeEnumType.Actual,
          attributeValue: new Date(Date.now() + 1000).toISOString(),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.DateTime },
        },
      ],
    }
    const response: { setVariableResult: OCPP20SetVariableResultType[] } =
      svc.handleRequestSetVariables(mockChargingStation, request)
    expect(response.setVariableResult).toHaveLength(1)
    const result = response.setVariableResult[0]
    expect(result.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
    expect(result.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.ImmutableVariable)
  })

  // FR: B07.FR.10
  it('Should persist HeartbeatInterval and WebSocketPingInterval after setting', () => {
    const hbNew = (millisecondsToSeconds(Constants.DEFAULT_HEARTBEAT_INTERVAL) + 20).toString()
    const wsNew = (Constants.DEFAULT_WEBSOCKET_PING_INTERVAL + 20).toString()
    const setRequest: OCPP20SetVariablesRequest = {
      setVariableData: [
        {
          attributeValue: hbNew,
          component: { name: OCPP20ComponentName.ChargingStation },
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
            component: { name: OCPP20ComponentName.ChargingStation },
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
  it('Should revert non-persistent TxUpdatedInterval after runtime reset', async () => {
    const txValue = '77'
    const setRequest: OCPP20SetVariablesRequest = {
      setVariableData: [
        {
          attributeValue: txValue,
          component: { name: OCPP20ComponentName.ChargingStation },
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
            component: { name: OCPP20ComponentName.ChargingStation },
            variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
          },
        ],
      })
    expect(getBefore.getVariableResult[0].attributeValue).toBe(txValue)

    const { OCPP20VariableManager } = await import(
      '../../../../src/charging-station/ocpp/2.0/OCPP20VariableManager.js'
    )
    OCPP20VariableManager.getInstance().resetRuntimeOverrides()

    const getAfter: { getVariableResult: OCPP20GetVariableResultType[] } =
      svc.handleRequestGetVariables(mockChargingStation, {
        getVariableData: [
          {
            component: { name: OCPP20ComponentName.ChargingStation },
            variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
          },
        ],
      })
    expect(getAfter.getVariableResult[0].attributeValue).toBe('30') // default
  })

  // FR: B07.FR.12
  it('Should enforce ConnectionUrl write-only on GetVariables', () => {
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
    expect(result.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.UnsupportedParam)
  })
})
