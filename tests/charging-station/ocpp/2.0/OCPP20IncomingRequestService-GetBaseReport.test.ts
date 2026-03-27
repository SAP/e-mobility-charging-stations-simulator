/**
 * @file Tests for OCPP20IncomingRequestService GetBaseReport
 * @description Unit tests for OCPP 2.0 GetBaseReport command handling (B07)
 */
import { millisecondsToSeconds } from 'date-fns'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import {
  addConfigurationKey,
  buildConfigKey,
  setConfigurationKeyValue,
} from '../../../../src/charging-station/ConfigurationKeyUtils.js'
import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  OCPP20VariableManager,
} from '../../../../src/charging-station/ocpp/2.0/OCPP20VariableManager.js'
import {
  AttributeEnumType,
  GenericDeviceModelStatusEnumType,
  OCPP20ComponentName,
  OCPP20DeviceInfoVariableName,
  type OCPP20GetBaseReportRequest,
  type OCPP20GetBaseReportResponse,
  OCPP20IncomingRequestCommand,
  OCPP20OptionalVariableName,
  OCPP20RequiredVariableName,
  type OCPP20SetVariableResultType,
  OCPPVersion,
  ReportBaseEnumType,
  type ReportDataType,
  SetVariableStatusEnumType,
  StandardParametersKey,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { flushMicrotasks, standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import {
  TEST_CHARGE_POINT_MODEL,
  TEST_CHARGE_POINT_SERIAL_NUMBER,
  TEST_CHARGE_POINT_VENDOR,
  TEST_CHARGING_STATION_BASE_NAME,
  TEST_FIRMWARE_VERSION,
} from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'

await describe('B07 - Get Base Report', async () => {
  let station: ChargingStation
  let incomingRequestService: OCPP20IncomingRequestService
  let testableService: ReturnType<typeof createTestableIncomingRequestService>

  beforeEach(() => {
    const { station: mockStation } = createMockChargingStation({
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
            key: StandardParametersKey.MeterValueSampleInterval,
            readonly: false,
            value: millisecondsToSeconds(Constants.DEFAULT_METER_VALUES_INTERVAL).toString(),
          },
        ],
      },
      stationInfo: {
        chargePointModel: TEST_CHARGE_POINT_MODEL,
        chargePointSerialNumber: TEST_CHARGE_POINT_SERIAL_NUMBER,
        chargePointVendor: TEST_CHARGE_POINT_VENDOR,
        firmwareVersion: TEST_FIRMWARE_VERSION,
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
    })
    station = mockStation

    incomingRequestService = new OCPP20IncomingRequestService()

    testableService = createTestableIncomingRequestService(incomingRequestService)
  })

  // Reset singleton state after each test to ensure test isolation
  afterEach(() => {
    standardCleanup()
    OCPP20VariableManager.getInstance().resetRuntimeOverrides()
  })

  // FR: B07.FR.01, B07.FR.07
  await it('should handle GetBaseReport request with ConfigurationInventory', () => {
    const request: OCPP20GetBaseReportRequest = {
      reportBase: ReportBaseEnumType.ConfigurationInventory,
      requestId: 1,
    }

    const response = testableService.handleRequestGetBaseReport(station, request)

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, GenericDeviceModelStatusEnumType.Accepted)
  })

  // FR: B08.FR.02
  await it('should handle GetBaseReport request with FullInventory', () => {
    const request: OCPP20GetBaseReportRequest = {
      reportBase: ReportBaseEnumType.FullInventory,
      requestId: 2,
    }

    const response = testableService.handleRequestGetBaseReport(station, request)

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, GenericDeviceModelStatusEnumType.Accepted)
  })

  await it('should include registry variables with Actual attribute only for unsupported types', () => {
    const reportData = testableService.buildReportData(station, ReportBaseEnumType.FullInventory)
    const heartbeatEntry = reportData.find(
      (item: ReportDataType) =>
        item.variable.name === (OCPP20OptionalVariableName.HeartbeatInterval as string) &&
        item.component.name === (OCPP20ComponentName.OCPPCommCtrlr as string)
    )
    assert.notStrictEqual(heartbeatEntry, undefined)
    if (heartbeatEntry) {
      const types = heartbeatEntry.variableAttribute.map(
        (a: { type?: string; value?: string }) => a.type
      )
      assert.deepStrictEqual(types, [AttributeEnumType.Actual])
    }
    // Boolean variable (AuthorizeRemoteStart) should only include Actual
    const authorizeRemoteStartEntry = reportData.find(
      (item: ReportDataType) =>
        item.variable.name === (OCPP20RequiredVariableName.AuthorizeRemoteStart as string) &&
        item.component.name === (OCPP20ComponentName.AuthCtrlr as string)
    )
    assert.notStrictEqual(authorizeRemoteStartEntry, undefined)
    if (authorizeRemoteStartEntry) {
      const types = authorizeRemoteStartEntry.variableAttribute.map(
        (a: { type?: string; value?: string }) => a.type
      )
      assert.deepStrictEqual(types, [AttributeEnumType.Actual])
    }
  })

  // FR: B08.FR.03
  await it('should handle GetBaseReport request with SummaryInventory', () => {
    const request: OCPP20GetBaseReportRequest = {
      reportBase: ReportBaseEnumType.SummaryInventory,
      requestId: 3,
    }

    const response = testableService.handleRequestGetBaseReport(station, request)

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, GenericDeviceModelStatusEnumType.Accepted)
  })

  // FR: B08.FR.04
  await it('should return NotSupported for unsupported reportBase', () => {
    const request: OCPP20GetBaseReportRequest = {
      reportBase: 'UnsupportedReportBase' as unknown as ReportBaseEnumType,
      requestId: 4,
    }

    const response = testableService.handleRequestGetBaseReport(station, request)

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, GenericDeviceModelStatusEnumType.NotSupported)
  })

  // FR: B08.FR.05
  await it('should return Accepted for ConfigurationInventory with configured station', () => {
    // Create a charging station with minimal configuration

    const request: OCPP20GetBaseReportRequest = {
      reportBase: ReportBaseEnumType.ConfigurationInventory,
      requestId: 5,
    }

    const response = testableService.handleRequestGetBaseReport(station, request)

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, GenericDeviceModelStatusEnumType.Accepted)
  })

  // FR: B08.FR.06
  await it('should build correct report data for ConfigurationInventory', () => {
    const request: OCPP20GetBaseReportRequest = {
      reportBase: ReportBaseEnumType.ConfigurationInventory,
      requestId: 6,
    }

    // Test the buildReportData method indirectly by calling handleRequestGetBaseReport
    // and checking if it returns Accepted status (which means data was built successfully)
    const response = testableService.handleRequestGetBaseReport(station, request)

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, GenericDeviceModelStatusEnumType.Accepted)

    // We can also test the buildReportData method directly if needed
    const reportData = testableService.buildReportData(
      station,
      ReportBaseEnumType.ConfigurationInventory
    )

    assert.ok(Array.isArray(reportData))
    assert.ok(reportData.length > 0)

    // Check that each report data item has the expected structure
    for (const item of reportData) {
      assert.notStrictEqual(item.component, undefined)
      assert.notStrictEqual(item.component.name, undefined)
      assert.notStrictEqual(item.variable, undefined)
      assert.notStrictEqual(item.variable.name, undefined)
      assert.notStrictEqual(item.variableAttribute, undefined)
      assert.ok(Array.isArray(item.variableAttribute))
      assert.notStrictEqual(item.variableCharacteristics, undefined)
    }
  })

  // FR: B08.FR.07
  await it('should build correct report data for FullInventory with station info', () => {
    const reportData = testableService.buildReportData(station, ReportBaseEnumType.FullInventory)

    assert.ok(Array.isArray(reportData))
    assert.ok(reportData.length > 0)

    // Check for station info variables
    const modelVariable = reportData.find(
      (item: ReportDataType) =>
        item.variable.name === (OCPP20DeviceInfoVariableName.Model as string) &&
        item.component.name === (OCPP20ComponentName.ChargingStation as string)
    )
    assert.notStrictEqual(modelVariable, undefined)
    if (modelVariable) {
      assert.strictEqual(modelVariable.variableAttribute[0]?.value, TEST_CHARGE_POINT_MODEL)
    }

    const vendorVariable = reportData.find(
      (item: ReportDataType) =>
        item.variable.name === (OCPP20DeviceInfoVariableName.VendorName as string) &&
        item.component.name === (OCPP20ComponentName.ChargingStation as string)
    )
    assert.notStrictEqual(vendorVariable, undefined)
    if (vendorVariable) {
      assert.strictEqual(vendorVariable.variableAttribute[0]?.value, TEST_CHARGE_POINT_VENDOR)
    }
  })

  // FR: B08.FR.08
  await it('should build correct report data for SummaryInventory', () => {
    const reportData = testableService.buildReportData(station, ReportBaseEnumType.SummaryInventory)

    assert.ok(Array.isArray(reportData))
    assert.ok(reportData.length > 0)

    // Check for availability state variable
    const availabilityVariable = reportData.find(
      (item: ReportDataType) =>
        item.variable.name === (OCPP20DeviceInfoVariableName.AvailabilityState as string) &&
        item.component.name === (OCPP20ComponentName.ChargingStation as string)
    )
    assert.notStrictEqual(availabilityVariable, undefined)
    if (availabilityVariable) {
      assert.strictEqual(availabilityVariable.variableCharacteristics?.supportsMonitoring, true)
    }
  })

  // ReportingValueSize truncation test
  await it('should truncate long SequenceList/MemberList values per ReportingValueSize', () => {
    // Ensure ReportingValueSize is at a small value (default is Constants.OCPP_VALUE_ABSOLUTE_MAX_LENGTH). We will override configuration key if absent.
    const reportingSizeKey = buildConfigKey(
      OCPP20ComponentName.DeviceDataCtrlr,
      StandardParametersKey.ReportingValueSize
    )
    // Add or lower configuration key to 10 to force truncation
    addConfigurationKey(station, reportingSizeKey, '10', undefined, {
      overwrite: true,
    })
    setConfigurationKeyValue(station, reportingSizeKey, '10')

    // Choose TimeSource (SequenceList) and construct an artificially long ordered list value > 10 chars
    const variableManager = OCPP20VariableManager.getInstance()
    // Use members exceeding 10 chars total; exclude removed RTC/Manual.
    const longValue = 'Heartbeat,NTP,GPS,RealTimeClock,MobileNetwork,RadioTimeTransmitter'
    // Set Actual (SequenceList). Should accept full value internally.
    const setResult: OCPP20SetVariableResultType[] = variableManager.setVariables(station, [
      {
        attributeType: AttributeEnumType.Actual,
        attributeValue: longValue,
        component: { name: OCPP20ComponentName.ClockCtrlr },
        variable: { name: OCPP20RequiredVariableName.TimeSource },
      },
    ])
    assert.strictEqual(setResult[0].attributeStatus, SetVariableStatusEnumType.Accepted)

    // Build report; value should be truncated to length 10
    const reportData = testableService.buildReportData(station, ReportBaseEnumType.FullInventory)
    const timeSourceEntry = reportData.find(
      (item: ReportDataType) =>
        item.variable.name === (OCPP20RequiredVariableName.TimeSource as string) &&
        item.component.name === (OCPP20ComponentName.ClockCtrlr as string)
    )
    assert.notStrictEqual(timeSourceEntry, undefined)
    if (timeSourceEntry) {
      const reportedAttr = timeSourceEntry.variableAttribute.find(
        (a: { type?: string; value?: string }) => a.type === AttributeEnumType.Actual
      )
      assert.notStrictEqual(reportedAttr, undefined)
      if (reportedAttr && typeof reportedAttr.value === 'string') {
        assert.strictEqual(reportedAttr.value.length, 10)
        assert.ok(longValue.startsWith(reportedAttr.value))
      }
    }
  })

  // FR: B08.FR.09
  await it('should handle GetBaseReport with EVSE structure', () => {
    // Create a station with EVSEs
    const { station: stationWithEvses } = createMockChargingStation({
      baseName: 'CS-EVSE-001',
      connectorsCount: 3,
      evseConfiguration: { evsesCount: 3 },
      stationInfo: {
        chargePointModel: 'EVSE Test Model',
        chargePointVendor: 'EVSE Test Vendor',
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
    })

    const reportData = testableService.buildReportData(
      stationWithEvses,
      ReportBaseEnumType.FullInventory
    )

    assert.ok(Array.isArray(reportData))
    assert.ok(reportData.length > 0)

    // Check if EVSE components are included when EVSEs exist
    const evseComponents = reportData.filter(
      (item: ReportDataType) => item.component.name === (OCPP20ComponentName.EVSE as string)
    )
    if (stationWithEvses.hasEvses) {
      assert.ok(evseComponents.length > 0)
    }
  })

  // FR: B08.FR.10
  await it('should validate unsupported reportBase correctly', () => {
    const reportData = testableService.buildReportData(
      station,
      'InvalidReportBase' as unknown as ReportBaseEnumType
    )

    assert.ok(Array.isArray(reportData))
    assert.strictEqual(reportData.length, 0)
  })

  await describe('GET_BASE_REPORT event listener', async () => {
    let listenerService: OCPP20IncomingRequestService
    let sendNotifyMock: ReturnType<typeof mock.fn>

    beforeEach(() => {
      listenerService = new OCPP20IncomingRequestService()
      sendNotifyMock = mock.method(
        listenerService as unknown as {
          sendNotifyReportRequest: (
            chargingStation: ChargingStation,
            request: OCPP20GetBaseReportRequest,
            response: OCPP20GetBaseReportResponse
          ) => Promise<void>
        },
        'sendNotifyReportRequest',
        () => Promise.resolve()
      )
    })

    afterEach(() => {
      standardCleanup()
    })

    await it('should register GET_BASE_REPORT event listener in constructor', () => {
      assert.strictEqual(
        listenerService.listenerCount(OCPP20IncomingRequestCommand.GET_BASE_REPORT),
        1
      )
    })

    await it('should call sendNotifyReportRequest when response is Accepted', () => {
      const request: OCPP20GetBaseReportRequest = {
        reportBase: ReportBaseEnumType.FullInventory,
        requestId: 1,
      }
      const response: OCPP20GetBaseReportResponse = {
        status: GenericDeviceModelStatusEnumType.Accepted,
      }

      listenerService.emit(OCPP20IncomingRequestCommand.GET_BASE_REPORT, station, request, response)

      assert.strictEqual(sendNotifyMock.mock.callCount(), 1)
    })

    await it('should NOT call sendNotifyReportRequest when response is NotSupported', () => {
      const request: OCPP20GetBaseReportRequest = {
        reportBase: ReportBaseEnumType.FullInventory,
        requestId: 2,
      }
      const response: OCPP20GetBaseReportResponse = {
        status: GenericDeviceModelStatusEnumType.NotSupported,
      }

      listenerService.emit(OCPP20IncomingRequestCommand.GET_BASE_REPORT, station, request, response)

      assert.strictEqual(sendNotifyMock.mock.callCount(), 0)
    })

    await it('should handle sendNotifyReportRequest rejection gracefully', async () => {
      mock.method(
        listenerService as unknown as {
          sendNotifyReportRequest: (
            chargingStation: ChargingStation,
            request: OCPP20GetBaseReportRequest,
            response: OCPP20GetBaseReportResponse
          ) => Promise<void>
        },
        'sendNotifyReportRequest',
        () => Promise.reject(new Error('notify report error'))
      )

      const request: OCPP20GetBaseReportRequest = {
        reportBase: ReportBaseEnumType.FullInventory,
        requestId: 3,
      }
      const response: OCPP20GetBaseReportResponse = {
        status: GenericDeviceModelStatusEnumType.Accepted,
      }

      listenerService.emit(OCPP20IncomingRequestCommand.GET_BASE_REPORT, station, request, response)

      await flushMicrotasks()
    })
  })
})
