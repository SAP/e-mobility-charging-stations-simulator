/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  GenericDeviceModelStatusEnumType,
  OCPP20ComponentName,
  type OCPP20GetBaseReportRequest,
  OCPP20VariableName,
  ReportBaseEnumType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { createChargingStationWithEvses } from '../../../ChargingStationFactory.js'
import {
  TEST_CHARGE_POINT_MODEL,
  TEST_CHARGE_POINT_SERIAL_NUMBER,
  TEST_CHARGE_POINT_VENDOR,
  TEST_CHARGING_STATION_NAME,
  TEST_FIRMWARE_VERSION,
} from './OCPP20TestConstants.js'

await describe('OCPP20IncomingRequestService GetBaseReport integration tests', async () => {
  const mockChargingStation = createChargingStationWithEvses({
    baseName: TEST_CHARGING_STATION_NAME,
    heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
    stationInfo: {
      chargePointModel: TEST_CHARGE_POINT_MODEL,
      chargePointSerialNumber: TEST_CHARGE_POINT_SERIAL_NUMBER,
      chargePointVendor: TEST_CHARGE_POINT_VENDOR,
      firmwareVersion: TEST_FIRMWARE_VERSION,
      ocppStrictCompliance: false,
    },
    websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
  })

  const incomingRequestService = new OCPP20IncomingRequestService()

  await it('Should handle GetBaseReport request with ConfigurationInventory', () => {
    const request: OCPP20GetBaseReportRequest = {
      reportBase: ReportBaseEnumType.ConfigurationInventory,
      requestId: 1,
    }

    const response = (incomingRequestService as any).handleRequestGetBaseReport(
      mockChargingStation,
      request
    )

    expect(response).toBeDefined()
    expect(response.status).toBe(GenericDeviceModelStatusEnumType.Accepted)
  })

  await it('Should handle GetBaseReport request with FullInventory', () => {
    const request: OCPP20GetBaseReportRequest = {
      reportBase: ReportBaseEnumType.FullInventory,
      requestId: 2,
    }

    const response = (incomingRequestService as any).handleRequestGetBaseReport(
      mockChargingStation,
      request
    )

    expect(response).toBeDefined()
    expect(response.status).toBe(GenericDeviceModelStatusEnumType.Accepted)
  })

  await it('Should handle GetBaseReport request with SummaryInventory', () => {
    const request: OCPP20GetBaseReportRequest = {
      reportBase: ReportBaseEnumType.SummaryInventory,
      requestId: 3,
    }

    const response = (incomingRequestService as any).handleRequestGetBaseReport(
      mockChargingStation,
      request
    )

    expect(response).toBeDefined()
    expect(response.status).toBe(GenericDeviceModelStatusEnumType.Accepted)
  })

  await it('Should return NotSupported for unsupported reportBase', () => {
    const request: OCPP20GetBaseReportRequest = {
      reportBase: 'UnsupportedReportBase' as any,
      requestId: 4,
    }

    const response = (incomingRequestService as any).handleRequestGetBaseReport(
      mockChargingStation,
      request
    )

    expect(response).toBeDefined()
    expect(response.status).toBe(GenericDeviceModelStatusEnumType.NotSupported)
  })

  await it('Should return EmptyResultSet when no data is available', () => {
    // Create a charging station with minimal configuration
    const minimalChargingStation = createChargingStationWithEvses({
      baseName: 'CS-MINIMAL',
      ocppConfiguration: {
        configurationKey: [],
      },
      stationInfo: {
        ocppStrictCompliance: false,
      },
    })

    const request: OCPP20GetBaseReportRequest = {
      reportBase: ReportBaseEnumType.ConfigurationInventory,
      requestId: 5,
    }

    const response = (incomingRequestService as any).handleRequestGetBaseReport(
      minimalChargingStation,
      request
    )

    expect(response).toBeDefined()
    expect(response.status).toBe(GenericDeviceModelStatusEnumType.EmptyResultSet)
  })

  await it('Should build correct report data for ConfigurationInventory', () => {
    const request: OCPP20GetBaseReportRequest = {
      reportBase: ReportBaseEnumType.ConfigurationInventory,
      requestId: 6,
    }

    // Test the buildReportData method indirectly by calling handleRequestGetBaseReport
    // and checking if it returns Accepted status (which means data was built successfully)
    const response = (incomingRequestService as any).handleRequestGetBaseReport(
      mockChargingStation,
      request
    )

    expect(response).toBeDefined()
    expect(response.status).toBe(GenericDeviceModelStatusEnumType.Accepted)

    // We can also test the buildReportData method directly if needed
    const reportData = (incomingRequestService as any).buildReportData(
      mockChargingStation,
      ReportBaseEnumType.ConfigurationInventory
    )

    expect(Array.isArray(reportData)).toBe(true)
    expect(reportData.length).toBeGreaterThan(0)

    // Check that each report data item has the expected structure
    for (const item of reportData) {
      expect(item.component).toBeDefined()
      expect(item.component.name).toBeDefined()
      expect(item.variable).toBeDefined()
      expect(item.variable.name).toBeDefined()
      expect(item.variableAttribute).toBeDefined()
      expect(Array.isArray(item.variableAttribute)).toBe(true)
      expect(item.variableCharacteristics).toBeDefined()
    }
  })

  await it('Should build correct report data for FullInventory with station info', () => {
    const reportData = (incomingRequestService as any).buildReportData(
      mockChargingStation,
      ReportBaseEnumType.FullInventory
    )

    expect(Array.isArray(reportData)).toBe(true)
    expect(reportData.length).toBeGreaterThan(0)

    // Check for station info variables
    const modelVariable = reportData.find(
      (item: any) =>
        item.variable.name === OCPP20VariableName.Model &&
        item.component.name === OCPP20ComponentName.ChargingStation
    )
    expect(modelVariable).toBeDefined()
    expect(modelVariable.variableAttribute[0].value).toBe(TEST_CHARGE_POINT_MODEL)

    const vendorVariable = reportData.find(
      (item: any) =>
        item.variable.name === OCPP20VariableName.VendorName &&
        item.component.name === OCPP20ComponentName.ChargingStation
    )
    expect(vendorVariable).toBeDefined()
    expect(vendorVariable.variableAttribute[0].value).toBe(TEST_CHARGE_POINT_VENDOR)
  })

  await it('Should build correct report data for SummaryInventory', () => {
    const reportData = (incomingRequestService as any).buildReportData(
      mockChargingStation,
      ReportBaseEnumType.SummaryInventory
    )

    expect(Array.isArray(reportData)).toBe(true)
    expect(reportData.length).toBeGreaterThan(0)

    // Check for availability state variable
    const availabilityVariable = reportData.find(
      (item: any) =>
        item.variable.name === OCPP20VariableName.AvailabilityState &&
        item.component.name === OCPP20ComponentName.ChargingStation
    )
    expect(availabilityVariable).toBeDefined()
    expect(availabilityVariable.variableCharacteristics.supportsMonitoring).toBe(true)
  })

  await it('Should handle GetBaseReport with EVSE structure', () => {
    // The createChargingStationWithEvses should create a station with EVSEs
    const stationWithEvses = createChargingStationWithEvses({
      baseName: 'CS-EVSE-001',
      hasEvses: true,
      stationInfo: {
        chargePointModel: 'EVSE Test Model',
        chargePointVendor: 'EVSE Test Vendor',
        ocppStrictCompliance: false,
      },
    })

    const reportData = (incomingRequestService as any).buildReportData(
      stationWithEvses,
      ReportBaseEnumType.FullInventory
    )

    expect(Array.isArray(reportData)).toBe(true)
    expect(reportData.length).toBeGreaterThan(0)

    // Check if EVSE components are included when EVSEs exist
    const evseComponents = reportData.filter(
      (item: any) => item.component.name === OCPP20ComponentName.EVSE
    )
    if (stationWithEvses.evses.size > 0) {
      expect(evseComponents.length).toBeGreaterThan(0)
    }
  })

  await it('Should validate unsupported reportBase correctly', () => {
    const reportData = (incomingRequestService as any).buildReportData(
      mockChargingStation,
      'InvalidReportBase' as any
    )

    expect(Array.isArray(reportData)).toBe(true)
    expect(reportData.length).toBe(0)
  })
})
