/**
 * @file Tests for OCPP20IncomingRequestService GetVariables
 * @description Unit tests for OCPP 2.0 GetVariables command handling (B06)
 */

import { millisecondsToSeconds } from 'date-fns'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import { OCPP20VariableManager } from '../../../../src/charging-station/ocpp/2.0/OCPP20VariableManager.js'
import {
  AttributeEnumType,
  GetVariableStatusEnumType,
  OCPP20ComponentName,
  type OCPP20GetVariablesRequest,
  OCPP20MeasurandEnumType,
  OCPP20OptionalVariableName,
  OCPP20RequiredVariableName,
  OCPP20VendorVariableName,
  OCPPVersion,
  ReasonCodeEnumType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import {
  TEST_CHARGING_STATION_BASE_NAME,
  TEST_CONNECTOR_ID_VALID_INSTANCE,
} from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../helpers/StationHelpers.js'
import {
  resetLimits,
  resetReportingValueSize,
  setReportingValueSize,
  setStrictLimits,
  setValueSize,
} from './OCPP20TestUtils.js'

await describe('B06 - Get Variables', async () => {
  let station: ReturnType<typeof createMockChargingStation>['station']
  let incomingRequestService: OCPP20IncomingRequestService

  beforeEach(() => {
    const { station: newStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 3,
      evseConfiguration: { evsesCount: 3 },
      stationInfo: {
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
    })
    station = newStation
    incomingRequestService = new OCPP20IncomingRequestService()
  })

  // Reset singleton state after each test to ensure test isolation
  afterEach(() => {
    standardCleanup()
    OCPP20VariableManager.getInstance().resetRuntimeOverrides()
  })

  // FR: B06.FR.01
  await it('should handle GetVariables request with valid variables', () => {
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          attributeType: AttributeEnumType.Actual,
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
      ],
    }

    const response = incomingRequestService.handleRequestGetVariables(station, request)

    assert.notStrictEqual(response, undefined)
    assert.notStrictEqual(response.getVariableResult, undefined)
    assert.ok(Array.isArray(response.getVariableResult))
    assert.strictEqual(response.getVariableResult.length, 2)

    // Check first variable (HeartbeatInterval)
    const firstResult = response.getVariableResult[0]
    assert.strictEqual(firstResult.attributeStatus, GetVariableStatusEnumType.Accepted)
    assert.strictEqual(firstResult.attributeType, AttributeEnumType.Actual)
    assert.strictEqual(
      firstResult.attributeValue,
      millisecondsToSeconds(Constants.DEFAULT_HEARTBEAT_INTERVAL_MS).toString()
    )
    assert.strictEqual(firstResult.component.name, OCPP20ComponentName.OCPPCommCtrlr)
    assert.strictEqual(firstResult.variable.name, OCPP20OptionalVariableName.HeartbeatInterval)
    assert.strictEqual(firstResult.attributeStatusInfo, undefined)

    // Check second variable (WebSocketPingInterval)
    const secondResult = response.getVariableResult[1]
    assert.strictEqual(secondResult.attributeStatus, GetVariableStatusEnumType.Accepted)
    assert.strictEqual(secondResult.attributeType, AttributeEnumType.Actual)
    assert.strictEqual(
      secondResult.attributeValue,
      Constants.DEFAULT_WS_PING_INTERVAL_SECONDS.toString()
    )
    assert.strictEqual(secondResult.component.name, OCPP20ComponentName.ChargingStation)
    assert.strictEqual(secondResult.variable.name, OCPP20OptionalVariableName.WebSocketPingInterval)
    assert.strictEqual(secondResult.attributeStatusInfo, undefined)
  })

  // FR: B06.FR.02
  await it('should handle GetVariables request with invalid variables', () => {
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: 'InvalidVariable' },
        },
        {
          component: { name: 'InvalidComponent' },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ],
    }

    const response = incomingRequestService.handleRequestGetVariables(station, request)

    assert.notStrictEqual(response, undefined)
    assert.notStrictEqual(response.getVariableResult, undefined)
    assert.ok(Array.isArray(response.getVariableResult))
    assert.strictEqual(response.getVariableResult.length, 2)

    // Check first variable (should be UnknownVariable)
    const firstResult = response.getVariableResult[0]
    assert.strictEqual(firstResult.attributeStatus, GetVariableStatusEnumType.UnknownVariable)
    // Defaulted attributeType now Actual, not undefined
    assert.strictEqual(firstResult.attributeType, AttributeEnumType.Actual)
    assert.strictEqual(firstResult.attributeValue, undefined)
    assert.strictEqual(firstResult.component.name, OCPP20ComponentName.ChargingStation)
    assert.strictEqual(firstResult.variable.name, 'InvalidVariable')
    assert.notStrictEqual(firstResult.attributeStatusInfo, undefined)

    // Check second variable (should be UnknownComponent)
    const secondResult = response.getVariableResult[1]
    assert.strictEqual(secondResult.attributeStatus, GetVariableStatusEnumType.UnknownComponent)
    // Defaulted attributeType now Actual, not undefined
    assert.strictEqual(secondResult.attributeType, AttributeEnumType.Actual)
    assert.strictEqual(secondResult.attributeValue, undefined)
    assert.strictEqual(secondResult.component.name, 'InvalidComponent')
    assert.strictEqual(secondResult.variable.name, OCPP20OptionalVariableName.HeartbeatInterval)
    assert.notStrictEqual(secondResult.attributeStatusInfo, undefined)
  })

  // FR: B06.FR.03
  await it('should handle GetVariables request with unsupported attribute types', () => {
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          attributeType: AttributeEnumType.Target, // Not supported for HeartbeatInterval
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ],
    }

    const response = incomingRequestService.handleRequestGetVariables(station, request)

    assert.notStrictEqual(response, undefined)
    assert.notStrictEqual(response.getVariableResult, undefined)
    assert.ok(Array.isArray(response.getVariableResult))
    assert.strictEqual(response.getVariableResult.length, 1)

    const result = response.getVariableResult[0]
    assert.strictEqual(result.attributeStatus, GetVariableStatusEnumType.NotSupportedAttributeType)
  })

  // FR: B06.FR.04
  await it('should reject AuthorizeRemoteStart under Connector component', () => {
    resetLimits(station)
    resetReportingValueSize(station)
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          component: {
            instance: TEST_CONNECTOR_ID_VALID_INSTANCE,
            name: OCPP20ComponentName.Connector,
          },
          variable: { name: OCPP20RequiredVariableName.AuthorizeRemoteStart },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(station, request)
    assert.strictEqual(response.getVariableResult.length, 1)
    const result = response.getVariableResult[0]
    assert.strictEqual(result.attributeStatus, GetVariableStatusEnumType.UnknownComponent)
  })

  // FR: B06.FR.05
  await it('should reject Target attribute for WebSocketPingInterval', () => {
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          attributeType: AttributeEnumType.Target,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(station, request)
    assert.strictEqual(response.getVariableResult.length, 1)
    const result = response.getVariableResult[0]
    assert.strictEqual(result.attributeStatus, GetVariableStatusEnumType.NotSupportedAttributeType)
  })

  await it('should truncate variable value based on ReportingValueSize', () => {
    // Set size below actual value length to force truncation
    setReportingValueSize(station, 2)
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(station, request)
    const result = response.getVariableResult[0]
    assert.strictEqual(result.attributeStatus, GetVariableStatusEnumType.Accepted)
    assert.strictEqual(result.attributeValue?.length, 2)
    resetReportingValueSize(station)
  })

  await it('should allow ReportingValueSize retrieval from DeviceDataCtrlr', () => {
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          component: { name: OCPP20ComponentName.DeviceDataCtrlr },
          variable: { name: OCPP20OptionalVariableName.ReportingValueSize },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(station, request)
    const result = response.getVariableResult[0]
    assert.strictEqual(result.attributeStatus, GetVariableStatusEnumType.Accepted)
    assert.notStrictEqual(result.attributeValue, undefined)
  })

  await it('should enforce ItemsPerMessage limit', () => {
    setStrictLimits(station, 1, 10000)
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
        {
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(station, request)
    assert.strictEqual(response.getVariableResult.length, 2)
    for (const r of response.getVariableResult) {
      assert.strictEqual(r.attributeStatus, GetVariableStatusEnumType.Rejected)
      assert.notStrictEqual(r.attributeStatusInfo?.reasonCode, undefined)
    }
    resetLimits(station)
  })

  await it('should enforce BytesPerMessage limit (pre-calculation)', () => {
    setStrictLimits(station, 100, 10)
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
        {
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(station, request)
    assert.strictEqual(response.getVariableResult.length, 2)
    response.getVariableResult.forEach(r => {
      assert.strictEqual(r.attributeStatus, GetVariableStatusEnumType.Rejected)
      assert.strictEqual(r.attributeStatusInfo?.reasonCode, ReasonCodeEnumType.TooLargeElement)
    })
    resetLimits(station)
  })

  await it('should enforce BytesPerMessage limit (post-calculation)', () => {
    // Build request likely to produce larger response due to status info entries
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        // Unsupported attribute type (adds status info)
        {
          attributeType: AttributeEnumType.Target,
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
        // Unknown variable
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: 'UnknownVariableA' },
        },
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: 'UnknownVariableB' },
        },
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: 'UnknownVariableC' },
        },
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: 'UnknownVariableD' },
        },
      ],
    }
    const preEstimate = Buffer.byteLength(JSON.stringify(request.getVariableData), 'utf8')
    const limit = preEstimate + 5 // allow pre-check pass, fail post-check
    setStrictLimits(station, 100, limit)
    const response = incomingRequestService.handleRequestGetVariables(station, request)
    const actualSize = Buffer.byteLength(JSON.stringify(response.getVariableResult), 'utf8')
    assert.ok(actualSize > limit, 'response size should exceed limit')
    assert.strictEqual(response.getVariableResult.length, request.getVariableData.length)
    response.getVariableResult.forEach(r => {
      assert.strictEqual(r.attributeStatus, GetVariableStatusEnumType.Rejected)
      assert.strictEqual(r.attributeStatusInfo?.reasonCode, ReasonCodeEnumType.TooLargeElement)
    })
    resetLimits(station)
  })

  // Added tests for relocated components
  await it('should retrieve immutable DateTime from ClockCtrlr', () => {
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          attributeType: AttributeEnumType.Actual,
          component: { name: OCPP20ComponentName.ClockCtrlr },
          variable: { name: OCPP20RequiredVariableName.DateTime },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(station, request)
    assert.strictEqual(response.getVariableResult.length, 1)
    const result = response.getVariableResult[0]
    assert.strictEqual(result.attributeStatus, GetVariableStatusEnumType.Accepted)
    assert.strictEqual(result.component.name, OCPP20ComponentName.ClockCtrlr)
    assert.strictEqual(result.variable.name, OCPP20RequiredVariableName.DateTime)
    assert.notStrictEqual(result.attributeValue, undefined)
  })

  await it('should retrieve MessageTimeout from OCPPCommCtrlr', () => {
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          attributeType: AttributeEnumType.Actual,
          component: { instance: 'Default', name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageTimeout },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(station, request)
    assert.strictEqual(response.getVariableResult.length, 1)
    const result = response.getVariableResult[0]
    assert.strictEqual(result.attributeStatus, GetVariableStatusEnumType.Accepted)
    assert.strictEqual(result.component.name, OCPP20ComponentName.OCPPCommCtrlr)
    assert.strictEqual(result.component.instance, 'Default')
    assert.strictEqual(result.variable.name, OCPP20RequiredVariableName.MessageTimeout)
    assert.notStrictEqual(result.attributeValue, undefined)
  })

  await it('should retrieve TxUpdatedInterval from SampledDataCtrlr and show default value', () => {
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          attributeType: AttributeEnumType.Actual,
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(station, request)
    assert.strictEqual(response.getVariableResult.length, 1)
    const result = response.getVariableResult[0]
    assert.strictEqual(result.attributeStatus, GetVariableStatusEnumType.Accepted)
    assert.strictEqual(result.component.name, OCPP20ComponentName.SampledDataCtrlr)
    assert.strictEqual(result.variable.name, OCPP20RequiredVariableName.TxUpdatedInterval)
    assert.strictEqual(result.attributeValue, '30')
  })

  await it('should retrieve list/sequence defaults for FileTransferProtocols, TimeSource, NetworkConfigurationPriority', () => {
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.FileTransferProtocols },
        },
        {
          component: { name: OCPP20ComponentName.ClockCtrlr },
          variable: { name: OCPP20RequiredVariableName.TimeSource },
        },
        {
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.NetworkConfigurationPriority },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(station, request)
    assert.strictEqual(response.getVariableResult.length, 3)
    const fileTransfer = response.getVariableResult[0]
    assert.strictEqual(fileTransfer.attributeStatus, GetVariableStatusEnumType.Accepted)
    assert.strictEqual(fileTransfer.attributeValue, 'HTTPS,FTPS,SFTP')
    const timeSource = response.getVariableResult[1]
    assert.strictEqual(timeSource.attributeStatus, GetVariableStatusEnumType.Accepted)
    assert.strictEqual(timeSource.attributeValue, 'NTP,GPS,RealTimeClock,Heartbeat')
    const netConfigPriority = response.getVariableResult[2]
    assert.strictEqual(netConfigPriority.attributeStatus, GetVariableStatusEnumType.Accepted)
    assert.strictEqual(netConfigPriority.attributeValue, '1,2,3')
  })

  await it('should retrieve list defaults for TxStartedMeasurands, TxEndedMeasurands, TxUpdatedMeasurands', () => {
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxStartedMeasurands },
        },
        {
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxEndedMeasurands },
        },
        {
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedMeasurands },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(station, request)
    assert.strictEqual(response.getVariableResult.length, 3)
    const txStarted = response.getVariableResult[0]
    assert.strictEqual(txStarted.attributeStatus, GetVariableStatusEnumType.Accepted)
    assert.strictEqual(
      txStarted.attributeValue,
      `${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER},${OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT},${OCPP20MeasurandEnumType.VOLTAGE}`
    )
    const txEnded = response.getVariableResult[1]
    assert.strictEqual(txEnded.attributeStatus, GetVariableStatusEnumType.Accepted)
    assert.strictEqual(
      txEnded.attributeValue,
      `${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER},${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL},${OCPP20MeasurandEnumType.VOLTAGE}`
    )
    const txUpdated = response.getVariableResult[2]
    assert.strictEqual(txUpdated.attributeStatus, GetVariableStatusEnumType.Accepted)
    assert.strictEqual(
      txUpdated.attributeValue,
      `${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER},${OCPP20MeasurandEnumType.CURRENT_IMPORT},${OCPP20MeasurandEnumType.VOLTAGE}`
    )
  })

  // FR: B06.FR.13
  await it('should reject Target attribute for NetworkConfigurationPriority', () => {
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          attributeType: AttributeEnumType.Target,
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.NetworkConfigurationPriority },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(station, request)
    assert.strictEqual(response.getVariableResult.length, 1)
    const result = response.getVariableResult[0]
    assert.strictEqual(result.attributeStatus, GetVariableStatusEnumType.NotSupportedAttributeType)
    assert.strictEqual(result.attributeType, AttributeEnumType.Target)
    assert.strictEqual(result.attributeValue, undefined)
  })

  // FR: B06.FR.15
  await it('should return UnknownVariable when instance omitted for instance-specific MessageTimeout', () => {
    // MessageTimeout only registered with instance 'Default'
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageTimeout },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(station, request)
    assert.strictEqual(response.getVariableResult.length, 1)
    const result = response.getVariableResult[0]
    assert.strictEqual(result.attributeStatus, GetVariableStatusEnumType.UnknownVariable)
    assert.strictEqual(result.attributeValue, undefined)
  })

  // FR: B06.FR.09
  await it('should reject retrieval of explicit write-only variable CertificatePrivateKey', () => {
    // Explicit vendor-specific write-only variable from SecurityCtrlr
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          component: { name: OCPP20ComponentName.SecurityCtrlr },
          variable: { name: OCPP20VendorVariableName.CertificatePrivateKey },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(station, request)
    assert.strictEqual(response.getVariableResult.length, 1)
    const result = response.getVariableResult[0]
    assert.strictEqual(result.attributeStatus, GetVariableStatusEnumType.Rejected)
    assert.strictEqual(result.attributeStatusInfo?.reasonCode, ReasonCodeEnumType.WriteOnly)
  })

  await it('should reject MinSet and MaxSet for WebSocketPingInterval', () => {
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          attributeType: AttributeEnumType.MinSet,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
        {
          attributeType: AttributeEnumType.MaxSet,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(station, request)
    assert.strictEqual(response.getVariableResult.length, 2)
    const minSet = response.getVariableResult[0]
    const maxSet = response.getVariableResult[1]
    assert.strictEqual(minSet.attributeStatus, GetVariableStatusEnumType.NotSupportedAttributeType)
    assert.strictEqual(minSet.attributeType, AttributeEnumType.MinSet)
    assert.strictEqual(minSet.attributeValue, undefined)
    assert.strictEqual(maxSet.attributeStatus, GetVariableStatusEnumType.NotSupportedAttributeType)
    assert.strictEqual(maxSet.attributeType, AttributeEnumType.MaxSet)
    assert.strictEqual(maxSet.attributeValue, undefined)
  })

  await it('should reject MinSet for MemberList variable TxStartPoint', () => {
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          attributeType: AttributeEnumType.MinSet,
          component: { name: OCPP20ComponentName.TxCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxStartPoint },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(station, request)
    assert.strictEqual(response.getVariableResult.length, 1)
    const result = response.getVariableResult[0]
    assert.strictEqual(result.attributeStatus, GetVariableStatusEnumType.NotSupportedAttributeType)
  })

  await it('should reject MaxSet for variable SecurityProfile (Actual only)', () => {
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          attributeType: AttributeEnumType.MaxSet,
          component: { name: OCPP20ComponentName.SecurityCtrlr },
          variable: { name: OCPP20RequiredVariableName.SecurityProfile },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(station, request)
    assert.strictEqual(response.getVariableResult.length, 1)
    const result = response.getVariableResult[0]
    assert.strictEqual(result.attributeStatus, GetVariableStatusEnumType.NotSupportedAttributeType)
  })

  await it('should apply ValueSize then ReportingValueSize sequential truncation', () => {
    // First apply a smaller ValueSize (5) then a smaller ReportingValueSize (3)
    setValueSize(station, 5)
    setReportingValueSize(station, 3)
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(station, request)
    const result = response.getVariableResult[0]
    assert.strictEqual(result.attributeStatus, GetVariableStatusEnumType.Accepted)
    assert.notStrictEqual(result.attributeValue, undefined)
    if (result.attributeValue == null) {
      assert.fail('Expected attributeValue to be defined')
    }
    assert.ok(
      result.attributeValue.length <= 3,
      'attributeValue should be truncated to at most 3 characters'
    )
    resetReportingValueSize(station)
  })
})
