/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { expect } from '@std/expect'
import { millisecondsToSeconds } from 'date-fns'
import { describe, it } from 'node:test'

import {
  addConfigurationKey,
  deleteConfigurationKey,
  getConfigurationKey,
} from '../../../../src/charging-station/ConfigurationKeyUtils.js'
import { OCPP20VariableManager } from '../../../../src/charging-station/ocpp/2.0/OCPP20VariableManager.js'
import {
  AttributeEnumType,
  type ComponentType,
  GetVariableStatusEnumType,
  OCPP20ComponentName,
  type OCPP20GetVariableDataType,
  OCPP20OptionalVariableName,
  OCPP20RequiredVariableName,
  type OCPP20SetVariableDataType,
  OCPP20VendorVariableName,
  ReasonCodeEnumType,
  SetVariableStatusEnumType,
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

    await it('Should accept default true value for AuthorizeRemoteStart (AuthCtrlr)', () => {
      const manager = OCPP20VariableManager.getInstance()
      const request: OCPP20GetVariableDataType[] = [
        {
          component: { name: OCPP20ComponentName.AuthCtrlr },
          variable: { name: OCPP20RequiredVariableName.AuthorizeRemoteStart },
        },
      ]
      const result = manager.getVariables(mockChargingStation, request)
      expect(result).toHaveLength(1)
      expect(result[0].attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
      expect(result[0].attributeValue).toBe('true')
      expect(result[0].component.name).toBe(OCPP20ComponentName.AuthCtrlr)
    })

    await it('Should accept setting and getting AuthorizeRemoteStart = true (AuthCtrlr)', () => {
      const setRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: 'true',
          component: { name: OCPP20ComponentName.AuthCtrlr },
          variable: { name: OCPP20RequiredVariableName.AuthorizeRemoteStart },
        },
      ])[0]
      expect(setRes.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      const getRes = manager.getVariables(mockChargingStation, [
        {
          component: { name: OCPP20ComponentName.AuthCtrlr },
          variable: { name: OCPP20RequiredVariableName.AuthorizeRemoteStart },
        },
      ])[0]
      expect(getRes.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
      expect(getRes.attributeValue).toBe('true')
    })

    await it('Should reject invalid values for AuthorizeRemoteStart (AuthCtrlr)', () => {
      const invalidValues = ['', '1', 'TRUE', 'False', 'yes']
      for (const val of invalidValues) {
        const res = manager.setVariables(mockChargingStation, [
          {
            attributeValue: val,
            component: { name: OCPP20ComponentName.AuthCtrlr },
            variable: { name: OCPP20RequiredVariableName.AuthorizeRemoteStart },
          },
        ])[0]
        expect(res.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
        expect(res.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.InvalidValue)
      }
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

    await it('Should reject Target attribute for WebSocketPingInterval', () => {
      const request: OCPP20GetVariableDataType[] = [
        {
          attributeType: AttributeEnumType.Target,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
      ]
      const result = manager.getVariables(mockChargingStation, request)
      expect(result).toHaveLength(1)
      expect(result[0].attributeStatus).toBe(GetVariableStatusEnumType.NotSupportedAttributeType)
      expect(result[0].variable.name).toBe(OCPP20OptionalVariableName.WebSocketPingInterval)
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

    await it('Should reject EVSE component as unsupported', () => {
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
      expect(result[0].attributeStatus).toBe(GetVariableStatusEnumType.UnknownComponent)
      expect(result[0].attributeType).toBeUndefined()
      expect(result[0].attributeValue).toBeUndefined()
      expect(result[0].component.name).toBe(OCPP20ComponentName.EVSE)
      expect(result[0].component.instance).toBe('1')
      expect(result[0].variable.name).toBe(OCPP20RequiredVariableName.AuthorizeRemoteStart)
      expect(result[0].attributeStatusInfo).toBeDefined()
      expect(result[0].attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.NotFound)
    })
  })

  await describe('Component validation tests', async () => {
    const manager = OCPP20VariableManager.getInstance()

    await it('Should validate ChargingStation component as always valid', () => {
      // NOTE: Connector components currently unsupported in isComponentValid. Submit OpenSpec proposal before changing behavior.
      // Future OCPP 2.0 per-connector variable support would require updating related tests.
      const component: ComponentType = { name: OCPP20ComponentName.ChargingStation }

      // Access private method through any casting for testing
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
      const isValid = (manager as any).isComponentValid(mockChargingStation, component)
      expect(isValid).toBe(true)
    })

    // NOTE: Connector component currently unsupported in isComponentValid.
    // Future support for per-connector variables must follow an OpenSpec proposal.
    await it('Should reject Connector component as unsupported even when connectors exist', () => {
      const component: ComponentType = { instance: '1', name: OCPP20ComponentName.Connector }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
      const isValid = (manager as any).isComponentValid(mockChargingStation, component)
      expect(isValid).toBe(false)
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
      const isSupported = (manager as any).isVariableSupported(component, variable)
      expect(isSupported).toBe(true)
    })

    await it('Should support known OCPP variables', () => {
      const component: ComponentType = { name: OCPP20ComponentName.ChargingStation }
      const variable: VariableType = { name: OCPP20OptionalVariableName.WebSocketPingInterval }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
      const isSupported = (manager as any).isVariableSupported(component, variable)
      expect(isSupported).toBe(true)
    })

    await it('Should reject unknown variables', () => {
      const component: ComponentType = { name: OCPP20ComponentName.ChargingStation }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      const variable: VariableType = { name: 'UnknownVariable' as any }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
      const isSupported = (manager as any).isVariableSupported(component, variable)
      expect(isSupported).toBe(false)
    })
  })

  await describe('setVariables method tests', async () => {
    const manager = OCPP20VariableManager.getInstance()

    await it('Should accept setting writable ChargingStation variables (Actual default)', () => {
      const request: OCPP20SetVariableDataType[] = [
        {
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
      ]

      const result = manager.setVariables(mockChargingStation, request)

      expect(result).toHaveLength(2)
      expect(result[0].attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      expect(result[0].attributeType).toBe(AttributeEnumType.Actual)
      expect(result[0].attributeStatusInfo).toBeUndefined()
      expect(result[1].attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      expect(result[1].attributeType).toBe(AttributeEnumType.Actual)
      expect(result[1].attributeStatusInfo).toBeUndefined()
    })

    await it('Should reject setting variable on unknown component', () => {
      const request: OCPP20SetVariableDataType[] = [
        {
          attributeValue: '20',
          component: { name: 'InvalidComponent' as unknown as OCPP20ComponentName },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
      ]

      const result = manager.setVariables(mockChargingStation, request)

      expect(result).toHaveLength(1)
      expect(result[0].attributeStatus).toBe(SetVariableStatusEnumType.UnknownComponent)
      expect(result[0].attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.NotFound)
    })

    await it('Should reject setting unknown variable', () => {
      const request: OCPP20SetVariableDataType[] = [
        {
          attributeValue: '10',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: 'UnknownVariable' as unknown as VariableType['name'] },
        },
      ]

      const result = manager.setVariables(mockChargingStation, request)

      expect(result).toHaveLength(1)
      expect(result[0].attributeStatus).toBe(SetVariableStatusEnumType.UnknownVariable)
      expect(result[0].attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.NotFound)
    })

    await it('Should reject unsupported attribute type', () => {
      const request: OCPP20SetVariableDataType[] = [
        {
          attributeType: AttributeEnumType.Target,
          attributeValue: '30',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ]

      const result = manager.setVariables(mockChargingStation, request)

      expect(result).toHaveLength(1)
      expect(result[0].attributeStatus).toBe(SetVariableStatusEnumType.NotSupportedAttributeType)
      expect(result[0].attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.UnsupportedParam)
    })

    await it('Should reject value exceeding max length', () => {
      const longValue = 'x'.repeat(1001)
      const request: OCPP20SetVariableDataType[] = [
        {
          attributeValue: longValue,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
      ]

      const result = manager.setVariables(mockChargingStation, request)

      expect(result).toHaveLength(1)
      expect(result[0].attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(result[0].attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.InvalidValue)
      expect(result[0].attributeStatusInfo?.additionalInfo).toContain('exceeds maximum')
    })

    await it('Should flag reboot required when configuration key with reboot flag changes', () => {
      const variableName = OCPP20RequiredVariableName.MessageTimeout
      addConfigurationKey(
        mockChargingStation,
        variableName as unknown as VariableType['name'],
        mockChargingStation.getConnectionTimeout().toString(),
        { reboot: true },
        { overwrite: false }
      )
      const initialKey = getConfigurationKey(
        mockChargingStation,
        variableName as unknown as VariableType['name']
      )
      expect(initialKey?.reboot).toBe(true)

      const newValue = (mockChargingStation.getConnectionTimeout() + 1).toString()
      const request: OCPP20SetVariableDataType[] = [
        {
          attributeType: AttributeEnumType.Actual,
          attributeValue: newValue,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: variableName },
        },
      ]

      const result = manager.setVariables(mockChargingStation, request)

      expect(result).toHaveLength(1)
      expect(result[0].attributeStatus).toBe(SetVariableStatusEnumType.RebootRequired)
      expect(result[0].attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.NoError)
      expect(result[0].attributeStatusInfo?.additionalInfo).toContain('reboot required')

      deleteConfigurationKey(mockChargingStation, variableName as unknown as VariableType['name'], {
        save: false,
      })
    })

    await it('Should handle multiple mixed SetVariables in one call', () => {
      const request: OCPP20SetVariableDataType[] = [
        {
          attributeValue: (Constants.DEFAULT_WEBSOCKET_PING_INTERVAL + 2).toString(),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
        {
          attributeValue: '10',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: 'InvalidVariable' as unknown as VariableType['name'] },
        },
        {
          attributeType: AttributeEnumType.Target,
          attributeValue: '45',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ]

      const result = manager.setVariables(mockChargingStation, request)

      expect(result).toHaveLength(3)
      expect(result[0].attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      expect(result[0].attributeStatusInfo).toBeUndefined()
      expect(result[1].attributeStatus).toBe(SetVariableStatusEnumType.UnknownVariable)
      expect(result[2].attributeStatus).toBe(SetVariableStatusEnumType.NotSupportedAttributeType)
    })

    await it('Should reject immutable DateTime variable', () => {
      const request: OCPP20SetVariableDataType[] = [
        {
          attributeType: AttributeEnumType.Actual,
          attributeValue: new Date(Date.now() + 1000).toISOString(),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.DateTime },
        },
      ]
      const result = manager.setVariables(mockChargingStation, request)
      expect(result).toHaveLength(1)
      expect(result[0].attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(result[0].attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.ReadOnly)
    })

    await it('Should validate TxUpdatedInterval positive integer >0', () => {
      const request: OCPP20SetVariableDataType[] = [
        {
          attributeValue: '45',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ]
      const result = manager.setVariables(mockChargingStation, request)
      expect(result[0].attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      expect(result[0].attributeStatusInfo).toBeUndefined()
    })

    await it('Should reject TxUpdatedInterval zero and negative and non-integer', () => {
      const zeroReq: OCPP20SetVariableDataType[] = [
        {
          attributeValue: '0',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ]
      const negReq: OCPP20SetVariableDataType[] = [
        {
          attributeValue: '-5',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ]
      const nonIntReq: OCPP20SetVariableDataType[] = [
        {
          attributeValue: '12.3',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ]
      const zeroRes = manager.setVariables(mockChargingStation, zeroReq)[0]
      const negRes = manager.setVariables(mockChargingStation, negReq)[0]
      const nonIntRes = manager.setVariables(mockChargingStation, nonIntReq)[0]
      expect(zeroRes.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(zeroRes.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.ValuePositiveOnly)
      expect(zeroRes.attributeStatusInfo?.additionalInfo).toContain('Positive integer > 0 required')
      expect(negRes.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(negRes.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.ValuePositiveOnly)
      expect(negRes.attributeStatusInfo?.additionalInfo).toContain('Positive integer > 0 required')
      expect(nonIntRes.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(nonIntRes.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.InvalidValue)
      expect(nonIntRes.attributeStatusInfo?.additionalInfo).toContain('Positive integer')
    })

    await it('Should accept setting ConnectionUrl with valid ws URL', () => {
      const req: OCPP20SetVariableDataType[] = [
        {
          attributeValue: 'ws://example.com/ocpp',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ]
      const res = manager.setVariables(mockChargingStation, req)[0]
      expect(res.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      expect(res.attributeStatusInfo).toBeUndefined()
    })

    await it('Should reject ConnectionUrl with invalid scheme', () => {
      const req: OCPP20SetVariableDataType[] = [
        {
          attributeValue: 'ftp://example.com/ocpp',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ]
      const res = manager.setVariables(mockChargingStation, req)[0]
      expect(res.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(res.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.InvalidURL)
      expect(res.attributeStatusInfo?.additionalInfo).toContain('Unsupported URL scheme')
    })

    await it('Should enforce ConnectionUrl write-only on get', () => {
      manager.setVariables(mockChargingStation, [
        {
          attributeValue: 'wss://example.com/ocpp',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])
      const getData: OCPP20GetVariableDataType[] = [
        {
          attributeType: AttributeEnumType.Actual,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ]
      const getResult = manager.getVariables(mockChargingStation, getData)[0]
      expect(getResult.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.WriteOnly)
    })

    await it('Should revert non-persistent TxUpdatedInterval after simulated restart', () => {
      manager.setVariables(mockChargingStation, [
        {
          attributeValue: '99',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ])
      const beforeReset = manager.getVariables(mockChargingStation, [
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ])[0]
      expect(beforeReset.attributeValue).toBe('99')
      manager.resetRuntimeOverrides()
      const afterReset = manager.getVariables(mockChargingStation, [
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ])[0]
      expect(afterReset.attributeValue).toBe('30')
    })

    await it('Should keep persistent ConnectionUrl after simulated restart', () => {
      manager.setVariables(mockChargingStation, [
        {
          attributeValue: 'https://central.example.com/ocpp',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])
      manager.resetRuntimeOverrides()
      const getResult = manager.getVariables(mockChargingStation, [
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      expect(getResult.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.WriteOnly)
    })

    await it('Should reject Target attribute for WebSocketPingInterval', () => {
      const request: OCPP20SetVariableDataType[] = [
        {
          attributeType: AttributeEnumType.Target,
          attributeValue: (Constants.DEFAULT_WEBSOCKET_PING_INTERVAL + 5).toString(),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
      ]
      const result = manager.setVariables(mockChargingStation, request)
      expect(result).toHaveLength(1)
      expect(result[0].attributeStatus).toBe(SetVariableStatusEnumType.NotSupportedAttributeType)
      expect(result[0].attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.UnsupportedParam)
    })

    await it('Should validate HeartbeatInterval positive integer >0', () => {
      const req: OCPP20SetVariableDataType[] = [
        {
          attributeValue: (
            millisecondsToSeconds(Constants.DEFAULT_HEARTBEAT_INTERVAL) + 10
          ).toString(),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ]
      const res = manager.setVariables(mockChargingStation, req)[0]
      expect(res.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      expect(res.attributeStatusInfo).toBeUndefined()
    })

    await it('Should reject HeartbeatInterval zero, negative, non-integer', () => {
      const zeroRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: '0',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      const negRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: '-1',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      const nonIntRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: '10.5',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      expect(zeroRes.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.ValuePositiveOnly)
      expect(zeroRes.attributeStatusInfo?.additionalInfo).toContain('Positive integer > 0 required')
      expect(negRes.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.ValuePositiveOnly)
      expect(negRes.attributeStatusInfo?.additionalInfo).toContain('Positive integer > 0 required')
      expect(nonIntRes.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.InvalidValue)
      expect(nonIntRes.attributeStatusInfo?.additionalInfo).toContain('Positive integer')
    })

    await it('Should accept WebSocketPingInterval zero (disable) and positive', () => {
      const zeroRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: '0',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
      ])[0]
      const posRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: (Constants.DEFAULT_WEBSOCKET_PING_INTERVAL + 10).toString(),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
      ])[0]
      expect(zeroRes.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      expect(zeroRes.attributeStatusInfo).toBeUndefined()
      expect(posRes.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      expect(posRes.attributeStatusInfo).toBeUndefined()
    })

    await it('Should reject WebSocketPingInterval negative and non-integer', () => {
      const negRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: '-2',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
      ])[0]
      const nonIntRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: '5.7',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
      ])[0]
      expect(negRes.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.ValueZeroNotAllowed)
      expect(negRes.attributeStatusInfo?.additionalInfo).toContain('Integer >= 0 required')
      expect(nonIntRes.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.ValueZeroNotAllowed)
      expect(nonIntRes.attributeStatusInfo?.additionalInfo).toContain('Integer >= 0 required')
    })

    await it('Should validate EVConnectionTimeOut positive integer >0 and reject invalid', () => {
      const okRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: (Constants.DEFAULT_EV_CONNECTION_TIMEOUT + 5).toString(),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.EVConnectionTimeOut },
        },
      ])[0]
      expect(okRes.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      expect(okRes.attributeStatusInfo).toBeUndefined()
      const zeroRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: '0',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.EVConnectionTimeOut },
        },
      ])[0]
      const negRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: '-10',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.EVConnectionTimeOut },
        },
      ])[0]
      const nonIntRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: '15.2',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.EVConnectionTimeOut },
        },
      ])[0]
      expect(zeroRes.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.ValuePositiveOnly)
      expect(zeroRes.attributeStatusInfo?.additionalInfo).toContain('Positive integer > 0 required')
      expect(negRes.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.ValuePositiveOnly)
      expect(negRes.attributeStatusInfo?.additionalInfo).toContain('Positive integer > 0 required')
      expect(nonIntRes.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.InvalidValue)
      expect(nonIntRes.attributeStatusInfo?.additionalInfo).toContain('Positive integer')
    })

    await it('Should validate MessageTimeout positive integer >0 and reject invalid', () => {
      const okRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: (mockChargingStation.getConnectionTimeout() + 5).toString(),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.MessageTimeout },
        },
      ])[0]
      expect(okRes.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      expect(okRes.attributeStatusInfo).toBeUndefined()
      const zeroRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: '0',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.MessageTimeout },
        },
      ])[0]
      const negRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: '-25',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.MessageTimeout },
        },
      ])[0]
      const nonIntRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: '30.9',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.MessageTimeout },
        },
      ])[0]
      expect(zeroRes.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.ValuePositiveOnly)
      expect(zeroRes.attributeStatusInfo?.additionalInfo).toContain('Positive integer > 0 required')
      expect(negRes.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.ValuePositiveOnly)
      expect(negRes.attributeStatusInfo?.additionalInfo).toContain('Positive integer > 0 required')
      expect(nonIntRes.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.InvalidValue)
      expect(nonIntRes.attributeStatusInfo?.additionalInfo).toContain('Positive integer')
    })

    await it('Should avoid duplicate persistence operations when value unchanged', () => {
      const keyBefore = getConfigurationKey(
        mockChargingStation,
        OCPP20OptionalVariableName.HeartbeatInterval as unknown as VariableType['name']
      )
      expect(keyBefore).toBeDefined()
      const originalValue = keyBefore?.value
      const first = manager.setVariables(mockChargingStation, [
        {
          attributeValue: originalValue ?? '30',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      expect(first.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      const changed = manager.setVariables(mockChargingStation, [
        {
          attributeValue: (parseInt(originalValue ?? '30', 10) + 5).toString(),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      expect(changed.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      const keyAfterChange = getConfigurationKey(
        mockChargingStation,
        OCPP20OptionalVariableName.HeartbeatInterval as unknown as VariableType['name']
      )
      expect(keyAfterChange?.value).not.toBe(originalValue)
      const reverted = manager.setVariables(mockChargingStation, [
        {
          attributeValue: originalValue ?? '30',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      expect(reverted.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      const keyAfterRevert = getConfigurationKey(
        mockChargingStation,
        OCPP20OptionalVariableName.HeartbeatInterval as unknown as VariableType['name']
      )
      expect(keyAfterRevert?.value).toBe(originalValue)
    })

    await it('Should add missing configuration key with default during self-check', () => {
      deleteConfigurationKey(
        mockChargingStation,
        OCPP20RequiredVariableName.EVConnectionTimeOut as unknown as VariableType['name'],
        { save: false }
      )
      const before = getConfigurationKey(
        mockChargingStation,
        OCPP20RequiredVariableName.EVConnectionTimeOut as unknown as VariableType['name']
      )
      expect(before).toBeUndefined()
      const res = manager.getVariables(mockChargingStation, [
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.EVConnectionTimeOut },
        },
      ])[0]
      expect(res.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
      expect(res.attributeStatusInfo).toBeUndefined()
      expect(res.attributeValue).toBe(Constants.DEFAULT_EV_CONNECTION_TIMEOUT.toString())
      const after = getConfigurationKey(
        mockChargingStation,
        OCPP20RequiredVariableName.EVConnectionTimeOut as unknown as VariableType['name']
      )
      expect(after).toBeDefined()
    })

    await it('Should clear runtime overrides via resetRuntimeOverrides()', () => {
      manager.setVariables(mockChargingStation, [
        {
          attributeValue: '123',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ])
      const beforeReset = manager.getVariables(mockChargingStation, [
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ])[0]
      expect(beforeReset.attributeValue).toBe('123')
      manager.resetRuntimeOverrides()
      const afterReset = manager.getVariables(mockChargingStation, [
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ])[0]
      expect(afterReset.attributeValue).not.toBe('123')
      expect(afterReset.attributeValue).toBe('30')
    })

    await it('Should reject get on write-only variable with Rejected status and write-only info', () => {
      manager.setVariables(mockChargingStation, [
        {
          attributeValue: 'wss://central.example.com/ocpp',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])
      const getRes = manager.getVariables(mockChargingStation, [
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      expect(getRes.attributeStatus).toBe(GetVariableStatusEnumType.Rejected)
      expect(getRes.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.WriteOnly)
      expect(getRes.attributeStatusInfo?.additionalInfo).toContain('write-only')
    })

    await it('Should reject HeartbeatInterval with leading whitespace', () => {
      const res = manager.setVariables(mockChargingStation, [
        {
          attributeValue: ' 60',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      expect(res.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(res.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.InvalidValue)
      expect(res.attributeStatusInfo?.additionalInfo).toContain(
        'Non-empty digits only string required'
      )
    })

    await it('Should reject HeartbeatInterval with trailing whitespace', () => {
      const res = manager.setVariables(mockChargingStation, [
        {
          attributeValue: '60 ',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      expect(res.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(res.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.InvalidValue)
      expect(res.attributeStatusInfo?.additionalInfo).toContain(
        'Non-empty digits only string required'
      )
    })

    await it('Should reject HeartbeatInterval with plus sign prefix', () => {
      const res = manager.setVariables(mockChargingStation, [
        {
          attributeValue: '+10',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      expect(res.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(res.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.InvalidValue)
      expect(res.attributeStatusInfo?.additionalInfo).toContain(
        'Non-empty digits only string required'
      )
    })

    await it('Should accept HeartbeatInterval with leading zeros', () => {
      const res = manager.setVariables(mockChargingStation, [
        {
          attributeValue: '007',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      expect(res.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      expect(res.attributeStatusInfo).toBeUndefined()
    })

    await it('Should reject HeartbeatInterval blank string', () => {
      const res = manager.setVariables(mockChargingStation, [
        {
          attributeValue: '',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      expect(res.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(res.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.InvalidValue)
      expect(res.attributeStatusInfo?.additionalInfo).toContain(
        'Non-empty digits only string required'
      )
    })

    await it('Should reject HeartbeatInterval with internal space', () => {
      const res = manager.setVariables(mockChargingStation, [
        {
          attributeValue: '6 0',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      expect(res.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(res.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.InvalidValue)
      expect(res.attributeStatusInfo?.additionalInfo).toContain(
        'Non-empty digits only string required'
      )
    })

    await it('Should reject ConnectionUrl missing scheme', () => {
      const res = manager.setVariables(mockChargingStation, [
        {
          attributeValue: 'example.com/ocpp',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      expect(res.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(res.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.InvalidURL)
      expect(res.attributeStatusInfo?.additionalInfo).toContain('Invalid URL format')
    })

    await it('Should reject ConnectionUrl exceeding max length', () => {
      const longUrl = 'wss://example.com/' + 'a'.repeat(600)
      const res = manager.setVariables(mockChargingStation, [
        {
          attributeValue: longUrl,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      expect(res.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(res.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.InvalidValue)
      expect(res.attributeStatusInfo?.additionalInfo).toContain('exceeds maximum length (512)')
    })

    await it('Should reject HeartbeatInterval exceeding max length', () => {
      const res = manager.setVariables(mockChargingStation, [
        {
          attributeValue: '1'.repeat(11),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      expect(res.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(res.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.InvalidValue)
      expect(res.attributeStatusInfo?.additionalInfo).toContain('exceeds maximum length (10)')
    })
  })

  await describe('Case-insensitive variable/component name tests', async () => {
    const manager = OCPP20VariableManager.getInstance()

    await it('Should resolve variables irrespective of variable name casing (getVariables)', () => {
      const variants = [
        'HeartbeatInterval',
        'heartbeatinterval',
        'HEARTBEATINTERVAL',
        'HeartBeatInterval',
        'hEaRtBeAtInTeRvAl',
      ]
      const hbKey = getConfigurationKey(
        mockChargingStation,
        OCPP20OptionalVariableName.HeartbeatInterval as unknown as VariableType['name']
      )
      const expectedValue =
        hbKey?.value ?? millisecondsToSeconds(Constants.DEFAULT_HEARTBEAT_INTERVAL).toString()
      for (const variant of variants) {
        const res = manager.getVariables(mockChargingStation, [
          {
            component: { name: OCPP20ComponentName.ChargingStation },
            variable: { name: variant as unknown as VariableType['name'] },
          },
        ])[0]
        expect(res.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
        expect(res.attributeValue).toBe(expectedValue)
      }
    })

    await it('Should accept setVariables irrespective of variable name casing (HeartbeatInterval)', () => {
      const variants = ['HeartbeatInterval', 'heartbeatinterval', 'HEARTBEATINTERVAL']
      for (const variant of variants) {
        const res = manager.setVariables(mockChargingStation, [
          {
            attributeValue: (
              millisecondsToSeconds(Constants.DEFAULT_HEARTBEAT_INTERVAL) + 1
            ).toString(),
            component: { name: OCPP20ComponentName.ChargingStation },
            variable: { name: variant as unknown as VariableType['name'] },
          },
        ])[0]
        expect(res.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      }
    })

    await it('Should persist value when set with uppercase and retrieve with mixed camel case', () => {
      // Set using uppercase
      const setRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: (
            millisecondsToSeconds(Constants.DEFAULT_HEARTBEAT_INTERVAL) + 2
          ).toString(),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: 'HEARTBEATINTERVAL' as unknown as VariableType['name'] },
        },
      ])[0]
      expect(setRes.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      // Get using mixed camel case
      const getRes = manager.getVariables(mockChargingStation, [
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: 'HeartBeatInterval' as unknown as VariableType['name'] },
        },
      ])[0]
      expect(getRes.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
      expect(getRes.attributeValue).toBe(
        (millisecondsToSeconds(Constants.DEFAULT_HEARTBEAT_INTERVAL) + 2).toString()
      )
    })

    await it('Should handle WebSocketPingInterval casing variants', () => {
      const variants = ['WebSocketPingInterval', 'websocketpinginterval', 'WEBSOCKETPINGINTERVAL']
      for (const variant of variants) {
        const getRes = manager.getVariables(mockChargingStation, [
          {
            component: { name: OCPP20ComponentName.ChargingStation },
            variable: { name: variant as unknown as VariableType['name'] },
          },
        ])[0]
        expect(getRes.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
        const setRes = manager.setVariables(mockChargingStation, [
          {
            attributeValue: (Constants.DEFAULT_WEBSOCKET_PING_INTERVAL + 1).toString(),
            component: { name: OCPP20ComponentName.ChargingStation },
            variable: { name: variant as unknown as VariableType['name'] },
          },
        ])[0]
        expect(setRes.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      }
    })

    await it('Should treat ConnectionUrl as write-only regardless of casing on get', () => {
      const variants = ['ConnectionUrl', 'connectionurl', 'CONNECTIONURL']
      for (const variant of variants) {
        manager.setVariables(mockChargingStation, [
          {
            attributeValue: 'wss://example.com/ocpp',
            component: { name: OCPP20ComponentName.ChargingStation },
            variable: { name: variant as unknown as VariableType['name'] },
          },
        ])
        const getRes = manager.getVariables(mockChargingStation, [
          {
            component: { name: OCPP20ComponentName.ChargingStation },
            variable: { name: variant as unknown as VariableType['name'] },
          },
        ])[0]
        expect(getRes.attributeStatus).toBe(GetVariableStatusEnumType.Rejected)
        expect(getRes.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.WriteOnly)
      }
    })

    await it('Should validate component name casing for ChargingStation and AuthCtrlr', () => {
      const chargingStationVariants = ['ChargingStation', 'chargingstation', 'CHARGINGSTATION']
      for (const variant of chargingStationVariants) {
        const res = manager.getVariables(mockChargingStation, [
          {
            component: { name: variant as unknown as OCPP20ComponentName },
            variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
          },
        ])[0]
        expect(res.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
      }
      const authCtrlrVariants = ['AuthCtrlr', 'authctrlr', 'AUTHCTRLR']
      for (const variant of authCtrlrVariants) {
        const res = manager.getVariables(mockChargingStation, [
          {
            component: { name: variant as unknown as OCPP20ComponentName },
            variable: { name: OCPP20RequiredVariableName.AuthorizeRemoteStart },
          },
        ])[0]
        expect(res.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
      }
    })
  })

  await describe('Alias precedence tests', async () => {
    const manager = OCPP20VariableManager.getInstance()

    await it('Should reject setting ReportingValueSize via ChargingStation due to DeviceDataCtrlr read-only metadata', () => {
      const setRes = manager.setVariables(mockChargingStation, [
        {
          attributeType: AttributeEnumType.Actual,
          attributeValue: '2000',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.ReportingValueSize },
        },
      ])[0]
      expect(setRes.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(setRes.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.ReadOnly)
      // Getting should still succeed (read-only)
      const getRes = manager.getVariables(mockChargingStation, [
        {
          attributeType: AttributeEnumType.Actual,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.ReportingValueSize },
        },
      ])[0]
      expect(getRes.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
      expect(getRes.attributeValue?.length).toBeGreaterThan(0)
    })

    await it('Should use SecurityCtrlr metadata when setting SecurityProfile via ChargingStation and enforce enumeration + rebootRequired', () => {
      // First set to 2 (from default 1) -> rebootRequired as value changes
      const first = manager.setVariables(mockChargingStation, [
        {
          attributeType: AttributeEnumType.Actual,
          attributeValue: '2',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.SecurityProfile },
        },
      ])[0]
      expect([
        SetVariableStatusEnumType.RebootRequired,
        SetVariableStatusEnumType.Accepted,
      ]).toContain(first.attributeStatus)
      // Setting again to same value should be Accepted (no reboot)
      const second = manager.setVariables(mockChargingStation, [
        {
          attributeType: AttributeEnumType.Actual,
          attributeValue: '2',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.SecurityProfile },
        },
      ])[0]
      expect(second.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      // Change to 3 should trigger rebootRequired
      const third = manager.setVariables(mockChargingStation, [
        {
          attributeType: AttributeEnumType.Actual,
          attributeValue: '3',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.SecurityProfile },
        },
      ])[0]
      expect([
        SetVariableStatusEnumType.RebootRequired,
        SetVariableStatusEnumType.Accepted,
      ]).toContain(third.attributeStatus)
      // Invalid enumeration value
      const invalid = manager.setVariables(mockChargingStation, [
        {
          attributeType: AttributeEnumType.Actual,
          attributeValue: '5',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20RequiredVariableName.SecurityProfile },
        },
      ])[0]
      expect(invalid.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(invalid.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.InvalidValue)
      expect(invalid.attributeStatusInfo?.additionalInfo).toContain('enumeration')
    })
  })

  await describe('List validation tests', async () => {
    const manager = OCPP20VariableManager.getInstance()

    await it('Should accept valid updates to list/sequence list variables', () => {
      const validUpdates: OCPP20SetVariableDataType[] = [
        {
          attributeValue: 'HTTP,HTTPS',
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.FileTransferProtocols },
        },
        {
          attributeValue: 'GPS,NTP,RTC', // reorder TimeSource
          component: { name: OCPP20ComponentName.ClockCtrlr },
          variable: { name: OCPP20RequiredVariableName.TimeSource },
        },
        {
          attributeValue: 'CablePluggedIn,EnergyTransfer,Authorized',
          component: { name: OCPP20ComponentName.TxCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxStartPoint },
        },
        {
          attributeValue: 'EVSEIdle,CableUnplugged', // keep same
          component: { name: OCPP20ComponentName.TxCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxStopPoint },
        },
        {
          attributeValue: 'Energy.Active.Import.Register,Power.Active.Import,Voltage',
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxStartedMeasurands },
        },
        {
          attributeValue:
            'Energy.Active.Import.Register,Current.Import,Energy.Active.Import.Interval',
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxEndedMeasurands },
        },
        {
          attributeValue: 'Energy.Active.Import.Register,Current.Import',
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedMeasurands },
        },
      ]
      const results = manager.setVariables(mockChargingStation, validUpdates)
      for (const r of results) {
        expect(r.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      }
    })

    await it('Should reject invalid list formats and members', () => {
      interface ListVar {
        component: OCPP20ComponentName
        name: OCPP20RequiredVariableName
      }
      const listVariables: ListVar[] = [
        {
          component: OCPP20ComponentName.OCPPCommCtrlr,
          name: OCPP20RequiredVariableName.FileTransferProtocols,
        },
        { component: OCPP20ComponentName.ClockCtrlr, name: OCPP20RequiredVariableName.TimeSource },
        { component: OCPP20ComponentName.TxCtrlr, name: OCPP20RequiredVariableName.TxStartPoint },
        { component: OCPP20ComponentName.TxCtrlr, name: OCPP20RequiredVariableName.TxStopPoint },
        {
          component: OCPP20ComponentName.SampledDataCtrlr,
          name: OCPP20RequiredVariableName.TxStartedMeasurands,
        },
        {
          component: OCPP20ComponentName.SampledDataCtrlr,
          name: OCPP20RequiredVariableName.TxEndedMeasurands,
        },
        {
          component: OCPP20ComponentName.SampledDataCtrlr,
          name: OCPP20RequiredVariableName.TxUpdatedMeasurands,
        },
      ]
      const invalidPatterns = ['', ',HTTP', 'HTTP,', 'HTTP,,FTP', 'HTTP,HTTP']
      for (const lv of listVariables) {
        for (const pattern of invalidPatterns) {
          const res = manager.setVariables(mockChargingStation, [
            {
              attributeValue: pattern,
              component: { name: lv.component },
              variable: { name: lv.name },
            },
          ])[0]
          expect(res.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
          expect(res.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.InvalidValue)
          if (pattern === '') {
            expect(res.attributeStatusInfo?.additionalInfo).toContain('List cannot be empty')
          } else if (pattern.startsWith(',') || pattern.endsWith(',')) {
            expect(res.attributeStatusInfo?.additionalInfo).toContain('No leading/trailing comma')
          } else if (pattern.includes(',,')) {
            expect(res.attributeStatusInfo?.additionalInfo).toContain('Empty list member')
          } else if (pattern === 'HTTP,HTTP') {
            expect(res.attributeStatusInfo?.additionalInfo).toContain('Duplicate list member')
          }
        }
      }
    })
  })
})
