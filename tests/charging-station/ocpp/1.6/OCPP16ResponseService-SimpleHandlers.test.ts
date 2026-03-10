/**
 * @file Tests for OCPP16ResponseService simple response handlers
 * @module OCPP 1.6 — §4.9 DataTransfer, §6.2 DiagnosticsStatusNotification,
 *   §6.5 FirmwareStatusNotification, §4.10 Heartbeat, §4.7 MeterValues, §4.8 StatusNotification
 * @description Verifies DataTransfer, DiagnosticsStatusNotification, FirmwareStatusNotification,
 * Heartbeat, MeterValues, and StatusNotification response handling
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { MockChargingStation } from '../../ChargingStationTestUtils.js'

import { OCPP16ResponseService } from '../../../../src/charging-station/ocpp/1.6/OCPP16ResponseService.js'
import {
  type OCPP16DataTransferResponse,
  OCPP16DataTransferStatus,
  type OCPP16DiagnosticsStatusNotificationResponse,
  type OCPP16FirmwareStatusNotificationResponse,
  type OCPP16HeartbeatResponse,
  type OCPP16MeterValuesResponse,
  OCPP16RequestCommand,
  type OCPP16StatusNotificationResponse,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'
import { dispatchResponse } from './OCPP16TestUtils.js'

/**
 * Create a mock station suitable for simple response handler tests.
 * Uses ocppStrictCompliance: false to bypass AJV validation.
 * @returns A mock station configured for simple handler tests
 */
function createSimpleHandlerStation (): MockChargingStation {
  const { station } = createMockChargingStation({
    baseName: TEST_CHARGING_STATION_BASE_NAME,
    connectorsCount: 1,
    heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
    stationInfo: {
      ocppStrictCompliance: false,
      ocppVersion: OCPPVersion.VERSION_16,
    },
    websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
  })
  return station as MockChargingStation
}

await describe('OCPP16ResponseService — SimpleHandlers', async () => {
  let responseService: OCPP16ResponseService
  let mockStation: MockChargingStation

  beforeEach(() => {
    responseService = new OCPP16ResponseService()
    mockStation = createSimpleHandlerStation()
  })

  afterEach(() => {
    standardCleanup()
  })

  await describe('DataTransfer response handler', async () => {
    await it('should handle DataTransfer response without throwing', async () => {
      const payload: OCPP16DataTransferResponse = { status: OCPP16DataTransferStatus.ACCEPTED }
      await assert.doesNotReject(
        dispatchResponse(responseService, mockStation, OCPP16RequestCommand.DATA_TRANSFER, payload)
      )
    })
  })

  await describe('DiagnosticsStatusNotification response handler', async () => {
    await it('should handle DiagnosticsStatusNotification response without throwing', async () => {
      const payload: OCPP16DiagnosticsStatusNotificationResponse = {}
      await assert.doesNotReject(
        dispatchResponse(
          responseService,
          mockStation,
          OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION,
          payload
        )
      )
    })
  })

  await describe('FirmwareStatusNotification response handler', async () => {
    await it('should handle FirmwareStatusNotification response without throwing', async () => {
      const payload: OCPP16FirmwareStatusNotificationResponse = {}
      await assert.doesNotReject(
        dispatchResponse(
          responseService,
          mockStation,
          OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION,
          payload
        )
      )
    })
  })

  await describe('Heartbeat response handler', async () => {
    await it('should handle Heartbeat response without throwing', async () => {
      const payload: OCPP16HeartbeatResponse = { currentTime: new Date() }
      await assert.doesNotReject(
        dispatchResponse(responseService, mockStation, OCPP16RequestCommand.HEARTBEAT, payload)
      )
    })
  })

  await describe('MeterValues response handler', async () => {
    await it('should handle MeterValues response without throwing', async () => {
      const payload: OCPP16MeterValuesResponse = {}
      await assert.doesNotReject(
        dispatchResponse(responseService, mockStation, OCPP16RequestCommand.METER_VALUES, payload)
      )
    })
  })

  await describe('StatusNotification response handler', async () => {
    await it('should handle StatusNotification response without throwing', async () => {
      const payload: OCPP16StatusNotificationResponse = {}
      await assert.doesNotReject(
        dispatchResponse(
          responseService,
          mockStation,
          OCPP16RequestCommand.STATUS_NOTIFICATION,
          payload
        )
      )
    })
  })
})
