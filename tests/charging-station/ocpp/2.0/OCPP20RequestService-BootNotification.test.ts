/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import { OCPP20RequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20RequestService.js'
import { OCPP20ResponseService } from '../../../../src/charging-station/ocpp/2.0/OCPP20ResponseService.js'
import {
  BootReasonEnumType,
  type OCPP20BootNotificationRequest,
  OCPP20RequestCommand,
} from '../../../../src/types/index.js'
import { type ChargingStationType } from '../../../../src/types/ocpp/2.0/Common.js'
import { createChargingStation } from '../../../ChargingStationFactory.js'

await describe('OCPP20RequestService BootNotification integration tests', async () => {
  const mockResponseService = new OCPP20ResponseService()
  const requestService = new OCPP20RequestService(mockResponseService)

  const mockChargingStation = createChargingStation({
    baseName: 'CS-TEST-001',
    heartbeatInterval: 60,
    stationInfo: {
      chargePointModel: 'Test Model',
      chargePointSerialNumber: 'TEST-SN-001',
      chargePointVendor: 'Test Vendor',
      firmwareVersion: '1.0.0',
      ocppStrictCompliance: false,
    },
    websocketPingInterval: 30,
  })

  await it('Should build BootNotification request payload correctly with PowerUp reason', () => {
    const chargingStationInfo: ChargingStationType = {
      firmwareVersion: '1.0.0',
      model: 'Test Model',
      serialNumber: 'TEST-SN-001',
      vendorName: 'Test Vendor',
    }

    const requestParams: OCPP20BootNotificationRequest = {
      chargingStation: chargingStationInfo,
      reason: BootReasonEnumType.PowerUp,
    }

    // Access the private buildRequestPayload method via type assertion
    const payload = (requestService as any).buildRequestPayload(
      mockChargingStation,
      OCPP20RequestCommand.BOOT_NOTIFICATION,
      requestParams
    )

    expect(payload).toBeDefined()
    expect(payload.chargingStation).toBeDefined()
    expect(payload.chargingStation.model).toBe('Test Model')
    expect(payload.chargingStation.vendorName).toBe('Test Vendor')
    expect(payload.chargingStation.firmwareVersion).toBe('1.0.0')
    expect(payload.chargingStation.serialNumber).toBe('TEST-SN-001')
    expect(payload.reason).toBe(BootReasonEnumType.PowerUp)
  })

  await it('Should build BootNotification request payload correctly with ApplicationReset reason', () => {
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

    const payload = (requestService as any).buildRequestPayload(
      mockChargingStation,
      OCPP20RequestCommand.BOOT_NOTIFICATION,
      requestParams
    )

    expect(payload).toBeDefined()
    expect(payload.chargingStation).toBeDefined()
    expect(payload.chargingStation.model).toBe('Advanced Model X1')
    expect(payload.chargingStation.vendorName).toBe('Advanced Vendor')
    expect(payload.chargingStation.firmwareVersion).toBe('2.1.3')
    expect(payload.chargingStation.serialNumber).toBe('ADV-SN-002')
    expect(payload.reason).toBe(BootReasonEnumType.ApplicationReset)
  })

  await it('Should build BootNotification request payload correctly with minimal required fields', () => {
    const chargingStationInfo: ChargingStationType = {
      model: 'Basic Model',
      vendorName: 'Basic Vendor',
      // Optional fields omitted: firmwareVersion, serialNumber, customData, modem
    }

    const requestParams: OCPP20BootNotificationRequest = {
      chargingStation: chargingStationInfo,
      reason: BootReasonEnumType.FirmwareUpdate,
    }

    const payload = (requestService as any).buildRequestPayload(
      mockChargingStation,
      OCPP20RequestCommand.BOOT_NOTIFICATION,
      requestParams
    )

    expect(payload).toBeDefined()
    expect(payload.chargingStation).toBeDefined()
    expect(payload.chargingStation.model).toBe('Basic Model')
    expect(payload.chargingStation.vendorName).toBe('Basic Vendor')
    expect(payload.chargingStation.firmwareVersion).toBeUndefined()
    expect(payload.chargingStation.serialNumber).toBeUndefined()
    expect(payload.reason).toBe(BootReasonEnumType.FirmwareUpdate)
  })

  await it('Should handle all BootReasonEnumType values correctly', () => {
    const chargingStationInfo: ChargingStationType = {
      model: 'Test Model',
      vendorName: 'Test Vendor',
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

      const payload = (requestService as any).buildRequestPayload(
        mockChargingStation,
        OCPP20RequestCommand.BOOT_NOTIFICATION,
        requestParams
      )

      expect(payload).toBeDefined()
      expect(payload.reason).toBe(reason)
      expect(payload.chargingStation).toBeDefined()
    })
  })

  await it('Should validate payload structure matches OCPP20BootNotificationRequest interface', () => {
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

    const payload = (requestService as any).buildRequestPayload(
      mockChargingStation,
      OCPP20RequestCommand.BOOT_NOTIFICATION,
      requestParams
    )

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
