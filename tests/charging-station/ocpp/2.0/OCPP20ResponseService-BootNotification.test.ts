/**
 * @file Tests for OCPP20ResponseService BootNotification response handler
 * @description Verifies correct handling of BootNotification responses
 *
 * Covers:
 * - B01 BootNotificationResponse handler branch coverage
 * - ACCEPTED status — stores response and emits accepted event
 * - PENDING status — stores response and emits pending event
 * - REJECTED status — stores response and emits rejected event
 * - HeartbeatInterval configuration key set when interval provided
 * - Interval handling skipped when interval absent
 * - Invalid registration status — deletes response and logs error
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { MockChargingStation } from '../../ChargingStationTestUtils.js'

import { OCPP20ResponseService } from '../../../../src/charging-station/ocpp/2.0/OCPP20ResponseService.js'
import {
  ChargingStationEvents,
  type OCPP20BootNotificationResponse,
  OCPP20OptionalVariableName,
  OCPP20RequestCommand,
  OCPPVersion,
  RegistrationStatusEnumType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'

/**
 * Create a mock station suitable for BootNotification response tests.
 * Uses ocppStrictCompliance: false to bypass AJV validation so the
 * handler logic can be tested in isolation.
 * @returns A mock station configured for BootNotification tests
 */
function createBootNotificationStation (): MockChargingStation {
  const { station } = createMockChargingStation({
    baseName: TEST_CHARGING_STATION_BASE_NAME,
    connectorsCount: 1,
    heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
    stationInfo: {
      // Bypass AJV schema validation — tests focus on handler logic
      ocppStrictCompliance: false,
      ocppVersion: OCPPVersion.VERSION_201,
    },
    websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
  })
  return station as MockChargingStation
}

await describe('B01 - BootNotificationResponse handler', async () => {
  let responseService: OCPP20ResponseService
  let mockStation: MockChargingStation

  beforeEach(() => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] })
    responseService = new OCPP20ResponseService()
    mockStation = createBootNotificationStation()
  })

  afterEach(() => {
    standardCleanup()
  })

  /**
   * Helper to dispatch a BootNotificationResponse through the public responseHandler.
   * @param payload - The BootNotificationResponse payload to dispatch
   * @returns Resolves when the response handler completes
   */
  async function dispatch (payload: OCPP20BootNotificationResponse): Promise<void> {
    await responseService.responseHandler(
      mockStation,
      OCPP20RequestCommand.BOOT_NOTIFICATION,
      payload as unknown as Parameters<typeof responseService.responseHandler>[2],
      {} as Parameters<typeof responseService.responseHandler>[3]
    )
  }

  await it('should store response and emit accepted event for ACCEPTED status', async () => {
    const emitSpy = mock.method(mockStation, 'emitChargingStationEvent')
    const payload: OCPP20BootNotificationResponse = {
      currentTime: new Date(),
      interval: 300,
      status: RegistrationStatusEnumType.ACCEPTED,
    }
    await dispatch(payload)
    assert.strictEqual(mockStation.bootNotificationResponse, payload)
    assert.strictEqual(emitSpy.mock.calls.length, 1)
    assert.strictEqual(emitSpy.mock.calls[0].arguments[0], ChargingStationEvents.accepted)
  })

  await it('should store response and emit pending event for PENDING status', async () => {
    const emitSpy = mock.method(mockStation, 'emitChargingStationEvent')
    const payload: OCPP20BootNotificationResponse = {
      currentTime: new Date(),
      interval: 300,
      status: RegistrationStatusEnumType.PENDING,
    }
    await dispatch(payload)
    assert.strictEqual(mockStation.bootNotificationResponse, payload)
    assert.strictEqual(emitSpy.mock.calls.length, 1)
    assert.strictEqual(emitSpy.mock.calls[0].arguments[0], ChargingStationEvents.pending)
  })

  await it('should store response and emit rejected event for REJECTED status', async () => {
    const emitSpy = mock.method(mockStation, 'emitChargingStationEvent')
    const payload: OCPP20BootNotificationResponse = {
      currentTime: new Date(),
      interval: 300,
      status: RegistrationStatusEnumType.REJECTED,
    }
    await dispatch(payload)
    assert.strictEqual(mockStation.bootNotificationResponse, payload)
    assert.strictEqual(emitSpy.mock.calls.length, 1)
    assert.strictEqual(emitSpy.mock.calls[0].arguments[0], ChargingStationEvents.rejected)
  })

  await it('should set HeartbeatInterval configuration key when interval is provided', async () => {
    const payload: OCPP20BootNotificationResponse = {
      currentTime: new Date(),
      interval: 300,
      status: RegistrationStatusEnumType.ACCEPTED,
    }
    await dispatch(payload)
    const configKey = mockStation.ocppConfiguration?.configurationKey
    assert.notStrictEqual(configKey, undefined)
    if (configKey == null) { assert.fail('Expected configKey to be defined') }
    assert.strictEqual(configKey.length, 1)
    assert.strictEqual(configKey[0].key, OCPP20OptionalVariableName.HeartbeatInterval)
    assert.strictEqual(configKey[0].value, '300')
  })

  await it('should skip interval handling when interval is not provided', async () => {
    const payload = {
      currentTime: new Date(),
      status: RegistrationStatusEnumType.ACCEPTED,
    } as unknown as OCPP20BootNotificationResponse
    await dispatch(payload)
    const configKey = mockStation.ocppConfiguration?.configurationKey
    assert.notStrictEqual(configKey, undefined)
    assert.strictEqual(configKey?.length, 0)
  })

  await it('should delete response and log error for invalid registration status', async () => {
    const payload = {
      currentTime: new Date(),
      interval: 300,
      status: 'INVALID_STATUS',
    } as unknown as OCPP20BootNotificationResponse
    await dispatch(payload)
    assert.strictEqual(mockStation.bootNotificationResponse, undefined)
  })
})
