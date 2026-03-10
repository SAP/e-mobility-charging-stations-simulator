/**
 * @file Tests for OCPP20RequestService BootNotification
 * @description Unit tests for OCPP 2.0 BootNotification request building (B01)
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import {
  BootReasonEnumType,
  type OCPP20BootNotificationRequest,
  OCPP20RequestCommand,
} from '../../../../src/types/index.js'
import { type ChargingStationType } from '../../../../src/types/ocpp/2.0/Common.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import {
  TEST_CHARGE_POINT_MODEL,
  TEST_CHARGE_POINT_SERIAL_NUMBER,
  TEST_CHARGE_POINT_VENDOR,
  TEST_FIRMWARE_VERSION,
} from '../../ChargingStationTestConstants.js'
import {
  createOCPP20RequestTestContext,
  type TestableOCPP20RequestService,
} from './OCPP20TestUtils.js'

await describe('B01 - Cold Boot Charging Station', async () => {
  let testableRequestService: TestableOCPP20RequestService
  let station: ChargingStation

  beforeEach(() => {
    const context = createOCPP20RequestTestContext({
      stationInfo: {
        chargePointModel: TEST_CHARGE_POINT_MODEL,
        chargePointSerialNumber: TEST_CHARGE_POINT_SERIAL_NUMBER,
        chargePointVendor: TEST_CHARGE_POINT_VENDOR,
        firmwareVersion: TEST_FIRMWARE_VERSION,
      },
    })
    testableRequestService = context.testableRequestService
    station = context.station
  })

  afterEach(() => {
    standardCleanup()
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

    assert.notStrictEqual(payload, undefined)
    assert.notStrictEqual(payload.chargingStation, undefined)
    assert.strictEqual(payload.chargingStation.model, TEST_CHARGE_POINT_MODEL)
    assert.strictEqual(payload.chargingStation.vendorName, TEST_CHARGE_POINT_VENDOR)
    assert.strictEqual(payload.chargingStation.firmwareVersion, TEST_FIRMWARE_VERSION)
    assert.strictEqual(payload.chargingStation.serialNumber, TEST_CHARGE_POINT_SERIAL_NUMBER)
    assert.strictEqual(payload.reason, BootReasonEnumType.PowerUp)
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

    assert.notStrictEqual(payload, undefined)
    assert.notStrictEqual(payload.chargingStation, undefined)
    assert.strictEqual(payload.chargingStation.model, 'Advanced Model X1')
    assert.strictEqual(payload.chargingStation.vendorName, 'Advanced Vendor')
    assert.strictEqual(payload.chargingStation.firmwareVersion, '2.1.3')
    assert.strictEqual(payload.chargingStation.serialNumber, 'ADV-SN-002')
    assert.strictEqual(payload.reason, BootReasonEnumType.ApplicationReset)
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

    assert.notStrictEqual(payload, undefined)
    assert.notStrictEqual(payload.chargingStation, undefined)
    assert.strictEqual(payload.chargingStation.model, 'Basic Model')
    assert.strictEqual(payload.chargingStation.vendorName, 'Basic Vendor')
    assert.strictEqual(payload.chargingStation.firmwareVersion, undefined)
    assert.strictEqual(payload.chargingStation.serialNumber, undefined)
    assert.strictEqual(payload.reason, BootReasonEnumType.FirmwareUpdate)
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

      assert.notStrictEqual(payload, undefined)
      assert.strictEqual(payload.reason, reason)
      assert.notStrictEqual(payload.chargingStation, undefined)
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
    assert.strictEqual(typeof payload, 'object')
    assert.notStrictEqual(payload.chargingStation, undefined)
    assert.notStrictEqual(payload.reason, undefined)
    assert.strictEqual(Object.keys(payload as object).length, 2)

    // Validate chargingStation structure
    assert.strictEqual(typeof payload.chargingStation, 'object')
    assert.notStrictEqual(payload.chargingStation.model, undefined)
    assert.notStrictEqual(payload.chargingStation.vendorName, undefined)
    assert.strictEqual(typeof payload.chargingStation.model, 'string')
    assert.strictEqual(typeof payload.chargingStation.vendorName, 'string')

    // Validate optional fields
    if (payload.chargingStation.firmwareVersion !== undefined) {
      assert.strictEqual(typeof payload.chargingStation.firmwareVersion, 'string')
    }
    if (payload.chargingStation.serialNumber !== undefined) {
      assert.strictEqual(typeof payload.chargingStation.serialNumber, 'string')
    }
    if (payload.chargingStation.customData !== undefined) {
      assert.strictEqual(typeof payload.chargingStation.customData, 'object')
    }
  })
})
