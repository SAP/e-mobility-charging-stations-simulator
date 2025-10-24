/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { expect } from '@std/expect'
import { millisecondsToSeconds } from 'date-fns'
import { describe, it } from 'node:test'

import { OCPP20VariableManager } from '../../../../src/charging-station/ocpp/2.0/OCPP20VariableManager.js'
import {
  AttributeEnumType,
  type ComponentType,
  GetVariableStatusEnumType,
  OCPP20ComponentName,
  type OCPP20GetVariableDataType,
  OCPP20OptionalVariableName,
  OCPP20RequiredVariableName,
  ReasonCodeEnumType,
  type VariableType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { createChargingStationWithEvses } from '../../../ChargingStationFactory.js'
import { TEST_CHARGING_STATION_NAME } from './OCPP20TestConstants.js'

await describe('OCPP20VariableManager test suite', async () => {
  // Create mock ChargingStation with EVSEs for OCPP 2.0 testing
  const mockChargingStation = createChargingStationWithEvses({
    baseName: TEST_CHARGING_STATION_NAME,
    heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
    websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
  })

  await it('Verify that OCPP20VariableManager can be instantiated as singleton', () => {
    const manager1 = OCPP20VariableManager.getInstance()
    const manager2 = OCPP20VariableManager.getInstance()

    expect(manager1).toBeDefined()
    expect(manager1).toBe(manager2) // Same instance (singleton)
  })

  await describe('getVariables method tests', async () => {
    const manager = OCPP20VariableManager.getInstance()

    await it('Should handle valid ChargingStation component requests', () => {
      const request: OCPP20GetVariableDataType[] = [
        {
          attributeType: AttributeEnumType.Actual,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
        {
          attributeType: AttributeEnumType.Actual,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.EVConnectionTimeOut },
        },
      ]

      const result = manager.getVariables(mockChargingStation, request)

      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(2)
      // First variable: HeartbeatInterval
      expect(result[0].attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
      expect(result[0].attributeType).toBe(AttributeEnumType.Actual)
      expect(result[0].attributeValue).toBe(
        millisecondsToSeconds(Constants.DEFAULT_HEARTBEAT_INTERVAL).toString()
      )
      expect(result[0].component.name).toBe(OCPP20ComponentName.ChargingStation)
      expect(result[0].variable.name).toBe(OCPP20OptionalVariableName.HeartbeatInterval)
      expect(result[0].attributeStatusInfo).toBeUndefined()
      // Second variable: EVConnectionTimeOut
      expect(result[1].attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
      expect(result[1].attributeType).toBe(AttributeEnumType.Actual)
      expect(result[1].attributeValue).toBe(Constants.DEFAULT_EV_CONNECTION_TIMEOUT.toString())
      expect(result[1].component.name).toBe(OCPP20ComponentName.ChargingStation)
      expect(result[1].variable.name).toBe(OCPP20RequiredVariableName.EVConnectionTimeOut)
      expect(result[1].attributeStatusInfo).toBeUndefined()
    })

    await it('Should handle valid Connector component requests', () => {
      const request: OCPP20GetVariableDataType[] = [
        {
          component: {
            instance: '1',
            name: OCPP20ComponentName.Connector,
          },
          variable: { name: OCPP20RequiredVariableName.AuthorizeRemoteStart },
        },
      ]

      const result = manager.getVariables(mockChargingStation, request)

      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(1)
      expect(result[0].attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
      expect(result[0].attributeType).toBeUndefined()
      expect(result[0].attributeValue).toBe('')
      expect(result[0].component.name).toBe(OCPP20ComponentName.Connector)
      expect(result[0].component.instance).toBe('1')
      expect(result[0].variable.name).toBe(OCPP20RequiredVariableName.AuthorizeRemoteStart)
      expect(result[0].attributeStatusInfo).toBeUndefined()
    })

    await it('Should handle invalid component gracefully', () => {
      const request: OCPP20GetVariableDataType[] = [
        {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
          component: { name: 'InvalidComponent' as any },
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
          variable: { name: 'SomeVariable' as any },
        },
      ]

      const result = manager.getVariables(mockChargingStation, request)

      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(1)
      expect(result[0].attributeStatus).toBe(GetVariableStatusEnumType.UnknownComponent)
      expect(result[0].attributeType).toBeUndefined()
      expect(result[0].attributeValue).toBeUndefined()
      expect(result[0].component.name).toBe('InvalidComponent')
      expect(result[0].variable.name).toBe('SomeVariable')
      expect(result[0].attributeStatusInfo).toBeDefined()
      expect(result[0].attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.NotFound)
      expect(result[0].attributeStatusInfo?.additionalInfo).toContain(
        'Component InvalidComponent is not supported'
      )
    })

    await it('Should handle invalid variable gracefully', () => {
      const request: OCPP20GetVariableDataType[] = [
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
          variable: { name: 'InvalidVariable' as any },
        },
      ]

      const result = manager.getVariables(mockChargingStation, request)

      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(1)
      expect(result[0].attributeStatus).toBe(GetVariableStatusEnumType.UnknownVariable)
      expect(result[0].attributeType).toBeUndefined()
      expect(result[0].attributeValue).toBeUndefined()
      expect(result[0].component.name).toBe(OCPP20ComponentName.ChargingStation)
      expect(result[0].variable.name).toBe('InvalidVariable')
      expect(result[0].attributeStatusInfo).toBeDefined()
      expect(result[0].attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.NotFound)
      expect(result[0].attributeStatusInfo?.additionalInfo).toContain(
        'Variable InvalidVariable is not supported'
      )
    })

    await it('Should handle unsupported attribute type gracefully', () => {
      const request: OCPP20GetVariableDataType[] = [
        {
          attributeType: AttributeEnumType.Target, // Not supported for this variable
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ]

      const result = manager.getVariables(mockChargingStation, request)

      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(1)
      expect(result[0].attributeStatus).toBe(GetVariableStatusEnumType.NotSupportedAttributeType)
      expect(result[0].attributeType).toBe(AttributeEnumType.Target)
      expect(result[0].attributeValue).toBeUndefined()
      expect(result[0].component.name).toBe(OCPP20ComponentName.ChargingStation)
      expect(result[0].variable.name).toBe(OCPP20OptionalVariableName.HeartbeatInterval)
      expect(result[0].attributeStatusInfo).toBeDefined()
      expect(result[0].attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.UnsupportedParam)
      expect(result[0].attributeStatusInfo?.additionalInfo).toContain(
        'Attribute type Target is not supported'
      )
    })

    await it('Should handle non-existent connector instance', () => {
      const request: OCPP20GetVariableDataType[] = [
        {
          component: {
            instance: '999', // Non-existent connector
            name: OCPP20ComponentName.Connector,
          },
          variable: { name: OCPP20RequiredVariableName.AuthorizeRemoteStart },
        },
      ]

      const result = manager.getVariables(mockChargingStation, request)

      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(1)
      expect(result[0].attributeStatus).toBe(GetVariableStatusEnumType.UnknownComponent)
      expect(result[0].attributeType).toBeUndefined()
      expect(result[0].attributeValue).toBeUndefined()
      expect(result[0].component.name).toBe(OCPP20ComponentName.Connector)
      expect(result[0].component.instance).toBe('999')
      expect(result[0].variable.name).toBe(OCPP20RequiredVariableName.AuthorizeRemoteStart)
      expect(result[0].attributeStatusInfo).toBeDefined()
      expect(result[0].attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.NotFound)
      expect(result[0].attributeStatusInfo?.additionalInfo).toContain(
        'Component Connector is not supported'
      )
    })

    await it('Should handle multiple variables in single request', () => {
      const request: OCPP20GetVariableDataType[] = [
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
        {
          attributeType: AttributeEnumType.Actual,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.MessageTimeout },
        },
      ]

      const result = manager.getVariables(mockChargingStation, request)

      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(3)
      // First variable: HeartbeatInterval
      expect(result[0].attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
      expect(result[0].attributeType).toBeUndefined()
      expect(result[0].attributeValue).toBe(
        millisecondsToSeconds(Constants.DEFAULT_HEARTBEAT_INTERVAL).toString()
      )
      expect(result[0].component.name).toBe(OCPP20ComponentName.ChargingStation)
      expect(result[0].variable.name).toBe(OCPP20OptionalVariableName.HeartbeatInterval)
      expect(result[0].attributeStatusInfo).toBeUndefined()
      // Second variable: WebSocketPingInterval
      expect(result[1].attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
      expect(result[1].attributeType).toBeUndefined()
      expect(result[1].attributeValue).toBe(Constants.DEFAULT_WEBSOCKET_PING_INTERVAL.toString())
      expect(result[1].component.name).toBe(OCPP20ComponentName.ChargingStation)
      expect(result[1].variable.name).toBe(OCPP20OptionalVariableName.WebSocketPingInterval)
      expect(result[1].attributeStatusInfo).toBeUndefined()
      // Third variable: MessageTimeout
      expect(result[2].attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
      expect(result[2].attributeType).toBe(AttributeEnumType.Actual)
      expect(result[2].attributeValue).toBe(mockChargingStation.getConnectionTimeout().toString())
      expect(result[2].component.name).toBe(OCPP20ComponentName.ChargingStation)
      expect(result[2].variable.name).toBe(OCPP20RequiredVariableName.MessageTimeout)
      expect(result[2].attributeStatusInfo).toBeUndefined()
    })

    await it('Should handle EVSE component when supported', () => {
      const request: OCPP20GetVariableDataType[] = [
        {
          component: {
            instance: '1',
            name: OCPP20ComponentName.EVSE,
          },
          variable: { name: OCPP20RequiredVariableName.AuthorizeRemoteStart },
        },
      ]

      const result = manager.getVariables(mockChargingStation, request)

      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(1)
      // Should be accepted since mockChargingStation has EVSEs
      expect(result[0].attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
      expect(result[0].attributeType).toBeUndefined()
      expect(result[0].attributeValue).toBe('')
      expect(result[0].component.name).toBe(OCPP20ComponentName.EVSE)
      expect(result[0].component.instance).toBe('1')
      expect(result[0].variable.name).toBe(OCPP20RequiredVariableName.AuthorizeRemoteStart)
      expect(result[0].attributeStatusInfo).toBeUndefined()
    })
  })

  await describe('Component validation tests', async () => {
    const manager = OCPP20VariableManager.getInstance()

    await it('Should validate ChargingStation component as always valid', () => {
      const component: ComponentType = { name: OCPP20ComponentName.ChargingStation }

      // Access private method through any casting for testing
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
      const isValid = (manager as any).isComponentValid(mockChargingStation, component)
      expect(isValid).toBe(true)
    })

    await it('Should validate Connector component when connectors exist', () => {
      const component: ComponentType = { instance: '1', name: OCPP20ComponentName.Connector }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
      const isValid = (manager as any).isComponentValid(mockChargingStation, component)
      expect(isValid).toBe(true)
    })

    await it('Should reject invalid connector instance', () => {
      const component: ComponentType = { instance: '999', name: OCPP20ComponentName.Connector }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
      const isValid = (manager as any).isComponentValid(mockChargingStation, component)
      expect(isValid).toBe(false)
    })
  })

  await describe('Variable support validation tests', async () => {
    const manager = OCPP20VariableManager.getInstance()

    await it('Should support standard HeartbeatInterval variable', () => {
      const component: ComponentType = { name: OCPP20ComponentName.ChargingStation }
      const variable: VariableType = { name: OCPP20OptionalVariableName.HeartbeatInterval }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
      const isSupported = (manager as any).isVariableSupported(
        mockChargingStation,
        component,
        variable
      )
      expect(isSupported).toBe(true)
    })

    await it('Should support known OCPP variables', () => {
      const component: ComponentType = { name: OCPP20ComponentName.ChargingStation }
      const variable: VariableType = { name: OCPP20OptionalVariableName.WebSocketPingInterval }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
      const isSupported = (manager as any).isVariableSupported(
        mockChargingStation,
        component,
        variable
      )
      expect(isSupported).toBe(true)
    })

    await it('Should reject unknown variables', () => {
      const component: ComponentType = { name: OCPP20ComponentName.ChargingStation }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      const variable: VariableType = { name: 'UnknownVariable' as any }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
      const isSupported = (manager as any).isVariableSupported(
        mockChargingStation,
        component,
        variable
      )
      expect(isSupported).toBe(false)
    })
  })

  await describe('Attribute type validation tests', async () => {
    const manager = OCPP20VariableManager.getInstance()

    await it('Should support Actual attribute by default', () => {
      const variable: VariableType = { name: OCPP20OptionalVariableName.HeartbeatInterval }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
      const isSupported = (manager as any).isAttributeTypeSupported(
        variable,
        AttributeEnumType.Actual
      )
      expect(isSupported).toBe(true)
    })

    await it('Should reject unsupported attribute types for most variables', () => {
      const variable: VariableType = { name: OCPP20OptionalVariableName.HeartbeatInterval }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
      const isSupported = (manager as any).isAttributeTypeSupported(
        variable,
        AttributeEnumType.Target
      )
      expect(isSupported).toBe(false)
    })
  })
})
