/**
 * @file Tests for OCPP20ResponseService simple response handlers
 * @description Verifies Heartbeat, NotifyReport, and StatusNotification response handling
 */

import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { MockChargingStation } from '../../ChargingStationTestUtils.js'

import { OCPP20ResponseService } from '../../../../src/charging-station/ocpp/2.0/OCPP20ResponseService.js'
import {
  type OCPP20HeartbeatResponse,
  type OCPP20NotifyReportResponse,
  OCPP20RequestCommand,
  type OCPP20StatusNotificationResponse,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'

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
      ocppVersion: OCPPVersion.VERSION_201,
    },
    websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
  })
  return station as MockChargingStation
}

await describe('Simple response handlers', async () => {
  let responseService: OCPP20ResponseService
  let mockStation: MockChargingStation

  beforeEach(() => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] })
    responseService = new OCPP20ResponseService()
    mockStation = createSimpleHandlerStation()
  })

  afterEach(() => {
    standardCleanup()
  })

  await describe('G02 - HeartbeatResponse handler', async () => {
    await it('should handle Heartbeat response without throwing', async () => {
      const payload: OCPP20HeartbeatResponse = { currentTime: new Date() }
      await responseService.responseHandler(
        mockStation,
        OCPP20RequestCommand.HEARTBEAT,
        payload as unknown as Parameters<typeof responseService.responseHandler>[2],
        {} as Parameters<typeof responseService.responseHandler>[3]
      )
    })
  })

  await describe('B07 - NotifyReportResponse handler', async () => {
    await it('should handle NotifyReport response without throwing', async () => {
      const payload: OCPP20NotifyReportResponse = {}
      await responseService.responseHandler(
        mockStation,
        OCPP20RequestCommand.NOTIFY_REPORT,
        payload as unknown as Parameters<typeof responseService.responseHandler>[2],
        {} as Parameters<typeof responseService.responseHandler>[3]
      )
    })
  })

  await describe('G01 - StatusNotificationResponse handler', async () => {
    await it('should handle StatusNotification response without throwing', async () => {
      const payload: OCPP20StatusNotificationResponse = {}
      await responseService.responseHandler(
        mockStation,
        OCPP20RequestCommand.STATUS_NOTIFICATION,
        payload as unknown as Parameters<typeof responseService.responseHandler>[2],
        {} as Parameters<typeof responseService.responseHandler>[3]
      )
    })
  })
})
