/**
 * @file Tests for OCPP20VariableManager
 * @description Unit tests for OCPP 2.0 variable management and device model
 */

import { millisecondsToSeconds } from 'date-fns'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/ChargingStation.js'

import {
  deleteConfigurationKey,
  getConfigurationKey,
} from '../../../../src/charging-station/ConfigurationKeyUtils.js'
import { createTestableVariableManager } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20VariableManager } from '../../../../src/charging-station/ocpp/2.0/OCPP20VariableManager.js'
import { VARIABLE_REGISTRY } from '../../../../src/charging-station/ocpp/2.0/OCPP20VariableRegistry.js'
import {
  AttributeEnumType,
  type ComponentType,
  GetVariableStatusEnumType,
  OCPP20ComponentName,
  type OCPP20GetVariableDataType,
  OCPP20MeasurandEnumType,
  OCPP20OptionalVariableName,
  OCPP20RequiredVariableName,
  type OCPP20SetVariableDataType,
  OCPP20VendorVariableName,
  OCPPVersion,
  ReasonCodeEnumType,
  SetVariableStatusEnumType,
  type VariableType,
} from '../../../../src/types/index.js'
import { StandardParametersKey } from '../../../../src/types/ocpp/Configuration.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../../tests/helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'
import {
  resetReportingValueSize,
  resetValueSizeLimits,
  setConfigurationValueSize,
  setReportingValueSize,
  setValueSize,
  upsertConfigurationKey,
} from './OCPP20TestUtils.js'
const CONNECTION_URL_MAX_LENGTH =
  VARIABLE_REGISTRY[
    `${OCPP20ComponentName.ChargingStation}::${OCPP20VendorVariableName.ConnectionUrl}`
  ].maxLength ?? 512

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

await describe('B05 - OCPP20VariableManager', async () => {
  // Type declaration for mock ChargingStation
  let station: ChargingStation

  // Initialize mock ChargingStation before each test
  beforeEach(() => {
    const { station: newStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 3,
      evseConfiguration: { evsesCount: 3 },
      heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
      ocppConfiguration: {
        configurationKey: [
          {
            key: StandardParametersKey.HeartbeatInterval,
            readonly: false,
            value: millisecondsToSeconds(Constants.DEFAULT_HEARTBEAT_INTERVAL).toString(),
          },
          {
            key: StandardParametersKey.WebSocketPingInterval,
            readonly: false,
            value: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL.toString(),
          },
        ],
      },
      stationInfo: {
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
    })
    station = newStation
  })

  // Reset singleton state after each test to ensure test isolation
  afterEach(() => {
    standardCleanup()
    OCPP20VariableManager.getInstance().resetRuntimeOverrides()
  })

  await it('should return same instance when getInstance() called multiple times', () => {
    const manager1 = OCPP20VariableManager.getInstance()
    const manager2 = OCPP20VariableManager.getInstance()

    assert.notStrictEqual(manager1, undefined)
    assert.strictEqual(manager1, manager2) // Same instance (singleton)
  })

  await describe('getVariables method tests', async () => {
    let manager: OCPP20VariableManager

    beforeEach(() => {
      manager = OCPP20VariableManager.getInstance()
    })
    await it('should handle valid OCPPCommCtrlr and TxCtrlr component requests', () => {
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

      const result = manager.getVariables(station, request)

      assert.ok(Array.isArray(result))
      assert.strictEqual(result.length, 2)
      // First variable: HeartbeatInterval
      assert.strictEqual(result[0].attributeStatus, GetVariableStatusEnumType.Accepted)
      assert.strictEqual(result[0].attributeType, AttributeEnumType.Actual)
      assert.strictEqual(
        result[0].attributeValue,
        millisecondsToSeconds(Constants.DEFAULT_HEARTBEAT_INTERVAL).toString()
      )
      assert.strictEqual(result[0].component.name, OCPP20ComponentName.OCPPCommCtrlr)
      assert.strictEqual(result[0].variable.name, OCPP20OptionalVariableName.HeartbeatInterval)
      assert.strictEqual(result[0].attributeStatusInfo, undefined)
      // Second variable: EVConnectionTimeOut
      assert.strictEqual(result[1].attributeStatus, GetVariableStatusEnumType.Accepted)
      assert.strictEqual(result[1].attributeType, AttributeEnumType.Actual)
      assert.strictEqual(
        result[1].attributeValue,
        Constants.DEFAULT_EV_CONNECTION_TIMEOUT.toString()
      )
      assert.strictEqual(result[1].component.name, OCPP20ComponentName.TxCtrlr)
      assert.strictEqual(result[1].variable.name, OCPP20RequiredVariableName.EVConnectionTimeOut)
      assert.strictEqual(result[1].attributeStatusInfo, undefined)
    })

    await it('should accept default true value for AuthorizeRemoteStart (AuthCtrlr)', () => {
      const manager = OCPP20VariableManager.getInstance()
      const request: OCPP20GetVariableDataType[] = [
        {
          component: { name: OCPP20ComponentName.AuthCtrlr },
          variable: { name: OCPP20RequiredVariableName.AuthorizeRemoteStart },
        },
      ]
      const result = manager.getVariables(station, request)
      assert.strictEqual(result.length, 1)
      assert.strictEqual(result[0].attributeStatus, GetVariableStatusEnumType.Accepted)
      assert.strictEqual(result[0].attributeValue, 'true')
      assert.strictEqual(result[0].component.name, OCPP20ComponentName.AuthCtrlr)
    })

    await it('should accept setting and getting AuthorizeRemoteStart = true (AuthCtrlr)', () => {
      const setRes = manager.setVariables(station, [
        {
          attributeValue: 'true',
          component: { name: OCPP20ComponentName.AuthCtrlr },
          variable: { name: OCPP20RequiredVariableName.AuthorizeRemoteStart },
        },
      ])[0]
      assert.strictEqual(setRes.attributeStatus, SetVariableStatusEnumType.Accepted)
      const getRes = manager.getVariables(station, [
        {
          component: { name: OCPP20ComponentName.AuthCtrlr },
          variable: { name: OCPP20RequiredVariableName.AuthorizeRemoteStart },
        },
      ])[0]
      assert.strictEqual(getRes.attributeStatus, GetVariableStatusEnumType.Accepted)
      assert.strictEqual(getRes.attributeValue, 'true')
    })

    await it('should reject invalid values for AuthorizeRemoteStart (AuthCtrlr)', () => {
      const invalidValues = ['', '1', 'TRUE', 'False', 'yes']
      for (const val of invalidValues) {
        const res = manager.setVariables(station, [
          {
            attributeValue: val,
            component: { name: OCPP20ComponentName.AuthCtrlr },
            variable: { name: OCPP20RequiredVariableName.AuthorizeRemoteStart },
          },
        ])[0]
        assert.strictEqual(res.attributeStatus, SetVariableStatusEnumType.Rejected)
        assert.strictEqual(res.attributeStatusInfo?.reasonCode, ReasonCodeEnumType.InvalidValue)
      }
    })

    await it('should handle invalid component gracefully', () => {
      const request: OCPP20GetVariableDataType[] = [
        {
          component: { name: 'InvalidComponent' as unknown as OCPP20ComponentName },
          variable: { name: 'SomeVariable' as unknown as OCPP20OptionalVariableName },
        },
      ]

      const result = manager.getVariables(station, request)

      assert.ok(Array.isArray(result))
      assert.strictEqual(result.length, 1)
      // Behavior: invalid component is rejected before variable support check
      assert.strictEqual(result[0].attributeStatus, GetVariableStatusEnumType.UnknownComponent)
      assert.strictEqual(result[0].attributeType, AttributeEnumType.Actual)
      assert.strictEqual(result[0].attributeValue, undefined)
      assert.strictEqual(result[0].component.name, 'InvalidComponent')
      assert.strictEqual(result[0].variable.name, 'SomeVariable')
      if (result[0].attributeStatusInfo == null) {
        assert.fail('Expected attributeStatusInfo to be defined')
      }
      if (result[0].attributeStatusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.strictEqual(result[0].attributeStatusInfo.reasonCode, ReasonCodeEnumType.NotFound)
      assert.ok(result[0].attributeStatusInfo.additionalInfo.includes('Component InvalidComponent'))
    })

    await it('should handle unsupported attribute type gracefully', () => {
      const request: OCPP20GetVariableDataType[] = [
        {
          attributeType: AttributeEnumType.Target, // Not supported for this variable
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ]

      const result = manager.getVariables(station, request)

      assert.ok(Array.isArray(result))
      assert.strictEqual(result.length, 1)
      assert.strictEqual(
        result[0].attributeStatus,
        GetVariableStatusEnumType.NotSupportedAttributeType
      )
      assert.strictEqual(result[0].attributeType, AttributeEnumType.Target)
      assert.strictEqual(result[0].attributeValue, undefined)
      assert.strictEqual(result[0].component.name, OCPP20ComponentName.OCPPCommCtrlr)
      assert.strictEqual(result[0].variable.name, OCPP20OptionalVariableName.HeartbeatInterval)
      if (result[0].attributeStatusInfo == null) {
        assert.fail('Expected attributeStatusInfo to be defined')
      }
      if (result[0].attributeStatusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.strictEqual(
        result[0].attributeStatusInfo.reasonCode,
        ReasonCodeEnumType.UnsupportedParam
      )
      assert.ok(
        result[0].attributeStatusInfo.additionalInfo.includes(
          'Attribute type Target is not supported'
        )
      )
    })

    await it('should reject Target attribute for WebSocketPingInterval', () => {
      const request: OCPP20GetVariableDataType[] = [
        {
          attributeType: AttributeEnumType.Target,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
      ]
      const result = manager.getVariables(station, request)
      assert.strictEqual(result.length, 1)
      assert.strictEqual(
        result[0].attributeStatus,
        GetVariableStatusEnumType.NotSupportedAttributeType
      )
      assert.strictEqual(result[0].variable.name, OCPP20OptionalVariableName.WebSocketPingInterval)
    })

    await it('should handle non-existent connector instance', () => {
      const request: OCPP20GetVariableDataType[] = [
        {
          component: {
            instance: '999', // Non-existent connector
            name: OCPP20ComponentName.Connector,
          },
          variable: { name: OCPP20RequiredVariableName.AuthorizeRemoteStart },
        },
      ]

      const result = manager.getVariables(station, request)

      assert.ok(Array.isArray(result))
      assert.strictEqual(result.length, 1)
      assert.strictEqual(result[0].attributeStatus, GetVariableStatusEnumType.UnknownComponent)
      assert.strictEqual(result[0].attributeType, AttributeEnumType.Actual)
      assert.strictEqual(result[0].attributeValue, undefined)
      assert.strictEqual(result[0].component.name, OCPP20ComponentName.Connector)
      assert.strictEqual(result[0].component.instance, '999')
      assert.strictEqual(result[0].variable.name, OCPP20RequiredVariableName.AuthorizeRemoteStart)
      if (result[0].attributeStatusInfo == null) {
        assert.fail('Expected attributeStatusInfo to be defined')
      }
      if (result[0].attributeStatusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.strictEqual(result[0].attributeStatusInfo.reasonCode, ReasonCodeEnumType.NotFound)
      assert.ok(
        result[0].attributeStatusInfo.additionalInfo.includes(
          'Component Connector is not supported'
        )
      )
    })

    await it('should handle multiple variables in single request', () => {
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

      const result = manager.getVariables(station, request)

      assert.ok(Array.isArray(result))
      assert.strictEqual(result.length, 3)
      // First variable: HeartbeatInterval
      assert.strictEqual(result[0].attributeStatus, GetVariableStatusEnumType.Accepted)
      assert.strictEqual(result[0].attributeType, AttributeEnumType.Actual)
      assert.strictEqual(
        result[0].attributeValue,
        millisecondsToSeconds(Constants.DEFAULT_HEARTBEAT_INTERVAL).toString()
      )
      assert.strictEqual(result[0].component.name, OCPP20ComponentName.OCPPCommCtrlr)
      assert.strictEqual(result[0].variable.name, OCPP20OptionalVariableName.HeartbeatInterval)
      assert.strictEqual(result[0].attributeStatusInfo, undefined)
      // Second variable: WebSocketPingInterval
      assert.strictEqual(result[1].attributeStatus, GetVariableStatusEnumType.Accepted)
      assert.strictEqual(result[1].attributeType, AttributeEnumType.Actual)
      assert.strictEqual(
        result[1].attributeValue,
        Constants.DEFAULT_WEBSOCKET_PING_INTERVAL.toString()
      )
      assert.strictEqual(result[1].component.name, OCPP20ComponentName.ChargingStation)
      assert.strictEqual(result[1].variable.name, OCPP20OptionalVariableName.WebSocketPingInterval)
      assert.strictEqual(result[1].attributeStatusInfo, undefined)
      // Third variable: MessageTimeout
      assert.strictEqual(result[2].attributeStatus, GetVariableStatusEnumType.Accepted)
      assert.strictEqual(result[2].attributeType, AttributeEnumType.Actual)
      assert.strictEqual(result[2].attributeValue, Constants.DEFAULT_CONNECTION_TIMEOUT.toString())
      assert.strictEqual(result[2].component.name, OCPP20ComponentName.OCPPCommCtrlr)
      assert.strictEqual(result[2].component.instance, 'Default')
      assert.strictEqual(result[2].variable.name, OCPP20RequiredVariableName.MessageTimeout)
      assert.strictEqual(result[2].attributeStatusInfo, undefined)
    })

    await it('should reject unknown variable on EVSE component', () => {
      const request: OCPP20GetVariableDataType[] = [
        {
          component: {
            instance: '1',
            name: OCPP20ComponentName.EVSE,
          },
          variable: { name: OCPP20RequiredVariableName.AuthorizeRemoteStart },
        },
      ]

      const result = manager.getVariables(station, request)

      assert.ok(Array.isArray(result))
      assert.strictEqual(result.length, 1)
      assert.strictEqual(result[0].attributeStatus, GetVariableStatusEnumType.UnknownVariable)
      assert.strictEqual(result[0].attributeType, AttributeEnumType.Actual)
      assert.strictEqual(result[0].attributeValue, undefined)
      assert.strictEqual(result[0].component.name, OCPP20ComponentName.EVSE)
      assert.strictEqual(result[0].component.instance, '1')
      assert.strictEqual(result[0].variable.name, OCPP20RequiredVariableName.AuthorizeRemoteStart)
      assert.notStrictEqual(result[0].attributeStatusInfo, undefined)
      assert.strictEqual(result[0].attributeStatusInfo?.reasonCode, ReasonCodeEnumType.NotFound)
    })
  })

  await describe('Component validation tests', async () => {
    let manager: OCPP20VariableManager
    let testable: ReturnType<typeof createTestableVariableManager>

    beforeEach(() => {
      manager = OCPP20VariableManager.getInstance()
      testable = createTestableVariableManager(manager)
    })
    await it('should validate OCPPCommCtrlr component as always valid', () => {
      // Behavior: Connector components are unsupported and isComponentValid returns false.
      // Scope: Per-connector variable validation not implemented; tests assert current behavior.
      const component: ComponentType = { name: OCPP20ComponentName.OCPPCommCtrlr }

      // Access private method through any casting for testing
      const isValid = testable.isComponentValid(station, component)
      assert.strictEqual(isValid, true)
    })

    // Behavior: Connector component validation returns false (unsupported).
    // Change process: Enable via OpenSpec proposal before altering this expectation.
    await it('should reject Connector component as unsupported even when connectors exist', () => {
      const component: ComponentType = { instance: '1', name: OCPP20ComponentName.Connector }

      const isValid = testable.isComponentValid(station, component)
      assert.strictEqual(isValid, false)
    })

    await it('should reject invalid connector instance', () => {
      const component: ComponentType = { instance: '999', name: OCPP20ComponentName.Connector }

      const isValid = testable.isComponentValid(station, component)
      assert.strictEqual(isValid, false)
    })
  })

  await describe('Variable support validation tests', async () => {
    let manager: OCPP20VariableManager
    let testable: ReturnType<typeof createTestableVariableManager>

    beforeEach(() => {
      manager = OCPP20VariableManager.getInstance()
      testable = createTestableVariableManager(manager)
    })
    await it('should support standard HeartbeatInterval variable', () => {
      const component: ComponentType = { name: OCPP20ComponentName.OCPPCommCtrlr }
      const variable: VariableType = { name: OCPP20OptionalVariableName.HeartbeatInterval }

      const isSupported = testable.isVariableSupported(component, variable)
      assert.strictEqual(isSupported, true)
    })

    await it('should support known OCPP variables', () => {
      const component: ComponentType = { name: OCPP20ComponentName.ChargingStation }
      const variable: VariableType = { name: OCPP20OptionalVariableName.WebSocketPingInterval }

      const isSupported = testable.isVariableSupported(component, variable)
      assert.strictEqual(isSupported, true)
    })

    await it('should reject unknown variables', () => {
      const component: ComponentType = { name: OCPP20ComponentName.OCPPCommCtrlr }
      const variable: VariableType = {
        name: 'UnknownVariable' as unknown as OCPP20OptionalVariableName,
      }

      const isSupported = testable.isVariableSupported(component, variable)
      assert.strictEqual(isSupported, false)
    })
  })

  await describe('setVariables method tests', async () => {
    let manager: OCPP20VariableManager

    beforeEach(() => {
      manager = OCPP20VariableManager.getInstance()
    })
    await it('should accept setting writable variables (Actual default)', () => {
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

      const result = manager.setVariables(station, request)

      assert.strictEqual(result.length, 2)
      assert.strictEqual(result[0].attributeStatus, SetVariableStatusEnumType.Accepted)
      assert.strictEqual(result[0].attributeType, AttributeEnumType.Actual)
      assert.strictEqual(result[0].attributeStatusInfo, undefined)
      assert.strictEqual(result[1].attributeStatus, SetVariableStatusEnumType.Accepted)
      assert.strictEqual(result[1].attributeType, AttributeEnumType.Actual)
      assert.strictEqual(result[1].attributeStatusInfo, undefined)
    })

    await it('should reject setting variable on unknown component', () => {
      const request: OCPP20SetVariableDataType[] = [
        {
          attributeValue: '20',
          component: { name: 'InvalidComponent' as unknown as OCPP20ComponentName },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
      ]

      const result = manager.setVariables(station, request)

      assert.strictEqual(result.length, 1)
      assert.strictEqual(result[0].attributeStatus, SetVariableStatusEnumType.UnknownComponent)
      assert.strictEqual(result[0].attributeStatusInfo?.reasonCode, ReasonCodeEnumType.NotFound)
    })

    await it('should reject setting unknown variable', () => {
      const request: OCPP20SetVariableDataType[] = [
        {
          attributeValue: '10',
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: 'UnknownVariable' as unknown as VariableType['name'] },
        },
      ]

      const result = manager.setVariables(station, request)

      assert.strictEqual(result.length, 1)
      assert.strictEqual(result[0].attributeStatus, SetVariableStatusEnumType.UnknownVariable)
      assert.strictEqual(result[0].attributeStatusInfo?.reasonCode, ReasonCodeEnumType.NotFound)
    })

    await it('should reject unsupported attribute type', () => {
      const request: OCPP20SetVariableDataType[] = [
        {
          attributeType: AttributeEnumType.Target,
          attributeValue: '30',
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ]

      const result = manager.setVariables(station, request)

      assert.strictEqual(result.length, 1)
      assert.strictEqual(
        result[0].attributeStatus,
        SetVariableStatusEnumType.NotSupportedAttributeType
      )
      assert.strictEqual(
        result[0].attributeStatusInfo?.reasonCode,
        ReasonCodeEnumType.UnsupportedParam
      )
    })

    await it('should reject value exceeding max length', () => {
      const longValue = 'x'.repeat(2501)
      const request: OCPP20SetVariableDataType[] = [
        {
          attributeValue: longValue,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
      ]

      const result = manager.setVariables(station, request)

      assert.strictEqual(result.length, 1)
      assert.strictEqual(result[0].attributeStatus, SetVariableStatusEnumType.Rejected)
      if (result[0].attributeStatusInfo == null) {
        assert.fail('Expected attributeStatusInfo to be defined')
      }
      if (result[0].attributeStatusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.strictEqual(
        result[0].attributeStatusInfo.reasonCode,
        ReasonCodeEnumType.TooLargeElement
      )
      assert.ok(
        result[0].attributeStatusInfo.additionalInfo.includes('exceeds effective size limit')
      )
    })

    await it('should handle multiple mixed SetVariables in one call', () => {
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
      const result = manager.setVariables(station, request)
      assert.strictEqual(result[0].attributeStatus, SetVariableStatusEnumType.Accepted)
      assert.strictEqual(result[0].attributeStatusInfo, undefined)
    })

    await it('should reject TxUpdatedInterval zero and negative and non-integer', () => {
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
      const zeroRes = manager.setVariables(station, zeroReq)[0]
      const negRes = manager.setVariables(station, negReq)[0]
      const nonIntRes = manager.setVariables(station, nonIntReq)[0]
      assert.strictEqual(zeroRes.attributeStatus, SetVariableStatusEnumType.Rejected)
      if (zeroRes.attributeStatusInfo == null) {
        assert.fail('Expected attributeStatusInfo to be defined')
      }
      if (zeroRes.attributeStatusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.strictEqual(
        zeroRes.attributeStatusInfo.reasonCode,
        ReasonCodeEnumType.ValuePositiveOnly
      )
      assert.ok(
        zeroRes.attributeStatusInfo.additionalInfo.includes('Positive integer > 0 required')
      )
      assert.strictEqual(negRes.attributeStatus, SetVariableStatusEnumType.Rejected)
      if (negRes.attributeStatusInfo == null) {
        assert.fail('Expected attributeStatusInfo to be defined')
      }
      if (negRes.attributeStatusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.strictEqual(
        negRes.attributeStatusInfo.reasonCode,
        ReasonCodeEnumType.ValuePositiveOnly
      )
      assert.ok(negRes.attributeStatusInfo.additionalInfo.includes('Positive integer > 0 required'))
      assert.strictEqual(nonIntRes.attributeStatus, SetVariableStatusEnumType.Rejected)
      if (nonIntRes.attributeStatusInfo == null) {
        assert.fail('Expected attributeStatusInfo to be defined')
      }
      if (nonIntRes.attributeStatusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.strictEqual(nonIntRes.attributeStatusInfo.reasonCode, ReasonCodeEnumType.InvalidValue)
      assert.ok(nonIntRes.attributeStatusInfo.additionalInfo.includes('Positive integer'))
    })

    await it('should accept setting ConnectionUrl with valid ws URL', () => {
      const req: OCPP20SetVariableDataType[] = [
        {
          attributeValue: 'ws://example.com/ocpp',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ]
      const res = manager.setVariables(station, req)[0]
      assert.strictEqual(res.attributeStatus, SetVariableStatusEnumType.Accepted)
      assert.strictEqual(res.attributeStatusInfo, undefined)
    })

    await it('should accept ConnectionUrl with ftp scheme (no scheme restriction)', () => {
      const req: OCPP20SetVariableDataType[] = [
        {
          attributeValue: 'ftp://example.com/ocpp',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ]
      const res = manager.setVariables(station, req)[0]
      assert.strictEqual(res.attributeStatus, SetVariableStatusEnumType.Accepted)
      assert.strictEqual(res.attributeStatusInfo, undefined)
    })

    await it('should accept ConnectionUrl with custom mqtt scheme', () => {
      const req: OCPP20SetVariableDataType[] = [
        {
          attributeValue: 'mqtt://broker.example.com/ocpp',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ]
      const res = manager.setVariables(station, req)[0]
      assert.strictEqual(res.attributeStatus, SetVariableStatusEnumType.Accepted)
      assert.strictEqual(res.attributeStatusInfo, undefined)
    })

    await it('should allow ConnectionUrl retrieval after set', () => {
      manager.setVariables(station, [
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
      const getResult = manager.getVariables(station, getData)[0]
      assert.strictEqual(getResult.attributeStatus, GetVariableStatusEnumType.Accepted)
      assert.strictEqual(getResult.attributeValue, 'wss://example.com/ocpp')
      assert.strictEqual(getResult.attributeStatusInfo, undefined)
    })

    await it('should revert non-persistent TxUpdatedInterval after simulated restart', () => {
      manager.setVariables(station, [
        {
          attributeValue: '99',
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ])
      const beforeReset = manager.getVariables(station, [
        {
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ])[0]
      assert.strictEqual(beforeReset.attributeValue, '99')
      manager.resetRuntimeOverrides()
      const afterReset = manager.getVariables(station, [
        {
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ])[0]
      assert.strictEqual(afterReset.attributeValue, '30')
    })

    await it('should keep persistent ConnectionUrl after simulated restart', () => {
      manager.setVariables(station, [
        {
          attributeValue: 'https://central.example.com/ocpp',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])
      manager.resetRuntimeOverrides()
      const getResult = manager.getVariables(station, [
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      assert.strictEqual(getResult.attributeStatus, GetVariableStatusEnumType.Accepted)
      assert.strictEqual(getResult.attributeValue, 'https://central.example.com/ocpp')
      assert.strictEqual(getResult.attributeStatusInfo, undefined)
    })

    await it('should reject Target attribute for WebSocketPingInterval', () => {
      const request: OCPP20SetVariableDataType[] = [
        {
          attributeType: AttributeEnumType.Target,
          attributeValue: (Constants.DEFAULT_WEBSOCKET_PING_INTERVAL + 5).toString(),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
      ]
      const result = manager.setVariables(station, request)
      assert.strictEqual(result.length, 1)
      assert.strictEqual(
        result[0].attributeStatus,
        SetVariableStatusEnumType.NotSupportedAttributeType
      )
      assert.strictEqual(
        result[0].attributeStatusInfo?.reasonCode,
        ReasonCodeEnumType.UnsupportedParam
      )
    })

    await it('should validate HeartbeatInterval positive integer >0', () => {
      const req: OCPP20SetVariableDataType[] = [
        {
          attributeValue: (
            millisecondsToSeconds(Constants.DEFAULT_HEARTBEAT_INTERVAL) + 10
          ).toString(),
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ]
      const res = manager.setVariables(station, req)[0]
      assert.strictEqual(res.attributeStatus, SetVariableStatusEnumType.Accepted)
      assert.strictEqual(res.attributeStatusInfo, undefined)
    })

    await it('should reject HeartbeatInterval zero, negative, non-integer', () => {
      const zeroRes = manager.setVariables(station, [
        {
          attributeValue: '0',
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      const negRes = manager.setVariables(station, [
        {
          attributeValue: '-1',
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      const nonIntRes = manager.setVariables(station, [
        {
          attributeValue: '10.5',
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      if (zeroRes.attributeStatusInfo == null) {
        assert.fail('Expected attributeStatusInfo to be defined')
      }
      if (zeroRes.attributeStatusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.strictEqual(
        zeroRes.attributeStatusInfo.reasonCode,
        ReasonCodeEnumType.ValuePositiveOnly
      )
      assert.ok(
        zeroRes.attributeStatusInfo.additionalInfo.includes('Positive integer > 0 required')
      )
      if (negRes.attributeStatusInfo == null) {
        assert.fail('Expected attributeStatusInfo to be defined')
      }
      if (negRes.attributeStatusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.strictEqual(
        negRes.attributeStatusInfo.reasonCode,
        ReasonCodeEnumType.ValuePositiveOnly
      )
      assert.ok(negRes.attributeStatusInfo.additionalInfo.includes('Positive integer > 0 required'))
      if (nonIntRes.attributeStatusInfo == null) {
        assert.fail('Expected attributeStatusInfo to be defined')
      }
      if (nonIntRes.attributeStatusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.strictEqual(nonIntRes.attributeStatusInfo.reasonCode, ReasonCodeEnumType.InvalidValue)
      assert.ok(nonIntRes.attributeStatusInfo.additionalInfo.includes('Positive integer'))
    })

    await it('should accept WebSocketPingInterval zero (disable) and positive', () => {
      const zeroRes = manager.setVariables(station, [
        {
          attributeValue: '0',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
      ])[0]
      const posRes = manager.setVariables(station, [
        {
          attributeValue: (Constants.DEFAULT_WEBSOCKET_PING_INTERVAL + 10).toString(),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
      ])[0]
      assert.strictEqual(zeroRes.attributeStatus, SetVariableStatusEnumType.Accepted)
      assert.strictEqual(zeroRes.attributeStatusInfo, undefined)
      assert.strictEqual(posRes.attributeStatus, SetVariableStatusEnumType.Accepted)
      assert.strictEqual(posRes.attributeStatusInfo, undefined)
    })

    await it('should reject WebSocketPingInterval negative and non-integer', () => {
      const negRes = manager.setVariables(station, [
        {
          attributeValue: '-2',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
      ])[0]
      const nonIntRes = manager.setVariables(station, [
        {
          attributeValue: '5.7',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
      ])[0]
      if (negRes.attributeStatusInfo == null) {
        assert.fail('Expected attributeStatusInfo to be defined')
      }
      if (negRes.attributeStatusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.strictEqual(
        negRes.attributeStatusInfo.reasonCode,
        ReasonCodeEnumType.ValueZeroNotAllowed
      )
      assert.ok(negRes.attributeStatusInfo.additionalInfo.includes('Integer >= 0 required'))
      if (nonIntRes.attributeStatusInfo == null) {
        assert.fail('Expected attributeStatusInfo to be defined')
      }
      if (nonIntRes.attributeStatusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.strictEqual(
        nonIntRes.attributeStatusInfo.reasonCode,
        ReasonCodeEnumType.ValueZeroNotAllowed
      )
      assert.ok(nonIntRes.attributeStatusInfo.additionalInfo.includes('Integer >= 0 required'))
    })

    await it('should validate EVConnectionTimeOut positive integer >0 and reject invalid', () => {
      const okRes = manager.setVariables(station, [
        {
          attributeValue: (Constants.DEFAULT_EV_CONNECTION_TIMEOUT + 5).toString(),
          component: { name: OCPP20ComponentName.TxCtrlr },
          variable: { name: OCPP20RequiredVariableName.EVConnectionTimeOut },
        },
      ])[0]
      assert.strictEqual(okRes.attributeStatus, SetVariableStatusEnumType.Accepted)
      assert.strictEqual(okRes.attributeStatusInfo, undefined)
      const zeroRes = manager.setVariables(station, [
        {
          attributeValue: '0',
          component: { name: OCPP20ComponentName.TxCtrlr },
          variable: { name: OCPP20RequiredVariableName.EVConnectionTimeOut },
        },
      ])[0]
      const negRes = manager.setVariables(station, [
        {
          attributeValue: '-10',
          component: { name: OCPP20ComponentName.TxCtrlr },
          variable: { name: OCPP20RequiredVariableName.EVConnectionTimeOut },
        },
      ])[0]
      const nonIntRes = manager.setVariables(station, [
        {
          attributeValue: '15.2',
          component: { name: OCPP20ComponentName.TxCtrlr },
          variable: { name: OCPP20RequiredVariableName.EVConnectionTimeOut },
        },
      ])[0]
      if (zeroRes.attributeStatusInfo == null) {
        assert.fail('Expected attributeStatusInfo to be defined')
      }
      if (zeroRes.attributeStatusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.strictEqual(
        zeroRes.attributeStatusInfo.reasonCode,
        ReasonCodeEnumType.ValuePositiveOnly
      )
      assert.ok(
        zeroRes.attributeStatusInfo.additionalInfo.includes('Positive integer > 0 required')
      )
      if (negRes.attributeStatusInfo == null) {
        assert.fail('Expected attributeStatusInfo to be defined')
      }
      if (negRes.attributeStatusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.strictEqual(
        negRes.attributeStatusInfo.reasonCode,
        ReasonCodeEnumType.ValuePositiveOnly
      )
      assert.ok(negRes.attributeStatusInfo.additionalInfo.includes('Positive integer > 0 required'))
      if (nonIntRes.attributeStatusInfo == null) {
        assert.fail('Expected attributeStatusInfo to be defined')
      }
      if (nonIntRes.attributeStatusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.strictEqual(nonIntRes.attributeStatusInfo.reasonCode, ReasonCodeEnumType.InvalidValue)
      assert.ok(nonIntRes.attributeStatusInfo.additionalInfo.includes('Positive integer'))
    })

    await it('should validate MessageTimeout positive integer >0 and reject invalid', () => {
      const okRes = manager.setVariables(station, [
        {
          attributeValue: (Constants.DEFAULT_CONNECTION_TIMEOUT + 5).toString(),
          component: { instance: 'Default', name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageTimeout },
        },
      ])[0]
      assert.strictEqual(okRes.attributeStatus, SetVariableStatusEnumType.Accepted)
      assert.strictEqual(okRes.attributeStatusInfo, undefined)
      const zeroRes = manager.setVariables(station, [
        {
          attributeValue: '0',
          component: { instance: 'Default', name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageTimeout },
        },
      ])[0]
      const negRes = manager.setVariables(station, [
        {
          attributeValue: '-25',
          component: { instance: 'Default', name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageTimeout },
        },
      ])[0]
      const nonIntRes = manager.setVariables(station, [
        {
          attributeValue: '30.9',
          component: { instance: 'Default', name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageTimeout },
        },
      ])[0]
      if (zeroRes.attributeStatusInfo == null) {
        assert.fail('Expected attributeStatusInfo to be defined')
      }
      if (zeroRes.attributeStatusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.strictEqual(
        zeroRes.attributeStatusInfo.reasonCode,
        ReasonCodeEnumType.ValuePositiveOnly
      )
      assert.ok(
        zeroRes.attributeStatusInfo.additionalInfo.includes('Positive integer > 0 required')
      )
      if (negRes.attributeStatusInfo == null) {
        assert.fail('Expected attributeStatusInfo to be defined')
      }
      if (negRes.attributeStatusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.strictEqual(
        negRes.attributeStatusInfo.reasonCode,
        ReasonCodeEnumType.ValuePositiveOnly
      )
      assert.ok(negRes.attributeStatusInfo.additionalInfo.includes('Positive integer > 0 required'))
      if (nonIntRes.attributeStatusInfo == null) {
        assert.fail('Expected attributeStatusInfo to be defined')
      }
      if (nonIntRes.attributeStatusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.strictEqual(nonIntRes.attributeStatusInfo.reasonCode, ReasonCodeEnumType.InvalidValue)
      assert.ok(nonIntRes.attributeStatusInfo.additionalInfo.includes('Positive integer'))
    })

    await it('should avoid duplicate persistence operations when value unchanged', () => {
      const keyBefore = getConfigurationKey(
        station,
        OCPP20OptionalVariableName.HeartbeatInterval as unknown as VariableType['name']
      )
      assert.notStrictEqual(keyBefore, undefined)
      const originalValue = keyBefore?.value
      const first = manager.setVariables(station, [
        {
          attributeValue: originalValue ?? '30',
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      assert.strictEqual(first.attributeStatus, SetVariableStatusEnumType.Accepted)
      const changed = manager.setVariables(station, [
        {
          attributeValue: (parseInt(originalValue ?? '30', 10) + 5).toString(),
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      assert.strictEqual(changed.attributeStatus, SetVariableStatusEnumType.Accepted)
      const keyAfterChange = getConfigurationKey(
        station,
        OCPP20OptionalVariableName.HeartbeatInterval as unknown as VariableType['name']
      )
      assert.notStrictEqual(keyAfterChange?.value, originalValue)
      const reverted = manager.setVariables(station, [
        {
          attributeValue: originalValue ?? '30',
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      assert.strictEqual(reverted.attributeStatus, SetVariableStatusEnumType.Accepted)
      const keyAfterRevert = getConfigurationKey(
        station,
        OCPP20OptionalVariableName.HeartbeatInterval as unknown as VariableType['name']
      )
      assert.strictEqual(keyAfterRevert?.value, originalValue)
    })

    await it('should add missing configuration key with default during self-check', () => {
      deleteConfigurationKey(
        station,
        OCPP20RequiredVariableName.EVConnectionTimeOut as unknown as VariableType['name'],
        { save: false }
      )
      const before = getConfigurationKey(
        station,
        OCPP20RequiredVariableName.EVConnectionTimeOut as unknown as VariableType['name']
      )
      assert.strictEqual(before, undefined)
      const res = manager.getVariables(station, [
        {
          component: { name: OCPP20ComponentName.TxCtrlr },
          variable: { name: OCPP20RequiredVariableName.EVConnectionTimeOut },
        },
      ])[0]
      assert.strictEqual(res.attributeStatus, GetVariableStatusEnumType.Accepted)
      assert.strictEqual(res.attributeStatusInfo, undefined)
      assert.strictEqual(res.attributeValue, Constants.DEFAULT_EV_CONNECTION_TIMEOUT.toString())
      const after = getConfigurationKey(
        station,
        OCPP20RequiredVariableName.EVConnectionTimeOut as unknown as VariableType['name']
      )
      assert.notStrictEqual(after, undefined)
    })

    await it('should clear runtime overrides via resetRuntimeOverrides()', () => {
      manager.setVariables(station, [
        {
          attributeValue: '123',
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ])
      const beforeReset = manager.getVariables(station, [
        {
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ])[0]
      assert.strictEqual(beforeReset.attributeValue, '123')
      manager.resetRuntimeOverrides()
      const afterReset = manager.getVariables(station, [
        {
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ])[0]
      assert.notStrictEqual(afterReset.attributeValue, '123')
      assert.strictEqual(afterReset.attributeValue, '30')
    })

    await it('should reject HeartbeatInterval with leading whitespace', () => {
      const res = manager.setVariables(station, [
        {
          attributeValue: ' 60',
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      assert.strictEqual(res.attributeStatus, SetVariableStatusEnumType.Rejected)
      if (res.attributeStatusInfo == null) {
        assert.fail('Expected attributeStatusInfo to be defined')
      }
      if (res.attributeStatusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.strictEqual(res.attributeStatusInfo.reasonCode, ReasonCodeEnumType.InvalidValue)
      assert.ok(
        res.attributeStatusInfo.additionalInfo.includes('Non-empty digits only string required')
      )
    })

    await it('should reject HeartbeatInterval with trailing whitespace', () => {
      const res = manager.setVariables(station, [
        {
          attributeValue: '60 ',
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      assert.strictEqual(res.attributeStatus, SetVariableStatusEnumType.Rejected)
      if (res.attributeStatusInfo == null) {
        assert.fail('Expected attributeStatusInfo to be defined')
      }
      if (res.attributeStatusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.strictEqual(res.attributeStatusInfo.reasonCode, ReasonCodeEnumType.InvalidValue)
      assert.ok(
        res.attributeStatusInfo.additionalInfo.includes('Non-empty digits only string required')
      )
    })

    await it('should reject HeartbeatInterval with plus sign prefix', () => {
      const res = manager.setVariables(station, [
        {
          attributeValue: '+10',
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      assert.strictEqual(res.attributeStatus, SetVariableStatusEnumType.Rejected)
      if (res.attributeStatusInfo == null) {
        assert.fail('Expected attributeStatusInfo to be defined')
      }
      if (res.attributeStatusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.strictEqual(res.attributeStatusInfo.reasonCode, ReasonCodeEnumType.InvalidValue)
      assert.ok(
        res.attributeStatusInfo.additionalInfo.includes('Non-empty digits only string required')
      )
    })

    await it('should accept HeartbeatInterval with leading zeros', () => {
      const res = manager.setVariables(station, [
        {
          attributeValue: '007',
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      assert.strictEqual(res.attributeStatus, SetVariableStatusEnumType.Accepted)
      assert.strictEqual(res.attributeStatusInfo, undefined)
    })

    await it('should reject HeartbeatInterval blank string', () => {
      const res = manager.setVariables(station, [
        {
          attributeValue: '',
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      assert.strictEqual(res.attributeStatus, SetVariableStatusEnumType.Rejected)
      if (res.attributeStatusInfo == null) {
        assert.fail('Expected attributeStatusInfo to be defined')
      }
      if (res.attributeStatusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.strictEqual(res.attributeStatusInfo.reasonCode, ReasonCodeEnumType.InvalidValue)
      assert.ok(
        res.attributeStatusInfo.additionalInfo.includes('Non-empty digits only string required')
      )
    })

    await it('should reject HeartbeatInterval with internal space', () => {
      const res = manager.setVariables(station, [
        {
          attributeValue: '6 0',
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      assert.strictEqual(res.attributeStatus, SetVariableStatusEnumType.Rejected)
      if (res.attributeStatusInfo == null) {
        assert.fail('Expected attributeStatusInfo to be defined')
      }
      if (res.attributeStatusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.strictEqual(res.attributeStatusInfo.reasonCode, ReasonCodeEnumType.InvalidValue)
      assert.ok(
        res.attributeStatusInfo.additionalInfo.includes('Non-empty digits only string required')
      )
    })

    await it('should reject ConnectionUrl missing scheme', () => {
      const res = manager.setVariables(station, [
        {
          attributeValue: 'example.com/ocpp',
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      assert.strictEqual(res.attributeStatus, SetVariableStatusEnumType.Rejected)
      if (res.attributeStatusInfo == null) {
        assert.fail('Expected attributeStatusInfo to be defined')
      }
      if (res.attributeStatusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.strictEqual(res.attributeStatusInfo.reasonCode, ReasonCodeEnumType.InvalidURL)
      assert.ok(res.attributeStatusInfo.additionalInfo.includes('Invalid URL format'))
    })

    await it('should reject ConnectionUrl exceeding max length', () => {
      const longUrl = 'wss://example.com/' + 'a'.repeat(600)
      const res = manager.setVariables(station, [
        {
          attributeValue: longUrl,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      assert.strictEqual(res.attributeStatus, SetVariableStatusEnumType.Rejected)
      if (res.attributeStatusInfo == null) {
        assert.fail('Expected attributeStatusInfo to be defined')
      }
      if (res.attributeStatusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.strictEqual(res.attributeStatusInfo.reasonCode, ReasonCodeEnumType.InvalidValue)
      assert.ok(
        res.attributeStatusInfo.additionalInfo.includes(
          `exceeds maximum length (${CONNECTION_URL_MAX_LENGTH.toString()})`
        )
      )
    })

    await it('should reject HeartbeatInterval exceeding max length', () => {
      const res = manager.setVariables(station, [
        {
          attributeValue: '1'.repeat(11),
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ])[0]
      assert.strictEqual(res.attributeStatus, SetVariableStatusEnumType.Rejected)
      if (res.attributeStatusInfo == null) {
        assert.fail('Expected attributeStatusInfo to be defined')
      }
      if (res.attributeStatusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.strictEqual(res.attributeStatusInfo.reasonCode, ReasonCodeEnumType.InvalidValue)
      const HEARTBEAT_INTERVAL_MAX_LENGTH =
        VARIABLE_REGISTRY[
          `${OCPP20ComponentName.OCPPCommCtrlr}::${OCPP20OptionalVariableName.HeartbeatInterval}`
        ].maxLength ?? 10
      assert.ok(
        res.attributeStatusInfo.additionalInfo.includes(
          `exceeds maximum length (${HEARTBEAT_INTERVAL_MAX_LENGTH.toString()})`
        )
      )
    })

    // Effective value size limit tests combining ConfigurationValueSize and ValueSize
    await it('should enforce ConfigurationValueSize when ValueSize unset', () => {
      resetValueSizeLimits(station)
      setConfigurationValueSize(station, 50)
      // remove ValueSize to simulate unset
      deleteConfigurationKey(
        station,
        OCPP20RequiredVariableName.ValueSize as unknown as VariableType['name'],
        { save: false }
      )
      const okRes = manager.setVariables(station, [
        {
          attributeValue: buildWsExampleUrl(50, 'x'),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      assert.strictEqual(okRes.attributeStatus, SetVariableStatusEnumType.Accepted)
      const tooLongRes = manager.setVariables(station, [
        {
          attributeValue: buildWsExampleUrl(51, 'x'),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      assert.strictEqual(tooLongRes.attributeStatus, SetVariableStatusEnumType.Rejected)
      assert.strictEqual(
        tooLongRes.attributeStatusInfo?.reasonCode,
        ReasonCodeEnumType.TooLargeElement
      )
    })

    await it('should enforce ValueSize when ConfigurationValueSize unset', () => {
      resetValueSizeLimits(station)
      setValueSize(station, 40)
      deleteConfigurationKey(
        station,
        OCPP20RequiredVariableName.ConfigurationValueSize as unknown as VariableType['name'],
        { save: false }
      )
      const okRes = manager.setVariables(station, [
        {
          attributeValue: buildWsExampleUrl(40, 'y'),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      assert.strictEqual(okRes.attributeStatus, SetVariableStatusEnumType.Accepted)
      const tooLongRes = manager.setVariables(station, [
        {
          attributeValue: buildWsExampleUrl(41, 'y'),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      assert.strictEqual(tooLongRes.attributeStatus, SetVariableStatusEnumType.Rejected)
      assert.strictEqual(
        tooLongRes.attributeStatusInfo?.reasonCode,
        ReasonCodeEnumType.TooLargeElement
      )
    })

    await it('should use smaller of ConfigurationValueSize and ValueSize (ValueSize smaller)', () => {
      resetValueSizeLimits(station)
      setConfigurationValueSize(station, 60)
      setValueSize(station, 55)
      const okRes = manager.setVariables(station, [
        {
          attributeValue: buildWsExampleUrl(55, 'z'),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      assert.strictEqual(okRes.attributeStatus, SetVariableStatusEnumType.Accepted)
      const tooLongRes = manager.setVariables(station, [
        {
          attributeValue: buildWsExampleUrl(56, 'z'),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      assert.strictEqual(tooLongRes.attributeStatus, SetVariableStatusEnumType.Rejected)
      assert.strictEqual(
        tooLongRes.attributeStatusInfo?.reasonCode,
        ReasonCodeEnumType.TooLargeElement
      )
    })

    await it('should use smaller of ConfigurationValueSize and ValueSize (ConfigurationValueSize smaller)', () => {
      resetValueSizeLimits(station)
      setConfigurationValueSize(station, 30)
      setValueSize(station, 100)
      const okRes = manager.setVariables(station, [
        {
          attributeValue: buildWsExampleUrl(30, 'w'),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      assert.strictEqual(okRes.attributeStatus, SetVariableStatusEnumType.Accepted)
      const tooLongRes = manager.setVariables(station, [
        {
          attributeValue: buildWsExampleUrl(31, 'w'),
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      assert.strictEqual(tooLongRes.attributeStatus, SetVariableStatusEnumType.Rejected)
      assert.strictEqual(
        tooLongRes.attributeStatusInfo?.reasonCode,
        ReasonCodeEnumType.TooLargeElement
      )
    })

    await it('should fallback to default limit when both invalid/non-positive', () => {
      resetValueSizeLimits(station)
      // set invalid values
      setConfigurationValueSize(station, 0)
      setValueSize(station, -5)
      const okRes = manager.setVariables(station, [
        {
          attributeValue: buildWsExampleUrl(300, 'v'), // below default absolute max length
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      assert.strictEqual(okRes.attributeStatus, SetVariableStatusEnumType.Accepted)
    })
  })

  await describe('List validation tests', async () => {
    const manager = OCPP20VariableManager.getInstance()

    await it('should accept valid updates to writable list/sequence list variables and reject read-only', () => {
      const updateAttempts: OCPP20SetVariableDataType[] = [
        {
          attributeValue: 'HTTP,HTTPS', // FileTransferProtocols now ReadOnly -> expect rejection
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.FileTransferProtocols },
        },
        {
          attributeValue: 'Heartbeat,NTP,GPS', // valid TimeSource reorder (RTC & Manual removed, RealTimeClock optional)
          component: { name: OCPP20ComponentName.ClockCtrlr },
          variable: { name: OCPP20RequiredVariableName.TimeSource },
        },
        {
          attributeValue: 'Authorized,EVConnected,PowerPathClosed',
          component: { name: OCPP20ComponentName.TxCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxStartPoint },
        },
        {
          attributeValue: 'EVConnected,PowerPathClosed',
          component: { name: OCPP20ComponentName.TxCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxStopPoint },
        },
        {
          attributeValue: `${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER},${OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT},${OCPP20MeasurandEnumType.VOLTAGE}`,
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxStartedMeasurands },
        },
        {
          attributeValue: `${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER},${OCPP20MeasurandEnumType.CURRENT_IMPORT},${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL}`,
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxEndedMeasurands },
        },
        {
          attributeValue: `${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER},${OCPP20MeasurandEnumType.CURRENT_IMPORT}`,
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedMeasurands },
        },
      ]
      const results = manager.setVariables(station, updateAttempts)
      // First (FileTransferProtocols) should be rejected (ReadOnly); others accepted
      assert.strictEqual(results[0].attributeStatus, SetVariableStatusEnumType.Rejected)
      assert.strictEqual(results[0].attributeStatusInfo?.reasonCode, ReasonCodeEnumType.ReadOnly)
      for (const r of results.slice(1)) {
        assert.strictEqual(r.attributeStatus, SetVariableStatusEnumType.Accepted)
      }
    })

    await it('should retrieve FileTransferProtocols default including FTPS (ReadOnly)', () => {
      const getRes = manager.getVariables(station, [
        {
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.FileTransferProtocols },
        },
      ])[0]
      assert.strictEqual(getRes.attributeStatus, GetVariableStatusEnumType.Accepted)
      assert.strictEqual(getRes.attributeValue, 'HTTPS,FTPS,SFTP')
    })

    await it('should keep FileTransferProtocols value unchanged after rejected update attempt', () => {
      // First ensure the configuration key exists by calling getVariables (triggers self-check)
      // Each test gets a fresh station, so we must initialize the configuration key
      const initGet = manager.getVariables(station, [
        {
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.FileTransferProtocols },
        },
      ])[0]
      assert.strictEqual(initGet.attributeStatus, GetVariableStatusEnumType.Accepted)
      assert.strictEqual(initGet.attributeValue, 'HTTPS,FTPS,SFTP')

      const beforeCfg = getConfigurationKey(
        station,
        OCPP20RequiredVariableName.FileTransferProtocols as unknown as VariableType['name']
      )
      assert.strictEqual(beforeCfg?.value, 'HTTPS,FTPS,SFTP')
      const rejected = manager.setVariables(station, [
        {
          attributeValue: 'HTTP,HTTPS',
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.FileTransferProtocols },
        },
      ])[0]
      assert.strictEqual(rejected.attributeStatus, SetVariableStatusEnumType.Rejected)
      assert.strictEqual(rejected.attributeStatusInfo?.reasonCode, ReasonCodeEnumType.ReadOnly)
      const afterGet = manager.getVariables(station, [
        {
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.FileTransferProtocols },
        },
      ])[0]
      assert.strictEqual(afterGet.attributeStatus, GetVariableStatusEnumType.Accepted)
      assert.strictEqual(afterGet.attributeValue, 'HTTPS,FTPS,SFTP')
      const afterCfg = getConfigurationKey(
        station,
        OCPP20RequiredVariableName.FileTransferProtocols as unknown as VariableType['name']
      )
      assert.strictEqual(afterCfg?.value, beforeCfg.value)
    })

    await it('should reject removed TimeSource members RTC and Manual', () => {
      const res = manager.setVariables(station, [
        {
          attributeValue: 'NTP,GPS,RTC,Manual', // RTC & Manual no longer valid
          component: { name: OCPP20ComponentName.ClockCtrlr },
          variable: { name: OCPP20RequiredVariableName.TimeSource },
        },
      ])[0]
      assert.strictEqual(res.attributeStatus, SetVariableStatusEnumType.Rejected)
      if (res.attributeStatusInfo == null) {
        assert.fail('Expected attributeStatusInfo to be defined')
      }
      if (res.attributeStatusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.strictEqual(res.attributeStatusInfo.reasonCode, ReasonCodeEnumType.InvalidValue)
      assert.ok(res.attributeStatusInfo.additionalInfo.includes('Member not in enumeration'))
    })

    await it('should accept extended TimeSource including RealTimeClock and MobileNetwork', () => {
      const res = manager.setVariables(station, [
        {
          attributeValue: 'MobileNetwork,Heartbeat,NTP,GPS,RealTimeClock',
          component: { name: OCPP20ComponentName.ClockCtrlr },
          variable: { name: OCPP20RequiredVariableName.TimeSource },
        },
      ])[0]
      assert.strictEqual(res.attributeStatus, SetVariableStatusEnumType.Accepted)
    })

    await it('should reject invalid list formats and members', () => {
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
          const res = manager.setVariables(station, [
            {
              attributeValue: pattern,
              component: { name: lv.component },
              variable: { name: lv.name },
            },
          ])[0]
          assert.strictEqual(res.attributeStatus, SetVariableStatusEnumType.Rejected)
          if (res.attributeStatusInfo == null) {
            assert.fail('Expected attributeStatusInfo to be defined')
          }
          if (lv.name === OCPP20RequiredVariableName.FileTransferProtocols) {
            assert.strictEqual(res.attributeStatusInfo.reasonCode, ReasonCodeEnumType.ReadOnly)
          } else {
            assert.strictEqual(res.attributeStatusInfo.reasonCode, ReasonCodeEnumType.InvalidValue)
          }
          if (lv.name === OCPP20RequiredVariableName.FileTransferProtocols) {
            // Read-only variable: additionalInfo reflects read-only status, skip format/member detail assertions
            continue
          }
          if (res.attributeStatusInfo.additionalInfo == null) {
            assert.fail('Expected additionalInfo to be defined')
          }
          if (pattern === '') {
            assert.ok(res.attributeStatusInfo.additionalInfo.includes('List cannot be empty'))
          } else if (pattern.startsWith(',') || pattern.endsWith(',')) {
            assert.ok(res.attributeStatusInfo.additionalInfo.includes('No leading/trailing comma'))
          } else if (pattern.includes(',,')) {
            assert.ok(res.attributeStatusInfo.additionalInfo.includes('Empty list member'))
          } else if (pattern === 'HTTP,HTTP') {
            assert.ok(res.attributeStatusInfo.additionalInfo.includes('Duplicate list member'))
          }
        }
      }
    })
  })

  await it('should reject DataSigned in TxStopPoint list value', () => {
    const manager = OCPP20VariableManager.getInstance()
    const res = manager.setVariables(station, [
      {
        attributeValue: 'Authorized,EVConnected,DataSigned', // DataSigned invalid for stop point enumeration
        component: { name: OCPP20ComponentName.TxCtrlr },
        variable: { name: OCPP20RequiredVariableName.TxStopPoint },
      },
    ])[0]
    assert.strictEqual(res.attributeStatus, SetVariableStatusEnumType.Rejected)
    if (res.attributeStatusInfo == null) {
      assert.fail('Expected attributeStatusInfo to be defined')
    }
    if (res.attributeStatusInfo.additionalInfo == null) {
      assert.fail('Expected additionalInfo to be defined')
    }
    assert.strictEqual(res.attributeStatusInfo.reasonCode, ReasonCodeEnumType.InvalidValue)
    assert.ok(res.attributeStatusInfo.additionalInfo.includes('Member not in enumeration'))
  })

  await describe('Unsupported MinSet/MaxSet attribute tests', async () => {
    const manager = OCPP20VariableManager.getInstance()
    const { station } = createMockChargingStation({
      baseName: 'MMStation',
      connectorsCount: 3,
      evseConfiguration: { evsesCount: 3 },
      heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
      stationInfo: {
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
    })

    await it('should return NotSupportedAttributeType for MinSet HeartbeatInterval', () => {
      const component = { name: OCPP20ComponentName.OCPPCommCtrlr }
      const variable = { name: OCPP20OptionalVariableName.HeartbeatInterval }
      const res = manager.getVariables(station, [
        { attributeType: AttributeEnumType.MinSet, component, variable },
      ])[0]
      assert.strictEqual(res.attributeStatus, GetVariableStatusEnumType.NotSupportedAttributeType)
      assert.strictEqual(res.attributeStatusInfo?.reasonCode, ReasonCodeEnumType.UnsupportedParam)
    })

    await it('should return NotSupportedAttributeType for MaxSet WebSocketPingInterval', () => {
      const component = { name: OCPP20ComponentName.ChargingStation }
      const variable = { name: OCPP20OptionalVariableName.WebSocketPingInterval }
      const res = manager.getVariables(station, [
        { attributeType: AttributeEnumType.MaxSet, component, variable },
      ])[0]
      assert.strictEqual(res.attributeStatus, GetVariableStatusEnumType.NotSupportedAttributeType)
      assert.strictEqual(res.attributeStatusInfo?.reasonCode, ReasonCodeEnumType.UnsupportedParam)
    })
  })

  await describe('Get-time value truncation tests', async () => {
    const manager = OCPP20VariableManager.getInstance()

    await it('should truncate retrieved value using ValueSize only when ReportingValueSize absent', () => {
      resetValueSizeLimits(station)
      // Ensure ReportingValueSize unset
      deleteConfigurationKey(
        station,
        OCPP20RequiredVariableName.ReportingValueSize as unknown as VariableType['name'],
        { save: false }
      )
      // Temporarily set large ValueSize to allow storing long value
      setValueSize(station, 200)
      const longUrl = buildWsExampleUrl(180, 'a')
      const setRes = manager.setVariables(station, [
        {
          attributeValue: longUrl,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      assert.strictEqual(setRes.attributeStatus, SetVariableStatusEnumType.Accepted)
      // Now reduce ValueSize to 50 to force truncation at get-time
      setValueSize(station, 50)
      const getRes = manager.getVariables(station, [
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      assert.strictEqual(getRes.attributeStatus, GetVariableStatusEnumType.Accepted)
      assert.strictEqual(getRes.attributeValue?.length, 50)
      // First 50 chars should match original long value prefix
      assert.ok(longUrl.startsWith(getRes.attributeValue ?? ''))
      resetValueSizeLimits(station)
    })

    await it('should apply ValueSize then ReportingValueSize sequential truncation', () => {
      resetValueSizeLimits(station)
      // Store long value with large limits
      setValueSize(station, 300)
      setReportingValueSize(station, 250) // will be applied second
      const longUrl = buildWsExampleUrl(260, 'b')
      const setRes = manager.setVariables(station, [
        {
          attributeValue: longUrl,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      assert.strictEqual(setRes.attributeStatus, SetVariableStatusEnumType.Accepted)
      // Reduce ValueSize below ReportingValueSize to 200 so first truncation occurs at 200, then second at 150
      setValueSize(station, 200)
      setReportingValueSize(station, 150)
      const getRes = manager.getVariables(station, [
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      assert.strictEqual(getRes.attributeStatus, GetVariableStatusEnumType.Accepted)
      assert.strictEqual(getRes.attributeValue?.length, 150)
      assert.ok(longUrl.startsWith(getRes.attributeValue ?? ''))
      resetValueSizeLimits(station)
      resetReportingValueSize(station)
    })

    await it('should enforce absolute max character cap after truncation chain', () => {
      resetValueSizeLimits(station)
      resetReportingValueSize(station)
      // Directly upsert configuration key with > absolute max length value bypassing set-time limit (which rejects > absolute max length)
      const overLongValue = buildWsExampleUrl(3000, 'c')
      upsertConfigurationKey(
        station,
        OCPP20VendorVariableName.ConnectionUrl as unknown as VariableType['name'],
        overLongValue
      )
      // Set generous ValueSize (1500) and ReportingValueSize (1400) so only absolute cap applies (since both < Constants.OCPP_VALUE_ABSOLUTE_MAX_LENGTH)
      setValueSize(station, 1500)
      setReportingValueSize(station, 1400)
      const getRes = manager.getVariables(station, [
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      assert.strictEqual(getRes.attributeStatus, GetVariableStatusEnumType.Accepted)
      assert.strictEqual(getRes.attributeValue?.length, 1400)
      assert.ok(overLongValue.startsWith(getRes.attributeValue ?? ''))
      resetValueSizeLimits(station)
      resetReportingValueSize(station)
    })

    await it('should not exceed variable maxLength even if ValueSize and ReportingValueSize set above it', () => {
      resetValueSizeLimits(station)
      resetReportingValueSize(station)
      // Store exactly variable maxLength value via setVariables (allowed per registry/spec)
      const connectionUrlMaxLength =
        VARIABLE_REGISTRY[
          `${OCPP20ComponentName.ChargingStation}::${OCPP20VendorVariableName.ConnectionUrl}`
        ].maxLength ?? 512
      const maxLenValue = buildWsExampleUrl(connectionUrlMaxLength, 'd')
      const setRes = manager.setVariables(station, [
        {
          attributeValue: maxLenValue,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      assert.strictEqual(setRes.attributeStatus, SetVariableStatusEnumType.Accepted)
      // Set larger limits that would allow a bigger value if not for variable-level maxLength
      setValueSize(station, 3000)
      setReportingValueSize(station, 2800)
      const getRes = manager.getVariables(station, [
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20VendorVariableName.ConnectionUrl },
        },
      ])[0]
      assert.strictEqual(getRes.attributeStatus, GetVariableStatusEnumType.Accepted)
      assert.strictEqual(getRes.attributeValue?.length, connectionUrlMaxLength)
      assert.strictEqual(getRes.attributeValue, maxLenValue)
      resetValueSizeLimits(station)
      resetReportingValueSize(station)
    })
  })

  await describe('Additional persistence and instance-scoped variable tests', async () => {
    const manager = OCPP20VariableManager.getInstance()

    await it('should auto-create persistent OrganizationName configuration key during self-check', () => {
      deleteConfigurationKey(
        station,
        OCPP20RequiredVariableName.OrganizationName as unknown as VariableType['name'],
        { save: false }
      )
      const before = getConfigurationKey(
        station,
        OCPP20RequiredVariableName.OrganizationName as unknown as VariableType['name']
      )
      assert.strictEqual(before, undefined)
      const res = manager.getVariables(station, [
        {
          component: { name: OCPP20ComponentName.SecurityCtrlr },
          variable: { name: OCPP20RequiredVariableName.OrganizationName },
        },
      ])[0]
      assert.strictEqual(res.attributeStatus, GetVariableStatusEnumType.Accepted)
      assert.strictEqual(res.attributeValue, 'Example Charging Services Ltd')
      const after = getConfigurationKey(
        station,
        OCPP20RequiredVariableName.OrganizationName as unknown as VariableType['name']
      )
      assert.notStrictEqual(after, undefined)
      assert.strictEqual(after?.value, 'Example Charging Services Ltd')
    })

    await it('should accept setting OrganizationName and require reboot per OCPP 2.0.1 specification', () => {
      const setRes = manager.setVariables(station, [
        {
          attributeValue: 'NewOrgName',
          component: { name: OCPP20ComponentName.SecurityCtrlr },
          variable: { name: OCPP20RequiredVariableName.OrganizationName },
        },
      ])[0]
      // OCPP 2.0.1 compliant behavior: OrganizationName changes require reboot
      assert.strictEqual(setRes.attributeStatus, SetVariableStatusEnumType.RebootRequired)
      const getRes = manager.getVariables(station, [
        {
          component: { name: OCPP20ComponentName.SecurityCtrlr },
          variable: { name: OCPP20RequiredVariableName.OrganizationName },
        },
      ])[0]
      assert.strictEqual(getRes.attributeValue, 'NewOrgName')
    })

    await it('should preserve OrganizationName value after resetRuntimeOverrides()', () => {
      // First set OrganizationName to ensure it's persisted (test must be self-contained)
      manager.setVariables(station, [
        {
          attributeValue: 'PersistenceTestOrgName',
          component: { name: OCPP20ComponentName.SecurityCtrlr },
          variable: { name: OCPP20RequiredVariableName.OrganizationName },
        },
      ])
      // Now reset runtime overrides
      manager.resetRuntimeOverrides()
      const res = manager.getVariables(station, [
        {
          component: { name: OCPP20ComponentName.SecurityCtrlr },
          variable: { name: OCPP20RequiredVariableName.OrganizationName },
        },
      ])[0]
      assert.strictEqual(res.attributeStatus, GetVariableStatusEnumType.Accepted)
      // Value should persist as 'PersistenceTestOrgName' after resetRuntimeOverrides (OCPP 2.0.1 compliant persistence)
      assert.strictEqual(res.attributeValue, 'PersistenceTestOrgName')
    })

    await it('should create configuration key for instance-scoped MessageAttemptInterval and persist Actual value (Actual-only, no MinSet/MaxSet)', () => {
      // Ensure no configuration key exists before operations
      const cfgBefore = getConfigurationKey(
        station,
        OCPP20RequiredVariableName.MessageAttemptInterval as unknown as VariableType['name']
      )
      assert.strictEqual(cfgBefore, undefined)
      const initialGet = manager.getVariables(station, [
        {
          component: { instance: 'TransactionEvent', name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageAttemptInterval },
        },
      ])[0]
      assert.strictEqual(initialGet.attributeStatus, GetVariableStatusEnumType.Accepted)
      assert.strictEqual(initialGet.attributeValue, '5')

      // Negative: MinSet not supported
      const minSetRes = manager.setVariables(station, [
        {
          attributeType: AttributeEnumType.MinSet,
          attributeValue: '6',
          component: { instance: 'TransactionEvent', name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageAttemptInterval },
        },
      ])[0]
      assert.strictEqual(
        minSetRes.attributeStatus,
        SetVariableStatusEnumType.NotSupportedAttributeType
      )
      const getMin = manager.getVariables(station, [
        {
          attributeType: AttributeEnumType.MinSet,
          component: { instance: 'TransactionEvent', name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageAttemptInterval },
        },
      ])[0]
      assert.strictEqual(
        getMin.attributeStatus,
        GetVariableStatusEnumType.NotSupportedAttributeType
      )

      // Negative: MaxSet not supported
      const maxSetRes = manager.setVariables(station, [
        {
          attributeType: AttributeEnumType.MaxSet,
          attributeValue: '10',
          component: { instance: 'TransactionEvent', name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageAttemptInterval },
        },
      ])[0]
      assert.strictEqual(
        maxSetRes.attributeStatus,
        SetVariableStatusEnumType.NotSupportedAttributeType
      )
      const getMax = manager.getVariables(station, [
        {
          attributeType: AttributeEnumType.MaxSet,
          component: { instance: 'TransactionEvent', name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageAttemptInterval },
        },
      ])[0]
      assert.strictEqual(
        getMax.attributeStatus,
        GetVariableStatusEnumType.NotSupportedAttributeType
      )

      // Attempt Actual value below registry min (min=1) -> reject
      const belowMinRes = manager.setVariables(station, [
        {
          attributeValue: '0',
          component: { instance: 'TransactionEvent', name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageAttemptInterval },
        },
      ])[0]
      assert.strictEqual(belowMinRes.attributeStatus, SetVariableStatusEnumType.Rejected)
      assert.strictEqual(
        belowMinRes.attributeStatusInfo?.reasonCode,
        ReasonCodeEnumType.ValuePositiveOnly
      )

      // Attempt Actual value above registry max (max=3600) -> reject
      const aboveMaxRes = manager.setVariables(station, [
        {
          attributeValue: '3601',
          component: { instance: 'TransactionEvent', name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageAttemptInterval },
        },
      ])[0]
      assert.strictEqual(aboveMaxRes.attributeStatus, SetVariableStatusEnumType.Rejected)
      assert.strictEqual(
        aboveMaxRes.attributeStatusInfo?.reasonCode,
        ReasonCodeEnumType.ValueTooHigh
      )

      // Accept Actual value within metadata bounds
      const withinRes = manager.setVariables(station, [
        {
          attributeValue: '7',
          component: { instance: 'TransactionEvent', name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageAttemptInterval },
        },
      ])[0]
      assert.strictEqual(withinRes.attributeStatus, SetVariableStatusEnumType.Accepted)

      // Retrieval now returns persisted value '7'
      const afterSetGet = manager.getVariables(station, [
        {
          component: { instance: 'TransactionEvent', name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageAttemptInterval },
        },
      ])[0]
      assert.strictEqual(afterSetGet.attributeStatus, GetVariableStatusEnumType.Accepted)
      assert.strictEqual(afterSetGet.attributeValue, '7')

      const cfgAfter = getConfigurationKey(
        station,
        OCPP20RequiredVariableName.MessageAttemptInterval as unknown as VariableType['name']
      )
      assert.notStrictEqual(cfgAfter, undefined)
      assert.strictEqual(cfgAfter?.value, '7')
    })
  })
})
