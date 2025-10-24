/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { expect } from '@std/expect'
import { millisecondsToSeconds } from 'date-fns'
import { describe, it } from 'node:test'

import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  AttributeEnumType,
  GetVariableStatusEnumType,
  OCPP20ComponentName,
  type OCPP20GetVariablesRequest,
  OCPP20OptionalVariableName,
  OCPP20RequiredVariableName,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { createChargingStationWithEvses } from '../../../ChargingStationFactory.js'
import {
  TEST_CHARGING_STATION_NAME,
  TEST_CONNECTOR_INVALID_INSTANCE,
  TEST_CONNECTOR_VALID_INSTANCE,
} from './OCPP20TestConstants.js'

await describe('OCPP20IncomingRequestService GetVariables integration tests', async () => {
  const mockChargingStation = createChargingStationWithEvses({
    baseName: TEST_CHARGING_STATION_NAME,
    heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
    stationInfo: {
      ocppStrictCompliance: false,
    },
    websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
  })

  const incomingRequestService = new OCPP20IncomingRequestService()

  await it('Should handle GetVariables request with valid variables', async () => {
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          attributeType: AttributeEnumType.Actual,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
      ],
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
    const response = await (incomingRequestService as any).handleRequestGetVariables(
      mockChargingStation,
      request
    )

    expect(response).toBeDefined()
    expect(response.getVariableResult).toBeDefined()
    expect(Array.isArray(response.getVariableResult)).toBe(true)
    expect(response.getVariableResult).toHaveLength(2)

    // Check first variable (HeartbeatInterval)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const firstResult = response.getVariableResult[0]
    expect(firstResult.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
    expect(firstResult.attributeType).toBe(AttributeEnumType.Actual)
    expect(firstResult.attributeValue).toBe(
      millisecondsToSeconds(Constants.DEFAULT_HEARTBEAT_INTERVAL).toString()
    )
    expect(firstResult.component.name).toBe(OCPP20ComponentName.ChargingStation)
    expect(firstResult.variable.name).toBe(OCPP20OptionalVariableName.HeartbeatInterval)
    expect(firstResult.attributeStatusInfo).toBeUndefined()

    // Check second variable (WebSocketPingInterval)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const secondResult = response.getVariableResult[1]
    expect(secondResult.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
    expect(secondResult.attributeType).toBeUndefined()
    expect(secondResult.attributeValue).toBe(Constants.DEFAULT_WEBSOCKET_PING_INTERVAL.toString())
    expect(secondResult.component.name).toBe(OCPP20ComponentName.ChargingStation)
    expect(secondResult.variable.name).toBe(OCPP20OptionalVariableName.WebSocketPingInterval)
    expect(secondResult.attributeStatusInfo).toBeUndefined()
  })

  await it('Should handle GetVariables request with invalid variables', async () => {
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
          variable: { name: 'InvalidVariable' as any },
        },
        {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
          component: { name: 'InvalidComponent' as any },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ],
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
    const response = await (incomingRequestService as any).handleRequestGetVariables(
      mockChargingStation,
      request
    )

    expect(response).toBeDefined()
    expect(response.getVariableResult).toBeDefined()
    expect(Array.isArray(response.getVariableResult)).toBe(true)
    expect(response.getVariableResult).toHaveLength(2)

    // Check first variable (should be UnknownVariable)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const firstResult = response.getVariableResult[0]
    expect(firstResult.attributeStatus).toBe(GetVariableStatusEnumType.UnknownVariable)
    expect(firstResult.attributeType).toBeUndefined()
    expect(firstResult.attributeValue).toBeUndefined()
    expect(firstResult.component.name).toBe(OCPP20ComponentName.ChargingStation)
    expect(firstResult.variable.name).toBe('InvalidVariable')
    expect(firstResult.attributeStatusInfo).toBeDefined()

    // Check second variable (should be UnknownComponent)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const secondResult = response.getVariableResult[1]
    expect(secondResult.attributeStatus).toBe(GetVariableStatusEnumType.UnknownComponent)
    expect(secondResult.attributeType).toBeUndefined()
    expect(secondResult.attributeValue).toBeUndefined()
    expect(secondResult.component.name).toBe('InvalidComponent')
    expect(secondResult.variable.name).toBe(OCPP20OptionalVariableName.HeartbeatInterval)
    expect(secondResult.attributeStatusInfo).toBeDefined()
  })

  await it('Should handle GetVariables request with unsupported attribute types', async () => {
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          attributeType: AttributeEnumType.Target, // Not supported for HeartbeatInterval
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ],
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
    const response = await (incomingRequestService as any).handleRequestGetVariables(
      mockChargingStation,
      request
    )

    expect(response).toBeDefined()
    expect(response.getVariableResult).toBeDefined()
    expect(Array.isArray(response.getVariableResult)).toBe(true)
    expect(response.getVariableResult).toHaveLength(1)

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = response.getVariableResult[0]
    expect(result.attributeStatus).toBe(GetVariableStatusEnumType.NotSupportedAttributeType)
  })

  await it('Should handle GetVariables request with Connector components', async () => {
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          component: {
            instance: TEST_CONNECTOR_VALID_INSTANCE,
            name: OCPP20ComponentName.Connector,
          },
          variable: { name: OCPP20RequiredVariableName.AuthorizeRemoteStart },
        },
        {
          component: {
            instance: TEST_CONNECTOR_INVALID_INSTANCE, // Non-existent connector
            name: OCPP20ComponentName.Connector,
          },
          variable: { name: OCPP20RequiredVariableName.AuthorizeRemoteStart },
        },
      ],
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
    const response = await (incomingRequestService as any).handleRequestGetVariables(
      mockChargingStation,
      request
    )

    expect(response).toBeDefined()
    expect(response.getVariableResult).toBeDefined()
    expect(Array.isArray(response.getVariableResult)).toBe(true)
    expect(response.getVariableResult).toHaveLength(2)

    // Check valid connector
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const firstResult = response.getVariableResult[0]
    expect(firstResult.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
    expect(firstResult.component.name).toBe(OCPP20ComponentName.Connector)
    expect(firstResult.component.instance).toBe(TEST_CONNECTOR_VALID_INSTANCE)

    // Check invalid connector
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const secondResult = response.getVariableResult[1]
    expect(secondResult.attributeStatus).toBe(GetVariableStatusEnumType.UnknownComponent)
    expect(secondResult.component.instance).toBe(TEST_CONNECTOR_INVALID_INSTANCE)
  })
})
