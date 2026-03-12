/**
 * @file Tests for OCPP20IncomingRequestService UpdateFirmware
 * @description Unit tests for OCPP 2.0.1 UpdateFirmware command handling (J02)
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  OCPP20IncomingRequestCommand,
  type OCPP20UpdateFirmwareRequest,
  type OCPP20UpdateFirmwareResponse,
  OCPPVersion,
  UpdateFirmwareStatusEnumType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'

await describe('J02 - UpdateFirmware', async () => {
  let station: ChargingStation
  let testableService: ReturnType<typeof createTestableIncomingRequestService>

  beforeEach(() => {
    const { station: mockStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 1,
      evseConfiguration: { evsesCount: 1 },
      heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
      stationInfo: {
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
    })
    station = mockStation
    testableService = createTestableIncomingRequestService(new OCPP20IncomingRequestService())
  })

  afterEach(() => {
    standardCleanup()
  })

  await it('should return Accepted for valid firmware update request', () => {
    const request: OCPP20UpdateFirmwareRequest = {
      firmware: {
        location: 'https://firmware.example.com/update-v2.0.bin',
        retrieveDateTime: new Date('2025-01-15T10:00:00.000Z'),
      },
      requestId: 1,
    }

    const response = testableService.handleRequestUpdateFirmware(station, request)

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(typeof response, 'object')
    assert.strictEqual(response.status, UpdateFirmwareStatusEnumType.Accepted)
  })

  await it('should register UPDATE_FIRMWARE event listener in constructor', () => {
    const service = new OCPP20IncomingRequestService()
    assert.strictEqual(service.listenerCount(OCPP20IncomingRequestCommand.UPDATE_FIRMWARE), 1)
  })

  await it('should call simulateFirmwareUpdateLifecycle when UPDATE_FIRMWARE event emitted with Accepted response', () => {
    const service = new OCPP20IncomingRequestService()
    const simulateMock = mock.method(
      service as unknown as {
        simulateFirmwareUpdateLifecycle: (
          chargingStation: ChargingStation,
          requestId: number,
          signature?: string
        ) => Promise<void>
      },
      'simulateFirmwareUpdateLifecycle',
      () => Promise.resolve()
    )

    const request: OCPP20UpdateFirmwareRequest = {
      firmware: {
        location: 'https://firmware.example.com/update.bin',
        retrieveDateTime: new Date('2025-01-15T10:00:00.000Z'),
        signature: 'dGVzdA==',
      },
      requestId: 42,
    }
    const response: OCPP20UpdateFirmwareResponse = {
      status: UpdateFirmwareStatusEnumType.Accepted,
    }

    service.emit(OCPP20IncomingRequestCommand.UPDATE_FIRMWARE, station, request, response)

    assert.strictEqual(simulateMock.mock.callCount(), 1)
    assert.strictEqual(simulateMock.mock.calls[0].arguments[1], 42)
    assert.strictEqual(simulateMock.mock.calls[0].arguments[2], 'dGVzdA==')
  })

  await it('should NOT call simulateFirmwareUpdateLifecycle when UPDATE_FIRMWARE event emitted with Rejected response', () => {
    const service = new OCPP20IncomingRequestService()
    const simulateMock = mock.method(
      service as unknown as {
        simulateFirmwareUpdateLifecycle: (
          chargingStation: ChargingStation,
          requestId: number,
          signature?: string
        ) => Promise<void>
      },
      'simulateFirmwareUpdateLifecycle',
      () => Promise.resolve()
    )

    const request: OCPP20UpdateFirmwareRequest = {
      firmware: {
        location: 'https://firmware.example.com/update.bin',
        retrieveDateTime: new Date(),
      },
      requestId: 43,
    }
    const response: OCPP20UpdateFirmwareResponse = {
      status: UpdateFirmwareStatusEnumType.Rejected,
    }

    service.emit(OCPP20IncomingRequestCommand.UPDATE_FIRMWARE, station, request, response)

    assert.strictEqual(simulateMock.mock.callCount(), 0)
  })

  await it('should handle simulateFirmwareUpdateLifecycle rejection gracefully', async () => {
    const service = new OCPP20IncomingRequestService()
    mock.method(
      service as unknown as {
        simulateFirmwareUpdateLifecycle: (
          chargingStation: ChargingStation,
          requestId: number,
          signature?: string
        ) => Promise<void>
      },
      'simulateFirmwareUpdateLifecycle',
      () => Promise.reject(new Error('firmware lifecycle error'))
    )

    const request: OCPP20UpdateFirmwareRequest = {
      firmware: {
        location: 'https://firmware.example.com/update.bin',
        retrieveDateTime: new Date('2025-01-15T10:00:00.000Z'),
      },
      requestId: 99,
    }
    const response: OCPP20UpdateFirmwareResponse = {
      status: UpdateFirmwareStatusEnumType.Accepted,
    }

    service.emit(OCPP20IncomingRequestCommand.UPDATE_FIRMWARE, station, request, response)

    await Promise.resolve()
  })
})
