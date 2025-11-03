/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import { OCPP20RequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20RequestService.js'
import { OCPP20ResponseService } from '../../../../src/charging-station/ocpp/2.0/OCPP20ResponseService.js'
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
import { createChargingStation } from '../../../ChargingStationFactory.js'
import {
  TEST_CHARGE_POINT_MODEL,
  TEST_CHARGE_POINT_SERIAL_NUMBER,
  TEST_CHARGE_POINT_VENDOR,
  TEST_CHARGING_STATION_BASE_NAME,
  TEST_FIRMWARE_VERSION,
} from './OCPP20TestConstants.js'

await describe('B08 - NotifyReport', async () => {
  const mockResponseService = new OCPP20ResponseService()
  const requestService = new OCPP20RequestService(mockResponseService)

  const mockChargingStation = createChargingStation({
    baseName: TEST_CHARGING_STATION_BASE_NAME,
    connectorsCount: 3,
    evseConfiguration: { evsesCount: 3 },
    heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
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

  await it('Should build NotifyReport request payload correctly with minimal required fields', () => {
    const requestParams: OCPP20NotifyReportRequest = {
      generatedAt: new Date('2023-10-22T10:30:00.000Z'),
      requestId: 123,
      seqNo: 0,
    }

    // Access the private buildRequestPayload method via type assertion
    const payload = (requestService as any).buildRequestPayload(
      mockChargingStation,
      OCPP20RequestCommand.NOTIFY_REPORT,
      requestParams
    )

    expect(payload).toBeDefined()
    expect(payload.generatedAt).toBeInstanceOf(Date)
    expect(payload.requestId).toBe(123)
    expect(payload.seqNo).toBe(0)
    expect(payload.tbc).toBeUndefined()
    expect(payload.reportData).toBeUndefined()
  })

  await it('Should build NotifyReport request payload correctly with reportData', () => {
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

    const payload = (requestService as any).buildRequestPayload(
      mockChargingStation,
      OCPP20RequestCommand.NOTIFY_REPORT,
      requestParams
    )

    expect(payload).toBeDefined()
    expect(payload.generatedAt).toBeInstanceOf(Date)
    expect(payload.requestId).toBe(456)
    expect(payload.seqNo).toBe(1)
    expect(payload.tbc).toBe(false)
    expect(payload.reportData).toEqual(reportData)
    expect(Array.isArray(payload.reportData)).toBe(true)
    expect(payload.reportData).toHaveLength(1)
  })

  await it('Should build NotifyReport request payload correctly with multiple reportData items', () => {
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

    const payload = (requestService as any).buildRequestPayload(
      mockChargingStation,
      OCPP20RequestCommand.NOTIFY_REPORT,
      requestParams
    )

    expect(payload).toBeDefined()
    expect(payload.generatedAt).toBeInstanceOf(Date)
    expect(payload.requestId).toBe(789)
    expect(payload.seqNo).toBe(2)
    expect(payload.tbc).toBe(true)
    expect(payload.reportData).toEqual(reportData)
    expect(Array.isArray(payload.reportData)).toBe(true)
    expect(payload.reportData).toHaveLength(3)
  })

  await it('Should build NotifyReport request payload correctly with fragmented report (tbc=true)', () => {
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

    const payload = (requestService as any).buildRequestPayload(
      mockChargingStation,
      OCPP20RequestCommand.NOTIFY_REPORT,
      requestParams
    )

    expect(payload).toBeDefined()
    expect(payload.generatedAt).toBeInstanceOf(Date)
    expect(payload.requestId).toBe(999)
    expect(payload.seqNo).toBe(0)
    expect(payload.tbc).toBe(true)
    expect(payload.reportData).toEqual(reportData)
    expect(Array.isArray(payload.reportData)).toBe(true)
    expect(payload.reportData).toHaveLength(1)
  })

  await it('Should build NotifyReport request payload correctly with empty reportData array', () => {
    const requestParams: OCPP20NotifyReportRequest = {
      generatedAt: new Date('2023-10-22T09:00:00.000Z'),
      reportData: [], // Empty array
      requestId: 100,
      seqNo: 0,
      tbc: false,
    }

    const payload = (requestService as any).buildRequestPayload(
      mockChargingStation,
      OCPP20RequestCommand.NOTIFY_REPORT,
      requestParams
    )

    expect(payload).toBeDefined()
    expect(payload.generatedAt).toBeInstanceOf(Date)
    expect(payload.requestId).toBe(100)
    expect(payload.seqNo).toBe(0)
    expect(payload.tbc).toBe(false)
    expect(payload.reportData).toEqual([])
    expect(Array.isArray(payload.reportData)).toBe(true)
    expect(payload.reportData).toHaveLength(0)
  })

  await it('Should handle different AttributeEnumType values correctly', () => {
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

      const payload = (requestService as any).buildRequestPayload(
        mockChargingStation,
        OCPP20RequestCommand.NOTIFY_REPORT,
        requestParams
      )

      expect(payload).toBeDefined()
      expect(payload.reportData[0].variableAttribute[0].type).toBe(attributeType)
      expect(payload.reportData[0].variableAttribute[0].value).toBe(
        `Test Value ${index.toString()}`
      )
    })
  })

  await it('Should handle different DataEnumType values correctly', () => {
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

      const payload = (requestService as any).buildRequestPayload(
        mockChargingStation,
        OCPP20RequestCommand.NOTIFY_REPORT,
        requestParams
      )

      expect(payload).toBeDefined()
      expect(payload.reportData[0].variableCharacteristics.dataType).toBe(testCase.dataType)
      expect(payload.reportData[0].variableAttribute[0].value).toBe(testCase.value)
    })
  })

  await it('Should validate payload structure matches OCPP20NotifyReportRequest interface', () => {
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

    const payload = (requestService as any).buildRequestPayload(
      mockChargingStation,
      OCPP20RequestCommand.NOTIFY_REPORT,
      requestParams
    )

    // Validate that the payload has the exact structure of OCPP20NotifyReportRequest
    expect(typeof payload).toBe('object')
    expect(payload).toHaveProperty('generatedAt')
    expect(payload).toHaveProperty('requestId')
    expect(payload).toHaveProperty('seqNo')
    expect(payload).toHaveProperty('reportData')
    expect(payload).toHaveProperty('tbc')

    // Validate required fields
    expect(payload.generatedAt).toBeInstanceOf(Date)
    expect(typeof payload.requestId).toBe('number')
    expect(typeof payload.seqNo).toBe('number')

    // Validate optional fields
    if (payload.reportData !== undefined) {
      expect(Array.isArray(payload.reportData)).toBe(true)
      if (payload.reportData.length > 0) {
        expect(typeof payload.reportData[0]).toBe('object')
        expect(payload.reportData[0]).toHaveProperty('component')
        expect(payload.reportData[0]).toHaveProperty('variable')
        expect(payload.reportData[0]).toHaveProperty('variableAttribute')
      }
    }

    if (payload.tbc !== undefined) {
      expect(typeof payload.tbc).toBe('boolean')
    }
  })

  await it('Should handle complex reportData with multiple variable attributes', () => {
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

    const payload = (requestService as any).buildRequestPayload(
      mockChargingStation,
      OCPP20RequestCommand.NOTIFY_REPORT,
      requestParams
    )

    expect(payload).toBeDefined()
    expect(payload.reportData[0].variableAttribute).toHaveLength(1)
    expect(payload.reportData[0].variableAttribute[0].type).toBe(AttributeEnumType.Actual)
  })

  await it('Should preserve all payload properties correctly', () => {
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

    const payload = (requestService as any).buildRequestPayload(
      mockChargingStation,
      OCPP20RequestCommand.NOTIFY_REPORT,
      requestParams
    )

    // Verify all input properties are preserved exactly
    expect(payload.generatedAt).toBe(testDate)
    expect(payload.requestId).toBe(3001)
    expect(payload.seqNo).toBe(15)
    expect(payload.tbc).toBe(true)
    expect(payload.reportData).toBe(reportData)

    // Verify no additional properties are added
    const expectedKeys = ['generatedAt', 'reportData', 'requestId', 'seqNo', 'tbc']
    const actualKeys = Object.keys(payload as object).sort()
    expectedKeys.sort()
    expect(actualKeys).toEqual(expectedKeys)
  })
})
