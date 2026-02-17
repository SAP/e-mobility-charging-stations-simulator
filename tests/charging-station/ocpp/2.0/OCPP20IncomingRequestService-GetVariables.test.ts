/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from '@std/expect'
import { millisecondsToSeconds } from 'date-fns'
import { describe, it } from 'node:test'

import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
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
import { createChargingStation } from '../../../ChargingStationFactory.js'
import {
  TEST_CHARGING_STATION_BASE_NAME,
  TEST_CONNECTOR_VALID_INSTANCE,
} from './OCPP20TestConstants.js'
import {
  resetLimits,
  resetReportingValueSize,
  setReportingValueSize,
  setStrictLimits,
  setValueSize,
} from './OCPP20TestUtils.js'

await describe('B06 - Get Variables', async () => {
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

  // FR: B06.FR.01
  await it('Should handle GetVariables request with valid variables', () => {
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

    const response = incomingRequestService.handleRequestGetVariables(mockChargingStation, request)

    expect(response).toBeDefined()
    expect(response.getVariableResult).toBeDefined()
    expect(Array.isArray(response.getVariableResult)).toBe(true)
    expect(response.getVariableResult).toHaveLength(2)

    // Check first variable (HeartbeatInterval)
    const firstResult = response.getVariableResult[0]
    expect(firstResult.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
    expect(firstResult.attributeType).toBe(AttributeEnumType.Actual)
    expect(firstResult.attributeValue).toBe(
      millisecondsToSeconds(Constants.DEFAULT_HEARTBEAT_INTERVAL).toString()
    )
    expect(firstResult.component.name).toBe(OCPP20ComponentName.OCPPCommCtrlr)
    expect(firstResult.variable.name).toBe(OCPP20OptionalVariableName.HeartbeatInterval)
    expect(firstResult.attributeStatusInfo).toBeUndefined()

    // Check second variable (WebSocketPingInterval)
    const secondResult = response.getVariableResult[1]
    expect(secondResult.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
    expect(secondResult.attributeType).toBe(AttributeEnumType.Actual)
    expect(secondResult.attributeValue).toBe(Constants.DEFAULT_WEBSOCKET_PING_INTERVAL.toString())
    expect(secondResult.component.name).toBe(OCPP20ComponentName.ChargingStation)
    expect(secondResult.variable.name).toBe(OCPP20OptionalVariableName.WebSocketPingInterval)
    expect(secondResult.attributeStatusInfo).toBeUndefined()
  })

  // FR: B06.FR.02
  await it('Should handle GetVariables request with invalid variables', () => {
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

    const response = incomingRequestService.handleRequestGetVariables(mockChargingStation, request)

    expect(response).toBeDefined()
    expect(response.getVariableResult).toBeDefined()
    expect(Array.isArray(response.getVariableResult)).toBe(true)
    expect(response.getVariableResult).toHaveLength(2)

    // Check first variable (should be UnknownVariable)
    const firstResult = response.getVariableResult[0]
    expect(firstResult.attributeStatus).toBe(GetVariableStatusEnumType.UnknownVariable)
    // Defaulted attributeType now Actual, not undefined
    expect(firstResult.attributeType).toBe(AttributeEnumType.Actual)
    expect(firstResult.attributeValue).toBeUndefined()
    expect(firstResult.component.name).toBe(OCPP20ComponentName.ChargingStation)
    expect(firstResult.variable.name).toBe('InvalidVariable')
    expect(firstResult.attributeStatusInfo).toBeDefined()

    // Check second variable (should be UnknownComponent)
    const secondResult = response.getVariableResult[1]
    expect(secondResult.attributeStatus).toBe(GetVariableStatusEnumType.UnknownComponent)
    // Defaulted attributeType now Actual, not undefined
    expect(secondResult.attributeType).toBe(AttributeEnumType.Actual)
    expect(secondResult.attributeValue).toBeUndefined()
    expect(secondResult.component.name).toBe('InvalidComponent')
    expect(secondResult.variable.name).toBe(OCPP20OptionalVariableName.HeartbeatInterval)
    expect(secondResult.attributeStatusInfo).toBeDefined()
  })

  // FR: B06.FR.03
  await it('Should handle GetVariables request with unsupported attribute types', () => {
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          attributeType: AttributeEnumType.Target, // Not supported for HeartbeatInterval
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20OptionalVariableName.HeartbeatInterval },
        },
      ],
    }

    const response = incomingRequestService.handleRequestGetVariables(mockChargingStation, request)

    expect(response).toBeDefined()
    expect(response.getVariableResult).toBeDefined()
    expect(Array.isArray(response.getVariableResult)).toBe(true)
    expect(response.getVariableResult).toHaveLength(1)

    const result = response.getVariableResult[0]
    expect(result.attributeStatus).toBe(GetVariableStatusEnumType.NotSupportedAttributeType)
  })

  // FR: B06.FR.04
  await it('Should reject AuthorizeRemoteStart under Connector component', () => {
    resetLimits(mockChargingStation)
    resetReportingValueSize(mockChargingStation)
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          component: {
            instance: TEST_CONNECTOR_VALID_INSTANCE,
            name: OCPP20ComponentName.Connector,
          },
          variable: { name: OCPP20RequiredVariableName.AuthorizeRemoteStart },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(mockChargingStation, request)
    expect(response.getVariableResult).toHaveLength(1)
    const result = response.getVariableResult[0]
    expect(result.attributeStatus).toBe(GetVariableStatusEnumType.UnknownComponent)
  })

  // FR: B06.FR.05
  await it('Should reject Target attribute for WebSocketPingInterval', () => {
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          attributeType: AttributeEnumType.Target,
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(mockChargingStation, request)
    expect(response.getVariableResult).toHaveLength(1)
    const result = response.getVariableResult[0]
    expect(result.attributeStatus).toBe(GetVariableStatusEnumType.NotSupportedAttributeType)
  })

  await it('Should truncate variable value based on ReportingValueSize', () => {
    // Set size below actual value length to force truncation
    setReportingValueSize(mockChargingStation, 2)
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(mockChargingStation, request)
    const result = response.getVariableResult[0]
    expect(result.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
    expect(result.attributeValue?.length).toBe(2)
    resetReportingValueSize(mockChargingStation)
  })

  await it('Should allow ReportingValueSize retrieval from DeviceDataCtrlr', () => {
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          component: { name: OCPP20ComponentName.DeviceDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.ReportingValueSize },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(mockChargingStation, request)
    const result = response.getVariableResult[0]
    expect(result.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
    expect(result.attributeValue).toBeDefined()
  })

  await it('Should enforce ItemsPerMessage limit', () => {
    setStrictLimits(mockChargingStation, 1, 10000)
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
    const response = incomingRequestService.handleRequestGetVariables(mockChargingStation, request)
    expect(response.getVariableResult.length).toBe(2)
    for (const r of response.getVariableResult) {
      expect(r.attributeStatus).toBe(GetVariableStatusEnumType.Rejected)
      expect(r.attributeStatusInfo?.reasonCode).toBeDefined()
    }
    resetLimits(mockChargingStation)
  })

  await it('Should enforce BytesPerMessage limit (pre-calculation)', () => {
    setStrictLimits(mockChargingStation, 100, 10)
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
    const response = incomingRequestService.handleRequestGetVariables(mockChargingStation, request)
    expect(response.getVariableResult.length).toBe(2)
    response.getVariableResult.forEach(r => {
      expect(r.attributeStatus).toBe(GetVariableStatusEnumType.Rejected)
      expect(r.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.TooLargeElement)
    })
    resetLimits(mockChargingStation)
  })

  await it('Should enforce BytesPerMessage limit (post-calculation)', () => {
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
    setStrictLimits(mockChargingStation, 100, limit)
    const response = incomingRequestService.handleRequestGetVariables(mockChargingStation, request)
    const actualSize = Buffer.byteLength(JSON.stringify(response.getVariableResult), 'utf8')
    expect(actualSize).toBeGreaterThan(limit)
    expect(response.getVariableResult).toHaveLength(request.getVariableData.length)
    response.getVariableResult.forEach(r => {
      expect(r.attributeStatus).toBe(GetVariableStatusEnumType.Rejected)
      expect(r.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.TooLargeElement)
    })
    resetLimits(mockChargingStation)
  })

  // Added tests for relocated components
  await it('Should retrieve immutable DateTime from ClockCtrlr', () => {
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          attributeType: AttributeEnumType.Actual,
          component: { name: OCPP20ComponentName.ClockCtrlr },
          variable: { name: OCPP20RequiredVariableName.DateTime },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(mockChargingStation, request)
    expect(response.getVariableResult).toHaveLength(1)
    const result = response.getVariableResult[0]
    expect(result.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
    expect(result.component.name).toBe(OCPP20ComponentName.ClockCtrlr)
    expect(result.variable.name).toBe(OCPP20RequiredVariableName.DateTime)
    expect(result.attributeValue).toBeDefined()
  })

  await it('Should retrieve MessageTimeout from OCPPCommCtrlr', () => {
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          attributeType: AttributeEnumType.Actual,
          component: { instance: 'Default', name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageTimeout },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(mockChargingStation, request)
    expect(response.getVariableResult).toHaveLength(1)
    const result = response.getVariableResult[0]
    expect(result.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
    expect(result.component.name).toBe(OCPP20ComponentName.OCPPCommCtrlr)
    expect(result.component.instance).toBe('Default')
    expect(result.variable.name).toBe(OCPP20RequiredVariableName.MessageTimeout)
    expect(result.attributeValue).toBeDefined()
  })

  await it('Should retrieve TxUpdatedInterval from SampledDataCtrlr and show default value', () => {
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          attributeType: AttributeEnumType.Actual,
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(mockChargingStation, request)
    expect(response.getVariableResult).toHaveLength(1)
    const result = response.getVariableResult[0]
    expect(result.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
    expect(result.component.name).toBe(OCPP20ComponentName.SampledDataCtrlr)
    expect(result.variable.name).toBe(OCPP20RequiredVariableName.TxUpdatedInterval)
    expect(result.attributeValue).toBe('30')
  })

  await it('Should retrieve list/sequence defaults for FileTransferProtocols, TimeSource, NetworkConfigurationPriority', () => {
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
    const response = incomingRequestService.handleRequestGetVariables(mockChargingStation, request)
    expect(response.getVariableResult).toHaveLength(3)
    const fileTransfer = response.getVariableResult[0]
    expect(fileTransfer.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
    expect(fileTransfer.attributeValue).toBe('HTTPS,FTPS,SFTP')
    const timeSource = response.getVariableResult[1]
    expect(timeSource.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
    expect(timeSource.attributeValue).toBe('NTP,GPS,RealTimeClock,Heartbeat')
    const netConfigPriority = response.getVariableResult[2]
    expect(netConfigPriority.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
    expect(netConfigPriority.attributeValue).toBe('1,2,3')
  })

  await it('Should retrieve list defaults for TxStartedMeasurands, TxEndedMeasurands, TxUpdatedMeasurands', () => {
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
    const response = incomingRequestService.handleRequestGetVariables(mockChargingStation, request)
    expect(response.getVariableResult).toHaveLength(3)
    const txStarted = response.getVariableResult[0]
    expect(txStarted.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
    expect(txStarted.attributeValue).toBe(
      `${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER},${OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT},${OCPP20MeasurandEnumType.VOLTAGE}`
    )
    const txEnded = response.getVariableResult[1]
    expect(txEnded.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
    expect(txEnded.attributeValue).toBe(
      `${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER},${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL},${OCPP20MeasurandEnumType.VOLTAGE}`
    )
    const txUpdated = response.getVariableResult[2]
    expect(txUpdated.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
    expect(txUpdated.attributeValue).toBe(
      `${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER},${OCPP20MeasurandEnumType.CURRENT_IMPORT},${OCPP20MeasurandEnumType.VOLTAGE}`
    )
  })

  // FR: B06.FR.13
  await it('Should reject Target attribute for NetworkConfigurationPriority', () => {
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          attributeType: AttributeEnumType.Target,
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.NetworkConfigurationPriority },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(mockChargingStation, request)
    expect(response.getVariableResult).toHaveLength(1)
    const result = response.getVariableResult[0]
    expect(result.attributeStatus).toBe(GetVariableStatusEnumType.NotSupportedAttributeType)
    expect(result.attributeType).toBe(AttributeEnumType.Target)
    expect(result.attributeValue).toBeUndefined()
  })

  // FR: B06.FR.15
  await it('Should return UnknownVariable when instance omitted for instance-specific MessageTimeout', () => {
    // MessageTimeout only registered with instance 'Default'
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          component: { name: OCPP20ComponentName.OCPPCommCtrlr },
          variable: { name: OCPP20RequiredVariableName.MessageTimeout },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(mockChargingStation, request)
    expect(response.getVariableResult).toHaveLength(1)
    const result = response.getVariableResult[0]
    expect(result.attributeStatus).toBe(GetVariableStatusEnumType.UnknownVariable)
    expect(result.attributeValue).toBeUndefined()
  })

  // FR: B06.FR.09
  await it('Should reject retrieval of explicit write-only variable CertificatePrivateKey', () => {
    // Explicit vendor-specific write-only variable from SecurityCtrlr
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          component: { name: OCPP20ComponentName.SecurityCtrlr },
          variable: { name: OCPP20VendorVariableName.CertificatePrivateKey },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(mockChargingStation, request)
    expect(response.getVariableResult).toHaveLength(1)
    const result = response.getVariableResult[0]
    expect(result.attributeStatus).toBe(GetVariableStatusEnumType.Rejected)
    expect(result.attributeStatusInfo?.reasonCode).toBe(ReasonCodeEnumType.WriteOnly)
  })

  await it('Should reject MinSet and MaxSet for WebSocketPingInterval', () => {
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
    const response = incomingRequestService.handleRequestGetVariables(mockChargingStation, request)
    expect(response.getVariableResult).toHaveLength(2)
    const minSet = response.getVariableResult[0]
    const maxSet = response.getVariableResult[1]
    expect(minSet.attributeStatus).toBe(GetVariableStatusEnumType.NotSupportedAttributeType)
    expect(minSet.attributeType).toBe(AttributeEnumType.MinSet)
    expect(minSet.attributeValue).toBeUndefined()
    expect(maxSet.attributeStatus).toBe(GetVariableStatusEnumType.NotSupportedAttributeType)
    expect(maxSet.attributeType).toBe(AttributeEnumType.MaxSet)
    expect(maxSet.attributeValue).toBeUndefined()
  })

  await it('Should reject MinSet for MemberList variable TxStartPoint', () => {
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          attributeType: AttributeEnumType.MinSet,
          component: { name: OCPP20ComponentName.TxCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxStartPoint },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(mockChargingStation, request)
    expect(response.getVariableResult).toHaveLength(1)
    const result = response.getVariableResult[0]
    expect(result.attributeStatus).toBe(GetVariableStatusEnumType.NotSupportedAttributeType)
  })

  await it('Should reject MaxSet for variable SecurityProfile (Actual only)', () => {
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          attributeType: AttributeEnumType.MaxSet,
          component: { name: OCPP20ComponentName.SecurityCtrlr },
          variable: { name: OCPP20RequiredVariableName.SecurityProfile },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(mockChargingStation, request)
    expect(response.getVariableResult).toHaveLength(1)
    const result = response.getVariableResult[0]
    expect(result.attributeStatus).toBe(GetVariableStatusEnumType.NotSupportedAttributeType)
  })

  await it('Should apply ValueSize then ReportingValueSize sequential truncation', () => {
    // First apply a smaller ValueSize (5) then a smaller ReportingValueSize (3)
    setValueSize(mockChargingStation, 5)
    setReportingValueSize(mockChargingStation, 3)
    const request: OCPP20GetVariablesRequest = {
      getVariableData: [
        {
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20OptionalVariableName.WebSocketPingInterval },
        },
      ],
    }
    const response = incomingRequestService.handleRequestGetVariables(mockChargingStation, request)
    const result = response.getVariableResult[0]
    expect(result.attributeStatus).toBe(GetVariableStatusEnumType.Accepted)
    expect(result.attributeValue).toBeDefined()
    expect(result.attributeValue?.length).toBeLessThanOrEqual(3)
    resetReportingValueSize(mockChargingStation)
  })
})
