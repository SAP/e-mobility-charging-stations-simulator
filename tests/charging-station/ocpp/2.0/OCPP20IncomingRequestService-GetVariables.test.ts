/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  AttributeEnumType,
  GetVariableStatusEnumType,
  OCPP20ComponentName,
  OCPP20ConnectorStatusEnumType,
  type OCPP20GetVariablesRequest,
  OCPP20OptionalVariableName,
  OCPP20RequiredVariableName,
} from '../../../../src/types/index.js'

await describe('OCPP20IncomingRequestService GetVariables integration tests', async () => {
  // Mock ChargingStation with comprehensive properties
  const mockChargingStation = {
    connectors: new Map([
      [1, { status: OCPP20ConnectorStatusEnumType.Available }],
      [2, { status: OCPP20ConnectorStatusEnumType.Available }],
    ]),
    evses: new Map([
      [1, { connectors: new Map([[1, {}]]) }],
      [2, { connectors: new Map([[1, {}]]) }],
    ]),
    getHeartbeatInterval: () => 60,
    hasEvses: true,
    logPrefix: () => 'CS-TEST-001',
    ocppConfiguration: {
      configurationKey: [
        { key: OCPP20OptionalVariableName.WebSocketPingInterval, value: '30' },
        { key: OCPP20OptionalVariableName.HeartbeatInterval, value: '60' },
      ],
    },
    stationInfo: {
      heartbeatInterval: 60,
      ocppStrictCompliance: false,
    },
  } as unknown as ChargingStation

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
    expect(firstResult.attributeValue).toBe('60')
    expect(firstResult.component.name).toBe(OCPP20ComponentName.ChargingStation)
    expect(firstResult.variable.name).toBe(OCPP20OptionalVariableName.HeartbeatInterval)

    // Check second variable (WebSocketPingInterval)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const secondResult = response.getVariableResult[1]
    expect(secondResult.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
    expect(secondResult.attributeValue).toBe('30')
    expect(secondResult.component.name).toBe(OCPP20ComponentName.ChargingStation)
    expect(secondResult.variable.name).toBe(OCPP20OptionalVariableName.WebSocketPingInterval)
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

    // Check second variable (should be UnknownComponent)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const secondResult = response.getVariableResult[1]
    expect(secondResult.attributeStatus).toBe(GetVariableStatusEnumType.UnknownComponent)
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
            instance: '1',
            name: OCPP20ComponentName.Connector,
          },
          variable: { name: OCPP20RequiredVariableName.AuthorizeRemoteStart },
        },
        {
          component: {
            instance: '999', // Non-existent connector
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
    expect(firstResult.component.instance).toBe('1')

    // Check invalid connector
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const secondResult = response.getVariableResult[1]
    expect(secondResult.attributeStatus).toBe(GetVariableStatusEnumType.UnknownComponent)
    expect(secondResult.component.instance).toBe('999')
  })
})
