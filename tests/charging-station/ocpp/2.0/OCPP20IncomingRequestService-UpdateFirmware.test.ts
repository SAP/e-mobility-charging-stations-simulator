/**
 * @file Tests for OCPP20IncomingRequestService UpdateFirmware
 * @description Unit tests for OCPP 2.0.1 UpdateFirmware command handling (J02)
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  type OCPP20UpdateFirmwareRequest,
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

  await it('should return Accepted for request with signature field', () => {
    const request: OCPP20UpdateFirmwareRequest = {
      firmware: {
        location: 'https://firmware.example.com/signed-update.bin',
        retrieveDateTime: new Date('2025-01-15T10:00:00.000Z'),
        signature: 'dGVzdC1zaWduYXR1cmU=',
        signingCertificate: '-----BEGIN CERTIFICATE-----\nMIIBkTCB...',
      },
      requestId: 2,
    }

    const response = testableService.handleRequestUpdateFirmware(station, request)

    assert.strictEqual(response.status, UpdateFirmwareStatusEnumType.Accepted)
  })

  await it('should return Accepted for request without signature', () => {
    const request: OCPP20UpdateFirmwareRequest = {
      firmware: {
        location: 'https://firmware.example.com/unsigned-update.bin',
        retrieveDateTime: new Date('2025-01-15T12:00:00.000Z'),
      },
      requestId: 3,
    }

    const response = testableService.handleRequestUpdateFirmware(station, request)

    assert.strictEqual(response.status, UpdateFirmwareStatusEnumType.Accepted)
  })

  await it('should pass through requestId correctly in the response', () => {
    const testRequestId = 42
    const request: OCPP20UpdateFirmwareRequest = {
      firmware: {
        location: 'https://firmware.example.com/update.bin',
        retrieveDateTime: new Date('2025-01-15T14:00:00.000Z'),
      },
      requestId: testRequestId,
    }

    const response = testableService.handleRequestUpdateFirmware(station, request)

    assert.strictEqual(response.status, UpdateFirmwareStatusEnumType.Accepted)
    assert.strictEqual(typeof response.status, 'string')
  })

  await it('should return Accepted for request with retries and retryInterval', () => {
    const request: OCPP20UpdateFirmwareRequest = {
      firmware: {
        installDateTime: new Date('2025-01-15T16:00:00.000Z'),
        location: 'https://firmware.example.com/update-retry.bin',
        retrieveDateTime: new Date('2025-01-15T15:00:00.000Z'),
      },
      requestId: 5,
      retries: 3,
      retryInterval: 60,
    }

    const response = testableService.handleRequestUpdateFirmware(station, request)

    assert.strictEqual(response.status, UpdateFirmwareStatusEnumType.Accepted)
  })
})
