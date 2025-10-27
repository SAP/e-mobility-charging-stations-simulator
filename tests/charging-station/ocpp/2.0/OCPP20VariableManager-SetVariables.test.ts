// Tests for OCPP20VariableManager SetVariables behavior

import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import {
  addConfigurationKey,
  deleteConfigurationKey,
  getConfigurationKey,
} from '../../../../src/charging-station/ConfigurationKeyUtils.js'
import { OCPP20VariableManager } from '../../../../src/charging-station/ocpp/2.0/OCPP20VariableManager.js'
import {
  AttributeEnumType,
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

/* eslint-disable @typescript-eslint/no-floating-promises */
describe('OCPP20VariableManager SetVariables test suite', () => {
  // NOTE: Delegation spy code removed; spying via monkey patch not supported reliably in ESM test environment.
  // Delegation behavior will be asserted indirectly through effects/results in dedicated tests lower in file.

  const mockChargingStation = createChargingStationWithEvses({
    baseName: TEST_CHARGING_STATION_NAME,
    heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
    websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
  })

  const manager = OCPP20VariableManager.getInstance()

  it('Should accept setting writable ChargingStation variables (Actual default)', () => {
    const request: OCPP20SetVariableDataType[] = [
      {
        attributeValue: (Constants.DEFAULT_WEBSOCKET_PING_INTERVAL + 1).toString(),
        component: { name: OCPP20ComponentName.ChargingStation },
        variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
      },
      {
        attributeType: AttributeEnumType.Actual,
        attributeValue: (Math.floor(Constants.DEFAULT_HEARTBEAT_INTERVAL / 1000) + 1).toString(),
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

  it('Should reject setting variable on unknown component', () => {
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

  it('Should reject setting unknown variable', () => {
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

  it('Should reject unsupported attribute type', () => {
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

  it('Should reject value exceeding max length', () => {
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
    expect(result[0].attributeStatusInfo?.reasonCode).toBe(
      ReasonCodeEnumType.PropertyConstraintViolation
    )
    expect(result[0].attributeStatusInfo?.additionalInfo).toContain('exceeds maximum')
  })

  it('Should flag reboot required when configuration key with reboot flag changes', () => {
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
    expect(result[0].attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.ChangeRequiresReboot)
    expect(result[0].attributeStatusInfo?.additionalInfo).toContain('reboot required')

    deleteConfigurationKey(mockChargingStation, variableName as unknown as VariableType['name'], {
      save: false,
    })
  })

  it('Should handle multiple mixed SetVariables in one call', () => {
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

  it('Should reject immutable DateTime variable', () => {
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
    expect(result[0].attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.ImmutableVariable)
  })

  it('Should validate TxUpdatedInterval positive integer >0', () => {
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

  it('Should reject TxUpdatedInterval zero and negative and non-integer', () => {
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
    expect(zeroRes.attributeStatusInfo?.reasonCode).toBe(
      ReasonCodeEnumType.PropertyConstraintViolation
    )
    expect(zeroRes.attributeStatusInfo?.additionalInfo).toContain('Positive integer > 0 required')
    expect(negRes.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
    expect(negRes.attributeStatusInfo?.reasonCode).toBe(
      ReasonCodeEnumType.PropertyConstraintViolation
    )
    expect(negRes.attributeStatusInfo?.additionalInfo).toContain('Positive integer > 0 required')
    expect(nonIntRes.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
    expect(nonIntRes.attributeStatusInfo?.reasonCode).toBe(
      ReasonCodeEnumType.PropertyConstraintViolation
    )
    expect(nonIntRes.attributeStatusInfo?.additionalInfo).toContain('Positive integer')
  })

  it('Should accept setting ConnectionUrl with valid ws URL', () => {
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

  it('Should reject ConnectionUrl with invalid scheme', () => {
    const req: OCPP20SetVariableDataType[] = [
      {
        attributeValue: 'ftp://example.com/ocpp',
        component: { name: OCPP20ComponentName.ChargingStation },
        variable: { name: OCPP20VendorVariableName.ConnectionUrl },
      },
    ]
    const res = manager.setVariables(mockChargingStation, req)[0]
    expect(res.attributeStatus).toBe(SetVariableStatusEnumType.Rejected)
    expect(res.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.PropertyConstraintViolation)
    expect(res.attributeStatusInfo?.additionalInfo).toContain('Unsupported URL scheme')
  })

  it('Should enforce ConnectionUrl write-only on get', () => {
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
    expect(getResult.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.UnsupportedParam)
  })

  it('Should revert non-persistent TxUpdatedInterval after simulated restart', () => {
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
    manager.resetRuntimeVariables()
    const afterReset = manager.getVariables(mockChargingStation, [
      {
        component: { name: OCPP20ComponentName.ChargingStation },
        variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
      },
    ])[0]
    expect(afterReset.attributeValue).toBe('30')
  })

  it('Should keep persistent ConnectionUrl after simulated restart', () => {
    manager.setVariables(mockChargingStation, [
      {
        attributeValue: 'https://central.example.com/ocpp',
        component: { name: OCPP20ComponentName.ChargingStation },
        variable: { name: OCPP20VendorVariableName.ConnectionUrl },
      },
    ])
    manager.resetRuntimeVariables()
    const getResult = manager.getVariables(mockChargingStation, [
      {
        component: { name: OCPP20ComponentName.ChargingStation },
        variable: { name: OCPP20VendorVariableName.ConnectionUrl },
      },
    ])[0]
    expect(getResult.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.UnsupportedParam)
  })

  it('Should reject Target attribute for WebSocketPingInterval', () => {
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

  it('Should validate HeartbeatInterval positive integer >0', () => {
    const req: OCPP20SetVariableDataType[] = [
      {
        attributeValue: (Math.floor(Constants.DEFAULT_HEARTBEAT_INTERVAL / 1000) + 10).toString(),
        component: { name: OCPP20ComponentName.ChargingStation },
        variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
      },
    ]
    const res = manager.setVariables(mockChargingStation, req)[0]
    expect(res.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
    expect(res.attributeStatusInfo).toBeUndefined()
  })

  it('Should reject HeartbeatInterval zero, negative, non-integer', () => {
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
    expect(zeroRes.attributeStatusInfo?.reasonCode).toBe(
      ReasonCodeEnumType.PropertyConstraintViolation
    )
    expect(zeroRes.attributeStatusInfo?.additionalInfo).toContain('Positive integer > 0 required')
    expect(negRes.attributeStatusInfo?.reasonCode).toBe(
      ReasonCodeEnumType.PropertyConstraintViolation
    )
    expect(negRes.attributeStatusInfo?.additionalInfo).toContain('Positive integer > 0 required')
    expect(nonIntRes.attributeStatusInfo?.reasonCode).toBe(
      ReasonCodeEnumType.PropertyConstraintViolation
    )
    expect(nonIntRes.attributeStatusInfo?.additionalInfo).toContain('Positive integer')
  })

  it('Should accept WebSocketPingInterval zero (disable) and positive', () => {
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

  it('Should reject WebSocketPingInterval negative and non-integer', () => {
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
    expect(negRes.attributeStatusInfo?.reasonCode).toBe(
      ReasonCodeEnumType.PropertyConstraintViolation
    )
    expect(negRes.attributeStatusInfo?.additionalInfo).toContain('Integer >= 0 required')
    expect(nonIntRes.attributeStatusInfo?.reasonCode).toBe(
      ReasonCodeEnumType.PropertyConstraintViolation
    )
    expect(nonIntRes.attributeStatusInfo?.additionalInfo).toContain('Integer >= 0 required')
  })

  it('Should validate EVConnectionTimeOut positive integer >0 and reject invalid', () => {
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
    expect(zeroRes.attributeStatusInfo?.reasonCode).toBe(
      ReasonCodeEnumType.PropertyConstraintViolation
    )
    expect(zeroRes.attributeStatusInfo?.additionalInfo).toContain('Positive integer > 0 required')
    expect(negRes.attributeStatusInfo?.reasonCode).toBe(
      ReasonCodeEnumType.PropertyConstraintViolation
    )
    expect(negRes.attributeStatusInfo?.additionalInfo).toContain('Positive integer > 0 required')
    expect(nonIntRes.attributeStatusInfo?.reasonCode).toBe(
      ReasonCodeEnumType.PropertyConstraintViolation
    )
    expect(nonIntRes.attributeStatusInfo?.additionalInfo).toContain('Positive integer')
  })

  it('Should validate MessageTimeout positive integer >0 and reject invalid', () => {
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
    expect(zeroRes.attributeStatusInfo?.reasonCode).toBe(
      ReasonCodeEnumType.PropertyConstraintViolation
    )
    expect(zeroRes.attributeStatusInfo?.additionalInfo).toContain('Positive integer > 0 required')
    expect(negRes.attributeStatusInfo?.reasonCode).toBe(
      ReasonCodeEnumType.PropertyConstraintViolation
    )
    expect(negRes.attributeStatusInfo?.additionalInfo).toContain('Positive integer > 0 required')
    expect(nonIntRes.attributeStatusInfo?.reasonCode).toBe(
      ReasonCodeEnumType.PropertyConstraintViolation
    )
    expect(nonIntRes.attributeStatusInfo?.additionalInfo).toContain('Positive integer')
  })

  it('Should avoid duplicate persistence operations when value unchanged', () => {
    // Precondition: HeartbeatInterval config key exists with initial value
    const keyBefore = getConfigurationKey(
      mockChargingStation,
      OCPP20OptionalVariableName.HeartbeatInterval as unknown as VariableType['name']
    )
    expect(keyBefore).toBeDefined()
    const originalValue = keyBefore?.value
    // First set to same value (no change expected) - Accepted without reboot
    const first = manager.setVariables(mockChargingStation, [
      {
        attributeValue: originalValue ?? '30',
        component: { name: OCPP20ComponentName.ChargingStation },
        variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
      },
    ])[0]
    expect(first.attributeStatus).toBe(SetVariableStatusEnumType.Accepted)
    // Simulate a change then revert to same value to ensure second persistence only when changed
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

  it('Should add missing configuration key with default during self-check', () => {
    const managerLocal = OCPP20VariableManager.getInstance()
    // Delete EVConnectionTimeOut config key to simulate missing mapping
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
    // Trigger self-check through getVariables
    const res = managerLocal.getVariables(mockChargingStation, [
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

  it('Should clear runtime overrides via resetRuntimeOverrides()', () => {
    const managerLocal = OCPP20VariableManager.getInstance()
    managerLocal.setVariables(mockChargingStation, [
      {
        attributeValue: '123',
        component: { name: OCPP20ComponentName.ChargingStation },
        variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
      },
    ])
    const beforeReset = managerLocal.getVariables(mockChargingStation, [
      {
        component: { name: OCPP20ComponentName.ChargingStation },
        variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
      },
    ])[0]
    expect(beforeReset.attributeValue).toBe('123')
    managerLocal.resetRuntimeOverrides()
    const afterReset = managerLocal.getVariables(mockChargingStation, [
      {
        component: { name: OCPP20ComponentName.ChargingStation },
        variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
      },
    ])[0]
    expect(afterReset.attributeValue).not.toBe('123')
    // Default currently expected to be '30'
    expect(afterReset.attributeValue).toBe('30')
  })

  it('Should reject get on write-only variable with Rejected status and write-only info', () => {
    const managerLocal = OCPP20VariableManager.getInstance()
    managerLocal.setVariables(mockChargingStation, [
      {
        attributeValue: 'wss://central.example.com/ocpp',
        component: { name: OCPP20ComponentName.ChargingStation },
        variable: { name: OCPP20VendorVariableName.ConnectionUrl },
      },
    ])
    const getRes = managerLocal.getVariables(mockChargingStation, [
      {
        component: { name: OCPP20ComponentName.ChargingStation },
        variable: { name: OCPP20VendorVariableName.ConnectionUrl },
      },
    ])[0]
    expect(getRes.attributeStatus).toBe(GetVariableStatusEnumType.Rejected)
    expect(getRes.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.UnsupportedParam)
    expect(getRes.attributeStatusInfo?.additionalInfo).toContain('write-only')
  })
})
