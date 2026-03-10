/**
 * @file Tests for OCPP16RequestService buildRequestPayload
 * @see OCPP 1.6 — §4.1 BootNotification, §4.2 Authorize, §4.9 DataTransfer,
 *   §4.8 StatusNotification, §4.10 Heartbeat, §4.3 StartTransaction, §4.4 StopTransaction,
 *   §4.7 MeterValues, §6.2 DiagnosticsStatusNotification, §6.5 FirmwareStatusNotification
 * @description Unit tests for OCPP 1.6 request payload construction across all 10 request commands
 */
import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type { TestableOCPP16RequestService } from '../../../../src/charging-station/ocpp/1.6/__testable__/index.js'

import {
  OCPP16ChargePointErrorCode,
  OCPP16ChargePointStatus,
  type OCPP16DataTransferRequest,
  OCPP16DiagnosticsStatus,
  type OCPP16DiagnosticsStatusNotificationRequest,
  OCPP16FirmwareStatus,
  type OCPP16FirmwareStatusNotificationRequest,
  type OCPP16MeterValuesRequest,
  OCPP16MeterValueUnit,
  OCPP16RequestCommand,
  type OCPP16StartTransactionRequest,
  type OCPP16StatusNotificationRequest,
  type OCPP16StopTransactionRequest,
} from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { createOCPP16RequestTestContext } from './OCPP16TestUtils.js'

await describe('OCPP16RequestService — buildRequestPayload', async () => {
  let testableRequestService: TestableOCPP16RequestService
  let station: ChargingStation

  beforeEach(() => {
    const context = createOCPP16RequestTestContext()
    testableRequestService = context.testableRequestService
    station = context.station
  })

  afterEach(() => {
    standardCleanup()
  })

  // ---- AUTHORIZE ----
  await describe('AUTHORIZE', async () => {
    await it('should build Authorize payload with default idTag when none provided', () => {
      const payload = testableRequestService.buildRequestPayload(
        station,
        OCPP16RequestCommand.AUTHORIZE,
        {}
      )

      expect(payload).toBeDefined()
      expect((payload as { idTag: string }).idTag).toBe('00000000')
    })

    await it('should build Authorize payload with provided idTag overriding default', () => {
      const payload = testableRequestService.buildRequestPayload(
        station,
        OCPP16RequestCommand.AUTHORIZE,
        { idTag: 'MY-TAG-001' }
      )

      expect(payload).toBeDefined()
      expect((payload as { idTag: string }).idTag).toBe('MY-TAG-001')
    })
  })

  // ---- BOOT_NOTIFICATION ----
  await it('should build BootNotification payload passing params through', () => {
    const params = {
      chargePointModel: 'TestModel',
      chargePointVendor: 'TestVendor',
      firmwareVersion: '1.0.0',
    }

    const payload = testableRequestService.buildRequestPayload(
      station,
      OCPP16RequestCommand.BOOT_NOTIFICATION,
      params
    )

    expect(payload).toBeDefined()
    expect(payload).toStrictEqual(params)
  })

  // ---- DATA_TRANSFER ----
  await it('should build DataTransfer payload passing params through', () => {
    const params: OCPP16DataTransferRequest = {
      data: 'test-data',
      vendorId: 'TestVendor',
    }

    const payload = testableRequestService.buildRequestPayload(
      station,
      OCPP16RequestCommand.DATA_TRANSFER,
      params
    )

    expect(payload).toBeDefined()
    expect((payload as OCPP16DataTransferRequest).vendorId).toBe('TestVendor')
    expect((payload as OCPP16DataTransferRequest).data).toBe('test-data')
  })

  // ---- DIAGNOSTICS_STATUS_NOTIFICATION ----
  await it('should build DiagnosticsStatusNotification payload passing params through', () => {
    const params: OCPP16DiagnosticsStatusNotificationRequest = {
      status: OCPP16DiagnosticsStatus.Uploading,
    }

    const payload = testableRequestService.buildRequestPayload(
      station,
      OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION,
      params
    )

    expect(payload).toBeDefined()
    expect((payload as OCPP16DiagnosticsStatusNotificationRequest).status).toBe(
      OCPP16DiagnosticsStatus.Uploading
    )
  })

  // ---- FIRMWARE_STATUS_NOTIFICATION ----
  await it('should build FirmwareStatusNotification payload passing params through', () => {
    const params: OCPP16FirmwareStatusNotificationRequest = {
      status: OCPP16FirmwareStatus.Downloaded,
    }

    const payload = testableRequestService.buildRequestPayload(
      station,
      OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION,
      params
    )

    expect(payload).toBeDefined()
    expect((payload as OCPP16FirmwareStatusNotificationRequest).status).toBe(
      OCPP16FirmwareStatus.Downloaded
    )
  })

  // ---- HEARTBEAT ----
  await it('should build Heartbeat payload as empty object', () => {
    const payload = testableRequestService.buildRequestPayload(
      station,
      OCPP16RequestCommand.HEARTBEAT
    )

    expect(payload).toBeDefined()
    expect(Object.keys(payload as object)).toHaveLength(0)
  })

  // ---- METER_VALUES ----
  await it('should build MeterValues payload passing params through', () => {
    const params: OCPP16MeterValuesRequest = {
      connectorId: 1,
      meterValue: [{ sampledValue: [{ value: '1000' }], timestamp: new Date() }],
      transactionId: 1,
    }

    const payload = testableRequestService.buildRequestPayload(
      station,
      OCPP16RequestCommand.METER_VALUES,
      params
    )

    expect(payload).toBeDefined()
    expect((payload as OCPP16MeterValuesRequest).connectorId).toBe(1)
    expect((payload as OCPP16MeterValuesRequest).transactionId).toBe(1)
  })

  // ---- START_TRANSACTION ----
  await describe('START_TRANSACTION', async () => {
    await it('should build StartTransaction payload with meterStart and timestamp', () => {
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.transactionEnergyActiveImportRegisterValue = 0
      }

      const payload = testableRequestService.buildRequestPayload(
        station,
        OCPP16RequestCommand.START_TRANSACTION,
        { connectorId: 1, idTag: 'TEST-TAG-001' }
      ) as OCPP16StartTransactionRequest

      expect(payload).toBeDefined()
      expect(payload.connectorId).toBe(1)
      expect(payload.idTag).toBe('TEST-TAG-001')
      expect(typeof payload.meterStart).toBe('number')
      expect(payload.timestamp).toBeDefined()
    })

    await it('should build StartTransaction payload with meterStart from connector energy reading', () => {
      // Arrange — set energy register value on connector 1
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.transactionEnergyActiveImportRegisterValue = 1500
      }

      // Act
      const payload = testableRequestService.buildRequestPayload(
        station,
        OCPP16RequestCommand.START_TRANSACTION,
        { connectorId: 1, idTag: 'ENERGY-TAG' }
      ) as OCPP16StartTransactionRequest

      // Assert
      expect(payload.meterStart).toBe(1500)
      expect(payload.idTag).toBe('ENERGY-TAG')
    })
  })

  // ---- STATUS_NOTIFICATION ----
  await it('should build StatusNotification payload passing params through', () => {
    const params: OCPP16StatusNotificationRequest = {
      connectorId: 1,
      errorCode: OCPP16ChargePointErrorCode.NO_ERROR,
      status: OCPP16ChargePointStatus.Available,
    }

    const payload = testableRequestService.buildRequestPayload(
      station,
      OCPP16RequestCommand.STATUS_NOTIFICATION,
      params
    )

    expect(payload).toBeDefined()
    expect((payload as OCPP16StatusNotificationRequest).connectorId).toBe(1)
    expect((payload as OCPP16StatusNotificationRequest).errorCode).toBe(
      OCPP16ChargePointErrorCode.NO_ERROR
    )
    expect((payload as OCPP16StatusNotificationRequest).status).toBe(
      OCPP16ChargePointStatus.Available
    )
  })

  // ---- STOP_TRANSACTION ----
  await describe('STOP_TRANSACTION', async () => {
    await it('should build StopTransaction payload with meterStop, timestamp, and idTag from transaction', () => {
      // Arrange — set up an active transaction on connector 1
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.transactionId = 42
        connectorStatus.transactionIdTag = 'STOP-TAG-001'
        connectorStatus.transactionEnergyActiveImportRegisterValue = 5000
      }

      // Act
      const payload = testableRequestService.buildRequestPayload(
        station,
        OCPP16RequestCommand.STOP_TRANSACTION,
        { transactionId: 42 }
      ) as OCPP16StopTransactionRequest

      // Assert
      expect(payload).toBeDefined()
      expect(payload.transactionId).toBe(42)
      expect(payload.meterStop).toBe(5000)
      expect(payload.idTag).toBe('STOP-TAG-001')
      expect(payload.timestamp).toBeDefined()
    })

    await it('should build StopTransaction payload with transactionData when enabled', () => {
      // Arrange — enable transactionDataMeterValues and set up transaction with MeterValues template
      if (station.stationInfo != null) {
        station.stationInfo.transactionDataMeterValues = true
      }
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.transactionId = 99
        connectorStatus.transactionIdTag = 'DATA-TAG'
        connectorStatus.transactionEnergyActiveImportRegisterValue = 3000
        connectorStatus.transactionBeginMeterValue = {
          sampledValue: [{ value: '0' }],
          timestamp: new Date(),
        }
        connectorStatus.MeterValues = [{ unit: OCPP16MeterValueUnit.WATT_HOUR, value: '0' }]
      }

      // Act
      const payload = testableRequestService.buildRequestPayload(
        station,
        OCPP16RequestCommand.STOP_TRANSACTION,
        { transactionId: 99 }
      ) as OCPP16StopTransactionRequest

      // Assert
      expect(payload).toBeDefined()
      expect(payload.transactionId).toBe(99)
      expect(payload.meterStop).toBe(3000)
      expect(payload.transactionData).toBeDefined()
      expect(Array.isArray(payload.transactionData)).toBe(true)
    })
  })
})
