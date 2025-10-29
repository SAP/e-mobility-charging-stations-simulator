/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { expect } from '@std/expect'
import { millisecondsToSeconds } from 'date-fns'
import { describe, it } from 'node:test'

import {
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
import {
  createChargingStation,
  createChargingStationWithEvses,
} from '../../../ChargingStationFactory.js'
import { TEST_CHARGING_STATION_NAME } from './OCPP20TestConstants.js'
import { resetValueSizeLimits, setConfigurationValueSize, setValueSize } from './OCPP20TestUtils.js'

/**
 * Build a syntactically valid ws://example URL of desired length.
 * Keeps prefix constant then pads remainder with a filler character.
 * @param targetLength Desired total length of the URL string.
 * @param fillerChar Character used to pad after the base prefix.
 * @returns Valid WebSocket URL string of exact targetLength.
 */
function buildWsExampleUrl (targetLength: number, fillerChar = 'a'): string {
  const base = 'ws://example/'
  if (targetLength <= base.length) {
    throw new Error('targetLength too small')
  }
  return base + fillerChar.repeat(targetLength - base.length)
}

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

    await it('Should handle valid OCPPCommCtrlr and TxCtrlr component requests', () => {
      const request: OCPP20GetVariableDataType[] = [
        {
          attributeType: AttributeEnumType.Actual,
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
        {
          attributeType: AttributeEnumType.Actual,
          component: { name: OCPP20ComponentName.TxCtrlr },
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
      expect(result[0].component.name).toBe(OCPP20ComponentName.OCPPCommCtrlr)
      expect(result[0].variable.name).toBe(OCPP20OptionalVariableName.HeartbeatInterval)
      expect(result[0].attributeStatusInfo).toBeUndefined()
      // Second variable: EVConnectionTimeOut
      expect(result[1].attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
      expect(result[1].attributeType).toBe(AttributeEnumType.Actual)
      expect(result[1].attributeValue).toBe(Constants.DEFAULT_EV_CONNECTION_TIMEOUT.toString())
      expect(result[1].component.name).toBe(OCPP20ComponentName.TxCtrlr)
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
      // New behavior: invalid component rejected before variable support check
      expect(result[0].attributeStatus).toBe(GetVariableStatusEnumType.UnknownComponent)
      expect(result[0].attributeType).toBe(AttributeEnumType.Actual)
      expect(result[0].attributeValue).toBeUndefined()
      expect(result[0].component.name).toBe('InvalidComponent')
      expect(result[0].variable.name).toBe('SomeVariable')
      expect(result[0].attributeStatusInfo).toBeDefined()
      expect(result[0].attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.NotFound)
      expect(result[0].attributeStatusInfo?.additionalInfo).toContain('Component InvalidComponent')
    })

    await it('Should handle unsupported attribute type gracefully', () => {
      const request: OCPP20GetVariableDataType[] = [
        {
          attributeType: AttributeEnumType.Target, // Not supported for this variable
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ]

      const result = manager.getVariables(mockChargingStation, request)

      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(1)
      expect(result[0].attributeStatus).toBe(GetVariableStatusEnumType.NotSupportedAttributeType)
      expect(result[0].attributeType).toBe(AttributeEnumType.Target)
      expect(result[0].attributeValue).toBeUndefined()
      expect(result[0].component.name).toBe(OCPP20ComponentName.OCPPCommCtrlr)
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
      expect(result[0].attributeType).toBe(AttributeEnumType.Actual)
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
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
        {
          attributeType: AttributeEnumType.Actual,
          component: { instance: 'Default', name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageTimeout },
        },
      ]

      const result = manager.getVariables(mockChargingStation, request)

      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(3)
      // First variable: HeartbeatInterval
      expect(result[0].attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
      expect(result[0].attributeType).toBe(AttributeEnumType.Actual)
      expect(result[0].attributeValue).toBe(
        millisecondsToSeconds(Constants.DEFAULT_HEARTBEAT_INTERVAL).toString()
      )
      expect(result[0].component.name).toBe(OCPP20ComponentName.OCPPCommCtrlr)
      expect(result[0].variable.name).toBe(OCPP20OptionalVariableName.HeartbeatInterval)
      expect(result[0].attributeStatusInfo).toBeUndefined()
      // Second variable: WebSocketPingInterval
      expect(result[1].attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
      expect(result[1].attributeType).toBe(AttributeEnumType.Actual)
      expect(result[1].attributeValue).toBe(Constants.DEFAULT_WEBSOCKET_PING_INTERVAL.toString())
      expect(result[1].component.name).toBe(OCPP20ComponentName.ChargingStation)
      expect(result[1].variable.name).toBe(OCPP20OptionalVariableName.WebSocketPingInterval)
      expect(result[1].attributeStatusInfo).toBeUndefined()
      // Third variable: MessageTimeout
      expect(result[2].attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
      expect(result[2].attributeType).toBe(AttributeEnumType.Actual)
      expect(result[2].attributeValue).toBe(mockChargingStation.getConnectionTimeout().toString())
      expect(result[2].component.name).toBe(OCPP20ComponentName.OCPPCommCtrlr)
      expect(result[2].component.instance).toBe('Default')
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
      expect(result[0].attributeType).toBe(AttributeEnumType.Actual)
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

    await it('Should validate OCPPCommCtrlr component as always valid', () => {
      // NOTE: Connector components currently unsupported in isComponentValid. Submit OpenSpec proposal before changing behavior.
      // Future OCPP 2.0 per-connector variable support would require updating related tests.
      const component: ComponentType = { name: OCPP20ComponentName.OCPPCommCtrlr }

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
      const component: ComponentType = { name: OCPP20ComponentName.OCPPCommCtrlr }
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
      const component: ComponentType = { name: OCPP20ComponentName.OCPPCommCtrlr }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      const variable: VariableType = { name: 'UnknownVariable' as any }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
      const isSupported = (manager as any).isVariableSupported(component, variable)
      expect(isSupported).toBe(false)
    })
  })

  await describe('setVariables method tests', async () => {
    const manager = OCPP20VariableManager.getInstance()

    await it('Should accept setting writable variables (Actual default)', () => {
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
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
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
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
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
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
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

    await it('Should handle multiple mixed SetVariables in one call', () => {
      const request: OCPP20SetVariableDataType[] = [
        {
          attributeValue: (Constants.DEFAULT_WEBSOCKET_PING_INTERVAL + 2).toString(),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
        {
          attributeValue: '10',
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: 'InvalidVariable' as unknown as VariableType['name'] },
        },
        {
          attributeType: AttributeEnumType.Target,
          attributeValue: '45',
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
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
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ]
      const negReq: OCPP20SetVariableDataType[] = [
        {
          attributeValue: '-5',
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ]
      const nonIntReq: OCPP20SetVariableDataType[] = [
        {
          attributeValue: '12.3',
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
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

    await it('Should allow ConnectionUrl retrieval after set', () => {
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
      expect(getResult.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
      expect(getResult.attributeValue).toBe('wss://example.com/ocpp')
      expect(getResult.attributeStatusInfo).toBeUndefined()
    })

    await it('Should revert non-persistent TxUpdatedInterval after simulated restart', () => {
      manager.setVariables(mockChargingStation, [
        {
          attributeValue: '99',
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ])
      const beforeReset = manager.getVariables(mockChargingStation, [
        {
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ])[0]
      expect(beforeReset.attributeValue).toBe('99')
      manager.resetRuntimeOverrides()
      const afterReset = manager.getVariables(mockChargingStation, [
        {
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
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
      expect(getResult.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
      expect(getResult.attributeValue).toBe('https://central.example.com/ocpp')
      expect(getResult.attributeStatusInfo).toBeUndefined()
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
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
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
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      const negRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: '-1',
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      const nonIntRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: '10.5',
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
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
          component: { name: OCPP20ComponentName.TxCtrlr },
          variable: { name: OCPP20RequiredVariableName.EVConnectionTimeOut },
        },
      ])[0]
      expect(okRes.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      expect(okRes.attributeStatusInfo).toBeUndefined()
      const zeroRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: '0',
          component: { name: OCPP20ComponentName.TxCtrlr },
          variable: { name: OCPP20RequiredVariableName.EVConnectionTimeOut },
        },
      ])[0]
      const negRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: '-10',
          component: { name: OCPP20ComponentName.TxCtrlr },
          variable: { name: OCPP20RequiredVariableName.EVConnectionTimeOut },
        },
      ])[0]
      const nonIntRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: '15.2',
          component: { name: OCPP20ComponentName.TxCtrlr },
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
          component: { instance: 'Default', name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageTimeout },
        },
      ])[0]
      expect(okRes.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      expect(okRes.attributeStatusInfo).toBeUndefined()
      const zeroRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: '0',
          component: { instance: 'Default', name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageTimeout },
        },
      ])[0]
      const negRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: '-25',
          component: { instance: 'Default', name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageTimeout },
        },
      ])[0]
      const nonIntRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: '30.9',
          component: { instance: 'Default', name: OCPP20ComponentName.OCPPCommCtrlr },
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
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      expect(first.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      const changed = manager.setVariables(mockChargingStation, [
        {
          attributeValue: (parseInt(originalValue ?? '30', 10) + 5).toString(),
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
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
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
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
          component: { name: OCPP20ComponentName.TxCtrlr },
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
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ])
      const beforeReset = manager.getVariables(mockChargingStation, [
        {
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ])[0]
      expect(beforeReset.attributeValue).toBe('123')
      manager.resetRuntimeOverrides()
      const afterReset = manager.getVariables(mockChargingStation, [
        {
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ])[0]
      expect(afterReset.attributeValue).not.toBe('123')
      expect(afterReset.attributeValue).toBe('30')
    })

    // Removed outdated write-only ConnectionUrl get rejection test: variable now retrievable as Actual attribute

    await it('Should reject HeartbeatInterval with leading whitespace', () => {
      const res = manager.setVariables(mockChargingStation, [
        {
          attributeValue: ' 60',
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
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
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
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
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
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
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
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
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
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
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
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
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      expect(res.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(res.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.InvalidValue)
      expect(res.attributeStatusInfo?.additionalInfo).toContain('exceeds maximum length (10)')
    })

    // Effective value size limit tests combining ConfigurationValueSize and ValueSize
    await it('Should enforce ConfigurationValueSize when ValueSize unset', () => {
      resetValueSizeLimits(mockChargingStation)
      setConfigurationValueSize(mockChargingStation, 50)
      // remove ValueSize to simulate unset
      deleteConfigurationKey(
        mockChargingStation,
        OCPP20RequiredVariableName.ValueSize as unknown as VariableType['name'],
        { save: false }
      )
      const okRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: buildWsExampleUrl(50, 'x'),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      expect(okRes.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      const tooLongRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: buildWsExampleUrl(51, 'x'),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      expect(tooLongRes.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(tooLongRes.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.TooLargeElement)
    })

    await it('Should enforce ValueSize when ConfigurationValueSize unset', () => {
      resetValueSizeLimits(mockChargingStation)
      setValueSize(mockChargingStation, 40)
      deleteConfigurationKey(
        mockChargingStation,
        OCPP20RequiredVariableName.ConfigurationValueSize as unknown as VariableType['name'],
        { save: false }
      )
      const okRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: buildWsExampleUrl(40, 'y'),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      expect(okRes.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      const tooLongRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: buildWsExampleUrl(41, 'y'),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      expect(tooLongRes.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(tooLongRes.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.TooLargeElement)
    })

    await it('Should use smaller of ConfigurationValueSize and ValueSize (ValueSize smaller)', () => {
      resetValueSizeLimits(mockChargingStation)
      setConfigurationValueSize(mockChargingStation, 60)
      setValueSize(mockChargingStation, 55)
      const okRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: buildWsExampleUrl(55, 'z'),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      expect(okRes.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      const tooLongRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: buildWsExampleUrl(56, 'z'),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      expect(tooLongRes.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(tooLongRes.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.TooLargeElement)
    })

    await it('Should use smaller of ConfigurationValueSize and ValueSize (ConfigurationValueSize smaller)', () => {
      resetValueSizeLimits(mockChargingStation)
      setConfigurationValueSize(mockChargingStation, 30)
      setValueSize(mockChargingStation, 100)
      const okRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: buildWsExampleUrl(30, 'w'),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      expect(okRes.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      const tooLongRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: buildWsExampleUrl(31, 'w'),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      expect(tooLongRes.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(tooLongRes.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.TooLargeElement)
    })

    await it('Should fallback to default limit when both invalid/non-positive', () => {
      resetValueSizeLimits(mockChargingStation)
      // set invalid values
      setConfigurationValueSize(mockChargingStation, 0)
      setValueSize(mockChargingStation, -5)
      const okRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: buildWsExampleUrl(300, 'v'), // below default 2500
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      expect(okRes.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
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

  await describe('MinSet/MaxSet validation tests', async () => {
    const manager = OCPP20VariableManager.getInstance()
    const mmChargingStation = createChargingStation({
      baseName: 'MMStation',
      heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
      websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
    })

    await it('Accepts setting MinSet then MaxSet for HeartbeatInterval', () => {
      const component = { name: OCPP20ComponentName.OCPPCommCtrlr }
      const variable = { name: OCPP20OptionalVariableName.HeartbeatInterval }
      const minRes = manager.setVariables(mmChargingStation, [
        { attributeType: AttributeEnumType.MinSet, attributeValue: '10', component, variable },
      ])[0]
      expect(minRes.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      const maxRes = manager.setVariables(mmChargingStation, [
        { attributeType: AttributeEnumType.MaxSet, attributeValue: '100', component, variable },
      ])[0]
      expect(maxRes.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
    })

    await it('Retrieves MinSet and MaxSet for HeartbeatInterval after set', () => {
      const component = { name: OCPP20ComponentName.OCPPCommCtrlr }
      const variable = { name: OCPP20OptionalVariableName.HeartbeatInterval }
      const getMin = manager.getVariables(mmChargingStation, [
        { attributeType: AttributeEnumType.MinSet, component, variable },
      ])[0]
      expect(getMin.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
      expect(getMin.attributeValue).toBe('10')
      const getMax = manager.getVariables(mmChargingStation, [
        { attributeType: AttributeEnumType.MaxSet, component, variable },
      ])[0]
      expect(getMax.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
      expect(getMax.attributeValue).toBe('100')
    })

    await it('Rejects non-integer MaxSet for MessageAttemptInterval', () => {
      const component = { instance: 'TransactionEvent', name: OCPP20ComponentName.OCPPCommCtrlr }
      const variable = { name: OCPP20RequiredVariableName.MessageAttemptInterval }
      const res = manager.setVariables(mmChargingStation, [
        { attributeType: AttributeEnumType.MaxSet, attributeValue: '10.5', component, variable },
      ])[0]
      expect(res.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(res.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.InvalidValue)
    })

    await it('Rejects MinSet higher than existing MaxSet', () => {
      const component = { name: OCPP20ComponentName.ChargingStation }
      const variable = { name: OCPP20OptionalVariableName.WebSocketPingInterval }
      manager.setVariables(mmChargingStation, [
        { attributeType: AttributeEnumType.MaxSet, attributeValue: '50', component, variable },
      ])
      const badMin = manager.setVariables(mmChargingStation, [
        { attributeType: AttributeEnumType.MinSet, attributeValue: '51', component, variable },
      ])[0]
      expect(badMin.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(badMin.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.InvalidValue)
    })

    await it('Rejects MaxSet lower than existing MinSet', () => {
      const component = { name: OCPP20ComponentName.TxCtrlr }
      const variable = { name: OCPP20RequiredVariableName.EVConnectionTimeOut }
      manager.setVariables(mmChargingStation, [
        { attributeType: AttributeEnumType.MinSet, attributeValue: '30', component, variable },
      ])
      const badMax = manager.setVariables(mmChargingStation, [
        { attributeType: AttributeEnumType.MaxSet, attributeValue: '29', component, variable },
      ])[0]
      expect(badMax.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(badMax.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.InvalidValue)
    })

    await it('Rejects non-integer MinSet for MessageAttemptInterval', () => {
      const component = { instance: 'TransactionEvent', name: OCPP20ComponentName.OCPPCommCtrlr }
      const variable = { name: OCPP20RequiredVariableName.MessageAttemptInterval }
      const res = manager.setVariables(mmChargingStation, [
        { attributeType: AttributeEnumType.MinSet, attributeValue: '5.5', component, variable },
      ])[0]
      expect(res.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(res.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.InvalidValue)
    })

    await it('Rejects MinSet below metadata minimum (MessageAttempts)', () => {
      const component = { instance: 'TransactionEvent', name: OCPP20ComponentName.OCPPCommCtrlr }
      const variable = { name: OCPP20RequiredVariableName.MessageAttempts }
      const res = manager.setVariables(mmChargingStation, [
        { attributeType: AttributeEnumType.MinSet, attributeValue: '0', component, variable },
      ])[0]
      expect(res.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(res.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.ValueTooLow)
    })

    await it('Rejects MaxSet above metadata maximum (MessageAttempts)', () => {
      const component = { instance: 'TransactionEvent', name: OCPP20ComponentName.OCPPCommCtrlr }
      const variable = { name: OCPP20RequiredVariableName.MessageAttempts }
      const res = manager.setVariables(mmChargingStation, [
        { attributeType: AttributeEnumType.MaxSet, attributeValue: '999', component, variable },
      ])[0]
      expect(res.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(res.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.ValueTooHigh)
    })

    await it('Enforces MinSet/MaxSet bounds for MessageTimeout Actual', () => {
      const component = { instance: 'Default', name: OCPP20ComponentName.OCPPCommCtrlr }
      const variable = { name: OCPP20RequiredVariableName.MessageTimeout }
      manager.setVariables(mmChargingStation, [
        { attributeType: AttributeEnumType.MinSet, attributeValue: '10', component, variable },
      ])
      manager.setVariables(mmChargingStation, [
        { attributeType: AttributeEnumType.MaxSet, attributeValue: '20', component, variable },
      ])
      const below = manager.setVariables(mmChargingStation, [
        { attributeType: AttributeEnumType.Actual, attributeValue: '9', component, variable },
      ])[0]
      expect(below.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(below.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.ValueTooLow)
      const above = manager.setVariables(mmChargingStation, [
        { attributeType: AttributeEnumType.Actual, attributeValue: '21', component, variable },
      ])[0]
      expect(above.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(above.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.ValueTooHigh)
      const within = manager.setVariables(mmChargingStation, [
        { attributeType: AttributeEnumType.Actual, attributeValue: '15', component, variable },
      ])[0]
      expect(within.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
    })

    await it('Rejects MinSet/MaxSet for non-integer data type ConnectionUrl', () => {
      const component = { name: OCPP20ComponentName.ChargingStation }
      const variable = { name: OCPP20VendorVariableName.ConnectionUrl }
      const minRes = manager.setVariables(mmChargingStation, [
        { attributeType: AttributeEnumType.MinSet, attributeValue: '1', component, variable },
      ])[0]
      expect(minRes.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(minRes.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.InvalidValue)
    })

    await it('Returns NotSupportedAttributeType when requesting MinSet for ConnectionUrl', () => {
      const component = { name: OCPP20ComponentName.ChargingStation }
      const variable = { name: OCPP20VendorVariableName.ConnectionUrl }
      const getMin = manager.getVariables(mmChargingStation, [
        { attributeType: AttributeEnumType.MinSet, component, variable },
      ])[0]
      expect(getMin.attributeStatus).toBe(GetVariableStatusEnumType.NotSupportedAttributeType)
      expect(getMin.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.UnsupportedParam)
    })

    await it('Rejects HeartbeatInterval Actual above metadata maximum', () => {
      const component = { name: OCPP20ComponentName.OCPPCommCtrlr }
      const variable = { name: OCPP20OptionalVariableName.HeartbeatInterval }
      const tooHigh = manager.setVariables(mmChargingStation, [
        { attributeType: AttributeEnumType.Actual, attributeValue: '999999', component, variable },
      ])[0]
      expect(tooHigh.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(tooHigh.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.ValueTooHigh)
    })

    await it('Rejects setting Actual for read-only BytesPerMessage', () => {
      const component = { name: OCPP20ComponentName.DeviceDataCtrlr }
      const variable = { name: OCPP20RequiredVariableName.BytesPerMessage }
      const res = manager.setVariables(mmChargingStation, [
        { attributeType: AttributeEnumType.Actual, attributeValue: '10000', component, variable },
      ])[0]
      expect(res.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(res.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.ReadOnly)
    })

    await it('Retrieves dynamic DateTime Actual value', () => {
      const component = { name: OCPP20ComponentName.ClockCtrlr }
      const variable = { name: OCPP20RequiredVariableName.DateTime }
      const res = manager.getVariables(mmChargingStation, [
        { attributeType: AttributeEnumType.Actual, component, variable },
      ])[0]
      expect(res.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
      expect(res.attributeValue).toMatch(/\d{4}-\d{2}-\d{2}T/)
    })
  })

  await describe('Additional persistence and instance-scoped variable tests', async () => {
    const manager = OCPP20VariableManager.getInstance()

    await it('Should auto-create persistent OrganizationName configuration key during self-check', () => {
      deleteConfigurationKey(
        mockChargingStation,
        OCPP20RequiredVariableName.OrganizationName as unknown as VariableType['name'],
        { save: false }
      )
      const before = getConfigurationKey(
        mockChargingStation,
        OCPP20RequiredVariableName.OrganizationName as unknown as VariableType['name']
      )
      expect(before).toBeUndefined()
      const res = manager.getVariables(mockChargingStation, [
        {
          component: { name: OCPP20ComponentName.SecurityCtrlr },
          variable: { name: OCPP20RequiredVariableName.OrganizationName },
        },
      ])[0]
      expect(res.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
      expect(res.attributeValue).toBe('ChangeMeOrg')
      const after = getConfigurationKey(
        mockChargingStation,
        OCPP20RequiredVariableName.OrganizationName as unknown as VariableType['name']
      )
      expect(after).toBeDefined()
      expect(after?.value).toBe('ChangeMeOrg')
    })

    await it('Should accept setting OrganizationName but not persist new value (current limitation)', () => {
      const setRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: 'NewOrgName',
          component: { name: OCPP20ComponentName.SecurityCtrlr },
          variable: { name: OCPP20RequiredVariableName.OrganizationName },
        },
      ])[0]
      // Current implementation only marks rebootRequired for ChargingStation component variables
      expect(setRes.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      const getRes = manager.getVariables(mockChargingStation, [
        {
          component: { name: OCPP20ComponentName.SecurityCtrlr },
          variable: { name: OCPP20RequiredVariableName.OrganizationName },
        },
      ])[0]
      // Value remains the configuration key default due to lack of persistence path for non-ChargingStation components
      expect(getRes.attributeValue).toBe('ChangeMeOrg')
    })

    await it('Should preserve OrganizationName value after resetRuntimeOverrides()', () => {
      manager.resetRuntimeOverrides()
      const res = manager.getVariables(mockChargingStation, [
        {
          component: { name: OCPP20ComponentName.SecurityCtrlr },
          variable: { name: OCPP20RequiredVariableName.OrganizationName },
        },
      ])[0]
      expect(res.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
      expect(res.attributeValue).toBe('ChangeMeOrg')
    })

    await it('Should not create configuration key for instance-scoped MessageAttemptInterval and enforce MinSet/MaxSet overrides', () => {
      // Ensure no configuration key exists before operations
      const cfgBefore = getConfigurationKey(
        mockChargingStation,
        OCPP20RequiredVariableName.MessageAttemptInterval as unknown as VariableType['name']
      )
      expect(cfgBefore).toBeUndefined()
      const initialGet = manager.getVariables(mockChargingStation, [
        {
          component: { instance: 'TransactionEvent', name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageAttemptInterval },
        },
      ])[0]
      expect(initialGet.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
      expect(initialGet.attributeValue).toBe('5')

      // Set MinSet override to 6
      const minSetRes = manager.setVariables(mockChargingStation, [
        {
          attributeType: AttributeEnumType.MinSet,
          attributeValue: '6',
          component: { instance: 'TransactionEvent', name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageAttemptInterval },
        },
      ])[0]
      expect(minSetRes.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      const getMin = manager.getVariables(mockChargingStation, [
        {
          attributeType: AttributeEnumType.MinSet,
          component: { instance: 'TransactionEvent', name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageAttemptInterval },
        },
      ])[0]
      expect(getMin.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
      expect(getMin.attributeValue).toBe('6')

      // Set MaxSet override to 10
      const maxSetRes = manager.setVariables(mockChargingStation, [
        {
          attributeType: AttributeEnumType.MaxSet,
          attributeValue: '10',
          component: { instance: 'TransactionEvent', name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageAttemptInterval },
        },
      ])[0]
      expect(maxSetRes.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
      const getMax = manager.getVariables(mockChargingStation, [
        {
          attributeType: AttributeEnumType.MaxSet,
          component: { instance: 'TransactionEvent', name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageAttemptInterval },
        },
      ])[0]
      expect(getMax.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
      expect(getMax.attributeValue).toBe('10')

      // Attempt Actual value below MinSet override
      const belowMinRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: '5',
          component: { instance: 'TransactionEvent', name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageAttemptInterval },
        },
      ])[0]
      expect(belowMinRes.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(belowMinRes.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.ValueTooLow)

      // Attempt Actual value above MaxSet override
      const aboveMaxRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: '11',
          component: { instance: 'TransactionEvent', name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageAttemptInterval },
        },
      ])[0]
      expect(aboveMaxRes.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
      expect(aboveMaxRes.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.ValueTooHigh)

      // Accept Actual value within overrides
      const withinRes = manager.setVariables(mockChargingStation, [
        {
          attributeValue: '7',
          component: { instance: 'TransactionEvent', name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageAttemptInterval },
        },
      ])[0]
      expect(withinRes.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)

      // Retrieval still returns default due to lack of persistence/storage path for non-ChargingStation components
      const afterSetGet = manager.getVariables(mockChargingStation, [
        {
          component: { instance: 'TransactionEvent', name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageAttemptInterval },
        },
      ])[0]
      expect(afterSetGet.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
      expect(afterSetGet.attributeValue).toBe('5')

      const cfgAfter = getConfigurationKey(
        mockChargingStation,
        OCPP20RequiredVariableName.MessageAttemptInterval as unknown as VariableType['name']
      )
      expect(cfgAfter).toBeUndefined()
    })
  })
})
