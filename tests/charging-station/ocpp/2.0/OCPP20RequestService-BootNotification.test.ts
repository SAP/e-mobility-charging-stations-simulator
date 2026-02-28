/**
 * @file Tests for OCPP20RequestService BootNotification
 * @description Unit tests for OCPP 2.0 BootNotification request building (B01)
 */
import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import { OCPP20RequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20RequestService.js'
import { OCPP20ResponseService } from '../../../../src/charging-station/ocpp/2.0/OCPP20ResponseService.js'
import {
  BootReasonEnumType,
  type OCPP20BootNotificationRequest,
  OCPP20RequestCommand,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { type ChargingStationType } from '../../../../src/types/ocpp/2.0/Common.js'
import { Constants } from '../../../../src/utils/index.js'
import {
  TEST_CHARGE_POINT_MODEL,
  TEST_CHARGE_POINT_SERIAL_NUMBER,
  TEST_CHARGE_POINT_VENDOR,
  TEST_CHARGING_STATION_BASE_NAME,
  TEST_FIRMWARE_VERSION,
} from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'
import {
  createTestableOCPP20RequestService,
  type TestableOCPP20RequestService,
} from './OCPP20TestUtils.js'

await describe('B01 - Cold Boot Charging Station', async () => {
  let mockResponseService: OCPP20ResponseService
  let requestService: OCPP20RequestService
  let testableRequestService: TestableOCPP20RequestService
  let station: ChargingStation

  beforeEach(() => {
    mockResponseService = new OCPP20ResponseService()
    requestService = new OCPP20RequestService(mockResponseService)
    testableRequestService = createTestableOCPP20RequestService(requestService)
    const { station: createdStation } = createMockChargingStation({
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
    station = createdStation
  })

  afterEach(() => {
    mock.restoreAll()
  })

  // FR: B01.FR.01
  await it('should build BootNotification request payload correctly with PowerUp reason', () => {
    const chargingStationInfo: ChargingStationType = {
      firmwareVersion: TEST_FIRMWARE_VERSION,
      model: TEST_CHARGE_POINT_MODEL,
      serialNumber: TEST_CHARGE_POINT_SERIAL_NUMBER,
      vendorName: TEST_CHARGE_POINT_VENDOR,
    }

    const requestParams: OCPP20BootNotificationRequest = {
      chargingStation: chargingStationInfo,
      reason: BootReasonEnumType.PowerUp,
    }

    const payload = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.BOOT_NOTIFICATION,
      requestParams
    ) as OCPP20BootNotificationRequest

    expect(payload).toBeDefined()
    expect(payload.chargingStation).toBeDefined()
    expect(payload.chargingStation.model).toBe(TEST_CHARGE_POINT_MODEL)
    expect(payload.chargingStation.vendorName).toBe(TEST_CHARGE_POINT_VENDOR)
    expect(payload.chargingStation.firmwareVersion).toBe(TEST_FIRMWARE_VERSION)
    expect(payload.chargingStation.serialNumber).toBe(TEST_CHARGE_POINT_SERIAL_NUMBER)
    expect(payload.reason).toBe(BootReasonEnumType.PowerUp)
  })

  // FR: B01.FR.02
  await it('should build BootNotification request payload correctly with ApplicationReset reason', () => {
    const chargingStationInfo: ChargingStationType = {
      firmwareVersion: '2.1.3',
      model: 'Advanced Model X1',
      serialNumber: 'ADV-SN-002',
      vendorName: 'Advanced Vendor',
    }

    const requestParams: OCPP20BootNotificationRequest = {
      chargingStation: chargingStationInfo,
      reason: BootReasonEnumType.ApplicationReset,
    }

    const payload = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.BOOT_NOTIFICATION,
      requestParams
    ) as OCPP20BootNotificationRequest

    expect(payload).toBeDefined()
    expect(payload.chargingStation).toBeDefined()
    expect(payload.chargingStation.model).toBe('Advanced Model X1')
    expect(payload.chargingStation.vendorName).toBe('Advanced Vendor')
    expect(payload.chargingStation.firmwareVersion).toBe('2.1.3')
    expect(payload.chargingStation.serialNumber).toBe('ADV-SN-002')
    expect(payload.reason).toBe(BootReasonEnumType.ApplicationReset)
  })

  // FR: B01.FR.03
  await it('should build BootNotification request payload correctly with minimal required fields', () => {
    const chargingStationInfo: ChargingStationType = {
      model: 'Basic Model',
      vendorName: 'Basic Vendor',
      // Optional fields omitted: firmwareVersion, serialNumber, customData, modem
    }

    const requestParams: OCPP20BootNotificationRequest = {
      chargingStation: chargingStationInfo,
      reason: BootReasonEnumType.FirmwareUpdate,
    }

    const payload = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.BOOT_NOTIFICATION,
      requestParams
    ) as OCPP20BootNotificationRequest

    expect(payload).toBeDefined()
    expect(payload.chargingStation).toBeDefined()
    expect(payload.chargingStation.model).toBe('Basic Model')
    expect(payload.chargingStation.vendorName).toBe('Basic Vendor')
    expect(payload.chargingStation.firmwareVersion).toBeUndefined()
    expect(payload.chargingStation.serialNumber).toBeUndefined()
    expect(payload.reason).toBe(BootReasonEnumType.FirmwareUpdate)
  })

  // FR: B01.FR.04
  await it('should handle all BootReasonEnumType values correctly', () => {
    const chargingStationInfo: ChargingStationType = {
      model: TEST_CHARGE_POINT_MODEL,
      vendorName: TEST_CHARGE_POINT_VENDOR,
    }

    const testReasons = [
      BootReasonEnumType.ApplicationReset,
      BootReasonEnumType.FirmwareUpdate,
      BootReasonEnumType.LocalReset,
      BootReasonEnumType.PowerUp,
      BootReasonEnumType.RemoteReset,
      BootReasonEnumType.ScheduledReset,
      BootReasonEnumType.Triggered,
      BootReasonEnumType.Unknown,
      BootReasonEnumType.Watchdog,
    ]

    testReasons.forEach(reason => {
      const requestParams: OCPP20BootNotificationRequest = {
        chargingStation: chargingStationInfo,
        reason,
      }

      const payload = testableRequestService.buildRequestPayload(
        station,
        OCPP20RequestCommand.BOOT_NOTIFICATION,
        requestParams
      ) as OCPP20BootNotificationRequest

      expect(payload).toBeDefined()
      expect(payload.reason).toBe(reason)
      expect(payload.chargingStation).toBeDefined()
    })
  })

  // FR: B01.FR.05
  await it('should validate payload structure matches OCPP20BootNotificationRequest interface', () => {
    const chargingStationInfo: ChargingStationType = {
      customData: {
        vendorId: 'TEST_VENDOR',
      },
      firmwareVersion: '3.0.0',
      model: 'Validation Test Model',
      serialNumber: 'VAL-001',
      vendorName: 'Validation Vendor',
    }

    const requestParams: OCPP20BootNotificationRequest = {
      chargingStation: chargingStationInfo,
      reason: BootReasonEnumType.PowerUp,
    }

    const payload = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.BOOT_NOTIFICATION,
      requestParams
    ) as OCPP20BootNotificationRequest

    // Validate that the payload has the exact structure of OCPP20BootNotificationRequest
    expect(typeof payload).toBe('object')
    expect(payload).toHaveProperty('chargingStation')
    expect(payload).toHaveProperty('reason')
    expect(Object.keys(payload as object)).toHaveLength(2)

    // Validate chargingStation structure
    expect(typeof payload.chargingStation).toBe('object')
    expect(payload.chargingStation).toHaveProperty('model')
    expect(payload.chargingStation).toHaveProperty('vendorName')
    expect(typeof payload.chargingStation.model).toBe('string')
    expect(typeof payload.chargingStation.vendorName).toBe('string')

    // Validate optional fields
    if (payload.chargingStation.firmwareVersion !== undefined) {
      expect(typeof payload.chargingStation.firmwareVersion).toBe('string')
    }
    if (payload.chargingStation.serialNumber !== undefined) {
      expect(typeof payload.chargingStation.serialNumber).toBe('string')
    }
    if (payload.chargingStation.customData !== undefined) {
      expect(typeof payload.chargingStation.customData).toBe('object')
    }
  })
})
