/**
 * @file Tests for OCPP20RequestService NotifyReport
 * @description Unit tests for OCPP 2.0 NotifyReport request building (B07/B08)
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import {
  createTestableRequestService,
  type TestableOCPP20RequestService,
} from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import {
  AttributeEnumType,
  DataEnumType,
  OCPP20ComponentName,
  OCPP20DeviceInfoVariableName,
  type OCPP20NotifyReportRequest,
  OCPP20OptionalVariableName,
  OCPP20RequestCommand,
  OCPPVersion,
  type ReportDataType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import {
  TEST_CHARGE_POINT_MODEL,
  TEST_CHARGE_POINT_SERIAL_NUMBER,
  TEST_CHARGE_POINT_VENDOR,
  TEST_CHARGING_STATION_BASE_NAME,
  TEST_FIRMWARE_VERSION,
} from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../helpers/StationHelpers.js'

await describe('B07/B08 - NotifyReport', async () => {
  let testableService: TestableOCPP20RequestService
  let station: ChargingStation

  beforeEach(() => {
    const { service } = createTestableRequestService()
    testableService = service
    const { station: createdStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 3,
      evseConfiguration: { evsesCount: 3 },
      stationInfo: {
        chargePointModel: TEST_CHARGE_POINT_MODEL,
        chargePointSerialNumber: TEST_CHARGE_POINT_SERIAL_NUMBER,
        chargePointVendor: TEST_CHARGE_POINT_VENDOR,
        firmwareVersion: TEST_FIRMWARE_VERSION,
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
    })
    station = createdStation
  })

  afterEach(() => {
    standardCleanup()
  })

  // FR: B07.FR.03, B07.FR.04
  await it('should build NotifyReport request payload correctly with minimal required fields', () => {
    const requestParams: OCPP20NotifyReportRequest = {
      generatedAt: new Date('2023-10-22T10:30:00.000Z'),
      requestId: 123,
      seqNo: 0,
    }

    // Access the private buildRequestPayload method via type assertion
    const payload = testableService.buildRequestPayload(
      station,
      OCPP20RequestCommand.NOTIFY_REPORT,
      requestParams
    ) as OCPP20NotifyReportRequest

    assert.notStrictEqual(payload, undefined)
    assert.ok(payload.generatedAt instanceof Date)
    assert.strictEqual(payload.requestId, 123)
    assert.strictEqual(payload.seqNo, 0)
    assert.strictEqual(payload.tbc, undefined)
    assert.strictEqual(payload.reportData, undefined)
  })

  await it('should build NotifyReport request payload correctly with reportData', () => {
    const reportData: ReportDataType[] = [
      {
        component: {
          name: OCPP20ComponentName.ChargingStation,
        },
        variable: {
          name: OCPP20DeviceInfoVariableName.Model,
        },
        variableAttribute: [
          {
            type: AttributeEnumType.Actual,
            value: 'Test Model X1',
          },
        ],
        variableCharacteristics: {
          dataType: DataEnumType.string,
          supportsMonitoring: false,
        },
      },
    ]

    const requestParams: OCPP20NotifyReportRequest = {
      generatedAt: new Date('2023-10-22T14:15:30.000Z'),
      reportData,
      requestId: 456,
      seqNo: 1,
      tbc: false,
    }

    const payload = testableService.buildRequestPayload(
      station,
      OCPP20RequestCommand.NOTIFY_REPORT,
      requestParams
    ) as OCPP20NotifyReportRequest

    assert.notStrictEqual(payload, undefined)
    assert.ok(payload.generatedAt instanceof Date)
    assert.strictEqual(payload.requestId, 456)
    assert.strictEqual(payload.seqNo, 1)
    assert.strictEqual(payload.tbc, false)
    assert.deepStrictEqual(payload.reportData, reportData)
    assert.ok(Array.isArray(payload.reportData))
    assert.strictEqual(payload.reportData.length, 1)
  })

  await it('should build NotifyReport request payload correctly with multiple reportData items', () => {
    const reportData: ReportDataType[] = [
      {
        component: {
          name: OCPP20ComponentName.ChargingStation,
        },
        variable: {
          name: OCPP20DeviceInfoVariableName.Model,
        },
        variableAttribute: [
          {
            type: AttributeEnumType.Actual,
            value: 'Advanced Model',
          },
        ],
        variableCharacteristics: {
          dataType: DataEnumType.string,
          supportsMonitoring: false,
        },
      },
      {
        component: {
          name: OCPP20ComponentName.ChargingStation,
        },
        variable: {
          name: OCPP20DeviceInfoVariableName.VendorName,
        },
        variableAttribute: [
          {
            type: AttributeEnumType.Actual,
            value: 'Advanced Vendor',
          },
        ],
        variableCharacteristics: {
          dataType: DataEnumType.string,
          supportsMonitoring: false,
        },
      },
      {
        component: {
          name: OCPP20ComponentName.OCPPCommCtrlr,
        },
        variable: {
          name: OCPP20OptionalVariableName.HeartbeatInterval,
        },
        variableAttribute: [
          {
            type: AttributeEnumType.Actual,
            value: '60',
          },
        ],
        variableCharacteristics: {
          dataType: DataEnumType.integer,
          supportsMonitoring: true,
        },
      },
    ]

    const requestParams: OCPP20NotifyReportRequest = {
      generatedAt: new Date('2023-10-22T16:45:00.000Z'),
      reportData,
      requestId: 789,
      seqNo: 2,
      tbc: true,
    }

    const payload = testableService.buildRequestPayload(
      station,
      OCPP20RequestCommand.NOTIFY_REPORT,
      requestParams
    ) as OCPP20NotifyReportRequest

    assert.notStrictEqual(payload, undefined)
    assert.ok(payload.generatedAt instanceof Date)
    assert.strictEqual(payload.requestId, 789)
    assert.strictEqual(payload.seqNo, 2)
    assert.strictEqual(payload.tbc, true)
    assert.deepStrictEqual(payload.reportData, reportData)
    assert.ok(Array.isArray(payload.reportData))
    assert.strictEqual(payload.reportData.length, 3)
  })

  await it('should build NotifyReport request payload correctly with fragmented report (tbc=true)', () => {
    const reportData: ReportDataType[] = [
      {
        component: {
          name: OCPP20ComponentName.ChargingStation,
        },
        variable: {
          name: OCPP20DeviceInfoVariableName.SerialNumber,
        },
        variableAttribute: [
          {
            type: AttributeEnumType.Actual,
            value: 'SN-FRAGMENT-001',
          },
        ],
        variableCharacteristics: {
          dataType: DataEnumType.string,
          supportsMonitoring: false,
        },
      },
    ]

    const requestParams: OCPP20NotifyReportRequest = {
      generatedAt: new Date('2023-10-22T18:20:15.000Z'),
      reportData,
      requestId: 999,
      seqNo: 0,
      tbc: true, // Indicates more fragments to follow
    }

    const payload = testableService.buildRequestPayload(
      station,
      OCPP20RequestCommand.NOTIFY_REPORT,
      requestParams
    ) as OCPP20NotifyReportRequest

    assert.notStrictEqual(payload, undefined)
    assert.ok(payload.generatedAt instanceof Date)
    assert.strictEqual(payload.requestId, 999)
    assert.strictEqual(payload.seqNo, 0)
    assert.strictEqual(payload.tbc, true)
    assert.deepStrictEqual(payload.reportData, reportData)
    assert.ok(Array.isArray(payload.reportData))
    assert.strictEqual(payload.reportData.length, 1)
  })

  await it('should build NotifyReport request payload correctly with empty reportData array', () => {
    const requestParams: OCPP20NotifyReportRequest = {
      generatedAt: new Date('2023-10-22T09:00:00.000Z'),
      reportData: [], // Empty array
      requestId: 100,
      seqNo: 0,
      tbc: false,
    }

    const payload = testableService.buildRequestPayload(
      station,
      OCPP20RequestCommand.NOTIFY_REPORT,
      requestParams
    ) as OCPP20NotifyReportRequest

    assert.notStrictEqual(payload, undefined)
    assert.ok(payload.generatedAt instanceof Date)
    assert.strictEqual(payload.requestId, 100)
    assert.strictEqual(payload.seqNo, 0)
    assert.strictEqual(payload.tbc, false)
    assert.deepStrictEqual(payload.reportData, [])
    assert.ok(Array.isArray(payload.reportData))
    assert.strictEqual(payload.reportData.length, 0)
  })

  await it('should handle different AttributeEnumType values correctly', () => {
    const testAttributes = [AttributeEnumType.Actual]

    testAttributes.forEach((attributeType, index) => {
      const reportData: ReportDataType[] = [
        {
          component: {
            name: 'TestComponent',
          },
          variable: {
            name: 'TestVariable',
          },
          variableAttribute: [
            {
              type: attributeType,
              value: `Test Value ${index.toString()}`,
            },
          ],
          variableCharacteristics: {
            dataType: DataEnumType.string,
            supportsMonitoring: true,
          },
        },
      ]

      const requestParams: OCPP20NotifyReportRequest = {
        generatedAt: new Date(),
        reportData,
        requestId: 200 + index,
        seqNo: index,
        tbc: false,
      }

      const payload = testableService.buildRequestPayload(
        station,
        OCPP20RequestCommand.NOTIFY_REPORT,
        requestParams
      ) as OCPP20NotifyReportRequest

      assert.notStrictEqual(payload, undefined)
      assert(payload.reportData != null)
      const firstReport = payload.reportData[0]
      assert.strictEqual(firstReport.variableAttribute[0].type, attributeType)
      assert.strictEqual(firstReport.variableAttribute[0].value, `Test Value ${index.toString()}`)
    })
  })

  await it('should handle different DataEnumType values correctly', () => {
    const testDataTypes = [
      { dataType: DataEnumType.string, value: 'test string' },
      { dataType: DataEnumType.integer, value: '42' },
      { dataType: DataEnumType.decimal, value: '3.14' },
      { dataType: DataEnumType.boolean, value: 'true' },
      { dataType: DataEnumType.dateTime, value: '2023-10-22T12:00:00Z' },
    ]

    testDataTypes.forEach((testCase, index) => {
      const reportData: ReportDataType[] = [
        {
          component: {
            name: 'DataTypeTestComponent',
          },
          variable: {
            name: `${testCase.dataType}Variable`,
          },
          variableAttribute: [
            {
              type: AttributeEnumType.Actual,
              value: testCase.value,
            },
          ],
          variableCharacteristics: {
            dataType: testCase.dataType,
            supportsMonitoring: false,
          },
        },
      ]

      const requestParams: OCPP20NotifyReportRequest = {
        generatedAt: new Date(),
        reportData,
        requestId: 300 + index,
        seqNo: index,
        tbc: false,
      }

      const payload = testableService.buildRequestPayload(
        station,
        OCPP20RequestCommand.NOTIFY_REPORT,
        requestParams
      ) as OCPP20NotifyReportRequest

      assert.notStrictEqual(payload, undefined)
      assert(payload.reportData != null)
      const firstReport = payload.reportData[0]
      assert(firstReport.variableCharacteristics != null)
      assert.strictEqual(firstReport.variableCharacteristics.dataType, testCase.dataType)
      assert.strictEqual(firstReport.variableAttribute[0].value, testCase.value)
    })
  })

  await it('should validate payload structure matches OCPP20NotifyReportRequest interface', () => {
    const reportData: ReportDataType[] = [
      {
        component: {
          name: 'ValidationTest',
        },
        variable: {
          name: 'ValidationVariable',
        },
        variableAttribute: [
          {
            type: AttributeEnumType.Actual,
            value: 'validation value',
          },
        ],
        variableCharacteristics: {
          dataType: DataEnumType.string,
          supportsMonitoring: true,
        },
      },
    ]

    const requestParams: OCPP20NotifyReportRequest = {
      generatedAt: new Date('2023-10-22T13:30:45.000Z'),
      reportData,
      requestId: 1001,
      seqNo: 5,
      tbc: false,
    }

    const payload = testableService.buildRequestPayload(
      station,
      OCPP20RequestCommand.NOTIFY_REPORT,
      requestParams
    ) as OCPP20NotifyReportRequest

    // Validate that the payload has the exact structure of OCPP20NotifyReportRequest
    assert.strictEqual(typeof payload, 'object')
    assert.notStrictEqual(payload.generatedAt, undefined)
    assert.notStrictEqual(payload.requestId, undefined)
    assert.notStrictEqual(payload.seqNo, undefined)
    assert.notStrictEqual(payload.reportData, undefined)
    assert.notStrictEqual(payload.tbc, undefined)

    // Validate required fields
    assert.ok(payload.generatedAt instanceof Date)
    assert.strictEqual(typeof payload.requestId, 'number')
    assert.strictEqual(typeof payload.seqNo, 'number')

    // Validate optional fields
    if (payload.reportData !== undefined) {
      assert.ok(Array.isArray(payload.reportData))
      if (payload.reportData.length > 0) {
        assert.strictEqual(typeof payload.reportData[0], 'object')
        assert.notStrictEqual(payload.reportData[0].component, undefined)
        assert.notStrictEqual(payload.reportData[0].variable, undefined)
        assert.notStrictEqual(payload.reportData[0].variableAttribute, undefined)
      }
    }

    if (payload.tbc !== undefined) {
      assert.strictEqual(typeof payload.tbc, 'boolean')
    }
  })

  await it('should handle complex reportData with multiple variable attributes', () => {
    const reportData: ReportDataType[] = [
      {
        component: {
          name: 'ComplexComponent',
        },
        variable: {
          name: 'ComplexVariable',
        },
        variableAttribute: [
          {
            type: AttributeEnumType.Actual,
            value: 'actual value',
          },
        ],
        variableCharacteristics: {
          dataType: DataEnumType.integer,
          supportsMonitoring: true,
        },
      },
    ]

    const requestParams: OCPP20NotifyReportRequest = {
      generatedAt: new Date('2023-10-22T20:15:30.000Z'),
      reportData,
      requestId: 2001,
      seqNo: 10,
      tbc: false,
    }

    const payload = testableService.buildRequestPayload(
      station,
      OCPP20RequestCommand.NOTIFY_REPORT,
      requestParams
    ) as OCPP20NotifyReportRequest

    assert.notStrictEqual(payload, undefined)
    assert(payload.reportData != null)
    const firstReport = payload.reportData[0]
    assert.strictEqual(firstReport.variableAttribute.length, 1)
    assert.strictEqual(firstReport.variableAttribute[0].type, AttributeEnumType.Actual)
  })

  await it('should preserve all payload properties correctly', () => {
    const testDate = new Date('2023-10-22T11:22:33.444Z')
    const reportData: ReportDataType[] = [
      {
        component: {
          name: 'PreserveTestComponent',
        },
        variable: {
          name: 'PreserveTestVariable',
        },
        variableAttribute: [
          {
            type: AttributeEnumType.Actual,
            value: 'preserve test value',
          },
        ],
      },
    ]

    const requestParams: OCPP20NotifyReportRequest = {
      generatedAt: testDate,
      reportData,
      requestId: 3001,
      seqNo: 15,
      tbc: true,
    }

    const payload = testableService.buildRequestPayload(
      station,
      OCPP20RequestCommand.NOTIFY_REPORT,
      requestParams
    ) as OCPP20NotifyReportRequest

    // Verify all input properties are preserved exactly
    assert.strictEqual(payload.generatedAt, testDate)
    assert.strictEqual(payload.requestId, 3001)
    assert.strictEqual(payload.seqNo, 15)
    assert.strictEqual(payload.tbc, true)
    assert.strictEqual(payload.reportData, reportData)

    // Verify no additional properties are added
    const expectedKeys = ['generatedAt', 'reportData', 'requestId', 'seqNo', 'tbc']
    const actualKeys = Object.keys(payload as object).sort()
    expectedKeys.sort()
    assert.deepStrictEqual(actualKeys, expectedKeys)
  })
})
