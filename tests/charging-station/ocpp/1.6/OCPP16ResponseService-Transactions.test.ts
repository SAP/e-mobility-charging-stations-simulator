/**
 * @file Tests for OCPP16ResponseService — StartTransaction and StopTransaction
 * @description Verifies the StartTransaction (§5.14) and StopTransaction (§5.16)
 * response handlers for OCPP 1.6, covering accepted/rejected authorization flows,
 * reservation handling, connector state mutations, and transaction lifecycle.
 */

import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/ChargingStation.js'
import type { OCPP16ResponseService } from '../../../../src/charging-station/ocpp/1.6/OCPP16ResponseService.js'
import type {
  OCPP16StartTransactionRequest,
  OCPP16StartTransactionResponse,
  OCPP16StopTransactionRequest,
  OCPP16StopTransactionResponse,
} from '../../../../src/types/ocpp/1.6/Transaction.js'
import type { MockOCPPRequestService } from '../../ChargingStationTestUtils.js'

import { OCPP16MeterValueUnit } from '../../../../src/types/index.js'
import { OCPP16RequestCommand } from '../../../../src/types/ocpp/1.6/Requests.js'
import { OCPP16AuthorizationStatus } from '../../../../src/types/ocpp/1.6/Transaction.js'
import {
  setupConnectorWithTransaction,
  standardCleanup,
} from '../../../helpers/TestLifecycleHelpers.js'
import { createOCPP16ResponseTestContext } from './OCPP16TestUtils.js'

await describe('OCPP16ResponseService — StartTransaction and StopTransaction', async () => {
  let station: ChargingStation
  let responseService: OCPP16ResponseService

  beforeEach(() => {
    const ctx = createOCPP16ResponseTestContext()
    station = ctx.station
    responseService = ctx.responseService

    // Mock requestHandler so OCPP requests (StatusNotification, MeterValues) resolve
    ;(station.ocppRequestService as unknown as MockOCPPRequestService).requestHandler =
      async () => Promise.resolve({})

    // Mock startMeterValues/stopMeterValues to avoid real timer setup
    station.startMeterValues = (_connectorId: number, _interval: number) => {
      /* noop */
    }
    station.stopMeterValues = (_connectorId: number) => {
      /* noop */
    }

    // Add MeterValues template required by buildTransactionBeginMeterValue
    for (const [connectorId] of station.connectors) {
      if (connectorId > 0) {
        const connector = station.getConnectorStatus(connectorId)
        if (connector != null) {
          connector.MeterValues = [{ unit: OCPP16MeterValueUnit.WATT_HOUR, value: '0' }]
        }
      }
    }
  })

  afterEach(() => {
    standardCleanup()
  })

  // ─── handleResponseStartTransaction (§5.14) ──────────────────────────

  await describe('handleResponseStartTransaction', async () => {
    // @spec §5.14 — TC_003_CS
    await it('should store transactionId on connector when idTagInfo is Accepted', async () => {
      // Arrange
      const connectorId = 1
      const transactionId = 42
      const requestPayload: OCPP16StartTransactionRequest = {
        connectorId,
        idTag: 'TEST-TAG-001',
        meterStart: 0,
        timestamp: new Date(),
      }
      const responsePayload: OCPP16StartTransactionResponse = {
        idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED },
        transactionId,
      }

      // Act
      await responseService.responseHandler(
        station,
        OCPP16RequestCommand.START_TRANSACTION,
        responsePayload,
        requestPayload
      )

      // Assert
      const connector = station.getConnectorStatus(connectorId)
      expect(connector?.transactionId).toBe(transactionId)
      expect(connector?.transactionStarted).toBe(true)
      expect(connector?.transactionIdTag).toBe('TEST-TAG-001')
      expect(connector?.transactionEnergyActiveImportRegisterValue).toBe(0)
    })

    // @spec §5.14 — TC_004_CS
    await it('should reset connector when idTagInfo is not Accepted', async () => {
      // Arrange
      const connectorId = 1
      const requestPayload: OCPP16StartTransactionRequest = {
        connectorId,
        idTag: 'TEST-TAG-001',
        meterStart: 0,
        timestamp: new Date(),
      }
      const responsePayload: OCPP16StartTransactionResponse = {
        idTagInfo: { status: OCPP16AuthorizationStatus.BLOCKED },
        transactionId: 99,
      }

      // Act
      await responseService.responseHandler(
        station,
        OCPP16RequestCommand.START_TRANSACTION,
        responsePayload,
        requestPayload
      )

      // Assert — connector should be reset (no transactionId)
      const connector = station.getConnectorStatus(connectorId)
      expect(connector?.transactionStarted).toBe(false)
      expect(connector?.transactionId).toBe(undefined)
    })

    // @spec §5.14 — TC_010_CS
    await it('should clear reservation after accepted start with reservationId', async () => {
      // Arrange
      const connectorId = 1
      const reservationId = 5
      const connector = station.getConnectorStatus(connectorId)
      if (connector != null) {
        connector.reservation = {
          connectorId,
          expiryDate: new Date(Date.now() + 3600000),
          idTag: 'TEST-TAG-001',
          reservationId,
        }
      }
      const requestPayload: OCPP16StartTransactionRequest = {
        connectorId,
        idTag: 'TEST-TAG-001',
        meterStart: 0,
        reservationId,
        timestamp: new Date(),
      }
      const responsePayload: OCPP16StartTransactionResponse = {
        idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED },
        transactionId: 100,
      }

      // Act
      await responseService.responseHandler(
        station,
        OCPP16RequestCommand.START_TRANSACTION,
        responsePayload,
        requestPayload
      )

      // Assert — reservation should be cleared
      const connectorAfter = station.getConnectorStatus(connectorId)
      expect(connectorAfter?.reservation).toBe(undefined)
      expect(connectorAfter?.transactionId).toBe(100)
      expect(connectorAfter?.transactionStarted).toBe(true)
    })

    await it('should set transactionStarted and transactionStart on Accepted response', async () => {
      // Arrange
      const connectorId = 1
      const requestTimestamp = new Date('2025-01-01T12:00:00Z')
      const requestPayload: OCPP16StartTransactionRequest = {
        connectorId,
        idTag: 'TEST-TAG-001',
        meterStart: 500,
        timestamp: requestTimestamp,
      }
      const responsePayload: OCPP16StartTransactionResponse = {
        idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED },
        transactionId: 7,
      }

      // Act
      await responseService.responseHandler(
        station,
        OCPP16RequestCommand.START_TRANSACTION,
        responsePayload,
        requestPayload
      )

      // Assert
      const connector = station.getConnectorStatus(connectorId)
      expect(connector?.transactionStarted).toBe(true)
      expect(connector?.transactionStart).toStrictEqual(requestTimestamp)
    })

    await it('should reset connector on rejected with Invalid status', async () => {
      // Arrange
      const connectorId = 1
      const requestPayload: OCPP16StartTransactionRequest = {
        connectorId,
        idTag: 'INVALID-TAG',
        meterStart: 0,
        timestamp: new Date(),
      }
      const responsePayload: OCPP16StartTransactionResponse = {
        idTagInfo: { status: OCPP16AuthorizationStatus.INVALID },
        transactionId: 55,
      }

      // Act
      await responseService.responseHandler(
        station,
        OCPP16RequestCommand.START_TRANSACTION,
        responsePayload,
        requestPayload
      )

      // Assert — connector should be reset
      const connector = station.getConnectorStatus(connectorId)
      expect(connector?.transactionStarted).toBe(false)
      expect(connector?.transactionId).toBe(undefined)
      expect(connector?.transactionIdTag).toBe(undefined)
    })
  })

  // ─── handleResponseStopTransaction (§5.16) ───────────────────────────

  await describe('handleResponseStopTransaction', async () => {
    // @spec §5.16 — TC_068_CS
    await it('should reset connector and log when idTagInfo is present', async () => {
      // Arrange
      setupConnectorWithTransaction(station, 1, { transactionId: 200 })
      const requestPayload: OCPP16StopTransactionRequest = {
        meterStop: 1000,
        timestamp: new Date(),
        transactionId: 200,
      }
      const responsePayload: OCPP16StopTransactionResponse = {
        idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED },
      }

      // Act
      await responseService.responseHandler(
        station,
        OCPP16RequestCommand.STOP_TRANSACTION,
        responsePayload,
        requestPayload
      )

      // Assert — connector should be reset after stop
      const connector = station.getConnectorStatus(1)
      expect(connector?.transactionStarted).toBe(false)
      expect(connector?.transactionId).toBe(undefined)
    })

    // @spec §5.16 — TC_072_CS
    await it('should reset connector without error when idTagInfo is absent', async () => {
      // Arrange
      setupConnectorWithTransaction(station, 1, { transactionId: 300 })
      const requestPayload: OCPP16StopTransactionRequest = {
        meterStop: 2000,
        timestamp: new Date(),
        transactionId: 300,
      }
      const responsePayload: OCPP16StopTransactionResponse = {}

      // Act
      await responseService.responseHandler(
        station,
        OCPP16RequestCommand.STOP_TRANSACTION,
        responsePayload,
        requestPayload
      )

      // Assert — connector should still be reset
      const connector = station.getConnectorStatus(1)
      expect(connector?.transactionStarted).toBe(false)
      expect(connector?.transactionId).toBe(undefined)
    })

    await it('should clear transactionIdTag and energy register after stop', async () => {
      // Arrange
      setupConnectorWithTransaction(station, 1, {
        energyImport: 5000,
        idTag: 'MY-TAG',
        transactionId: 400,
      })
      const requestPayload: OCPP16StopTransactionRequest = {
        meterStop: 5000,
        timestamp: new Date(),
        transactionId: 400,
      }
      const responsePayload: OCPP16StopTransactionResponse = {
        idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED },
      }

      // Act
      await responseService.responseHandler(
        station,
        OCPP16RequestCommand.STOP_TRANSACTION,
        responsePayload,
        requestPayload
      )

      // Assert
      const connector = station.getConnectorStatus(1)
      expect(connector?.transactionStarted).toBe(false)
      expect(connector?.transactionId).toBe(undefined)
      expect(connector?.transactionIdTag).toBe(undefined)
      expect(connector?.transactionEnergyActiveImportRegisterValue).toBe(0)
      expect(connector?.transactionRemoteStarted).toBe(false)
    })

    await it('should not throw when transactionId does not match any connector', async () => {
      // Arrange — no active transaction on any connector
      const requestPayload: OCPP16StopTransactionRequest = {
        meterStop: 0,
        timestamp: new Date(),
        transactionId: 99999,
      }
      const responsePayload: OCPP16StopTransactionResponse = {
        idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED },
      }

      // Act & Assert — should not throw, just log error and return
      await responseService.responseHandler(
        station,
        OCPP16RequestCommand.STOP_TRANSACTION,
        responsePayload,
        requestPayload
      )
    })
  })
})
