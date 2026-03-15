/**
 * @file Tests for OCPP20IncomingRequestService UpdateFirmware
 * @description Unit tests for OCPP 2.0.1 UpdateFirmware command handling (L01/L02)
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  FirmwareStatusEnumType,
  type FirmwareType,
  OCPP20IncomingRequestCommand,
  OCPP20RequestCommand,
  type OCPP20UpdateFirmwareRequest,
  type OCPP20UpdateFirmwareResponse,
  OCPPVersion,
  UpdateFirmwareStatusEnumType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup, withMockTimers } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'
import { createMockStationWithRequestTracking } from './OCPP20TestUtils.js'

const flushMicrotasks = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve()
  }
}

await describe('L01/L02 - UpdateFirmware', async () => {
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
          firmware: FirmwareType
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
    assert.deepStrictEqual(simulateMock.mock.calls[0].arguments[2], request.firmware)
  })

  await it('should NOT call simulateFirmwareUpdateLifecycle when UPDATE_FIRMWARE event emitted with Rejected response', () => {
    const service = new OCPP20IncomingRequestService()
    const simulateMock = mock.method(
      service as unknown as {
        simulateFirmwareUpdateLifecycle: (
          chargingStation: ChargingStation,
          requestId: number,
          firmware: FirmwareType
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
          firmware: FirmwareType
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

  await describe('Firmware Update Lifecycle', async () => {
    await it('should send full lifecycle Downloading→Downloaded→Installing→Installed', async t => {
      const { sentRequests, station: trackingStation } = createMockStationWithRequestTracking()
      const service = new OCPP20IncomingRequestService()

      const request: OCPP20UpdateFirmwareRequest = {
        firmware: {
          location: 'https://firmware.example.com/update.bin',
          retrieveDateTime: new Date('2020-01-01T00:00:00.000Z'),
        },
        requestId: 1,
      }
      const response: OCPP20UpdateFirmwareResponse = {
        status: UpdateFirmwareStatusEnumType.Accepted,
      }

      await withMockTimers(t, ['setTimeout'], async () => {
        service.emit(
          OCPP20IncomingRequestCommand.UPDATE_FIRMWARE,
          trackingStation,
          request,
          response
        )

        // Downloading is sent immediately
        await flushMicrotasks()
        assert.strictEqual(sentRequests.length, 1)
        assert.strictEqual(sentRequests[0].command, OCPP20RequestCommand.FIRMWARE_STATUS_NOTIFICATION)
        assert.strictEqual(sentRequests[0].payload.status, FirmwareStatusEnumType.Downloading)
        assert.strictEqual(sentRequests[0].payload.requestId, 1)

        // After 2s: Downloaded + Installing (no delay between them without signature/installDateTime)
        t.mock.timers.tick(2000)
        await flushMicrotasks()
        assert.strictEqual(sentRequests.length, 3)
        assert.strictEqual(sentRequests[1].payload.status, FirmwareStatusEnumType.Downloaded)
        assert.strictEqual(sentRequests[2].payload.status, FirmwareStatusEnumType.Installing)

        // After another 1s: Installed
        t.mock.timers.tick(1000)
        await flushMicrotasks()
        assert.strictEqual(sentRequests.length, 4)
        assert.strictEqual(sentRequests[3].payload.status, FirmwareStatusEnumType.Installed)
      })
    })

    await it('should send DownloadFailed for empty firmware location', async t => {
      const { sentRequests, station: trackingStation } = createMockStationWithRequestTracking()
      const service = new OCPP20IncomingRequestService()

      const request: OCPP20UpdateFirmwareRequest = {
        firmware: {
          location: '',
          retrieveDateTime: new Date('2020-01-01T00:00:00.000Z'),
        },
        requestId: 7,
      }
      const response: OCPP20UpdateFirmwareResponse = {
        status: UpdateFirmwareStatusEnumType.Accepted,
      }

      await withMockTimers(t, ['setTimeout'], async () => {
        service.emit(
          OCPP20IncomingRequestCommand.UPDATE_FIRMWARE,
          trackingStation,
          request,
          response
        )

        await flushMicrotasks()
        assert.strictEqual(sentRequests.length, 1)
        assert.strictEqual(sentRequests[0].payload.status, FirmwareStatusEnumType.Downloading)

        t.mock.timers.tick(2000)
        await flushMicrotasks()
        assert.strictEqual(sentRequests.length, 2)
        assert.strictEqual(sentRequests[1].payload.status, FirmwareStatusEnumType.DownloadFailed)
        assert.strictEqual(sentRequests[1].payload.requestId, 7)
      })
    })

    await it('should send DownloadFailed for malformed firmware location', async t => {
      const { sentRequests, station: trackingStation } = createMockStationWithRequestTracking()
      const service = new OCPP20IncomingRequestService()

      const request: OCPP20UpdateFirmwareRequest = {
        firmware: {
          location: 'not-a-valid-url',
          retrieveDateTime: new Date('2020-01-01T00:00:00.000Z'),
        },
        requestId: 8,
      }
      const response: OCPP20UpdateFirmwareResponse = {
        status: UpdateFirmwareStatusEnumType.Accepted,
      }

      await withMockTimers(t, ['setTimeout'], async () => {
        service.emit(
          OCPP20IncomingRequestCommand.UPDATE_FIRMWARE,
          trackingStation,
          request,
          response
        )

        await flushMicrotasks()
        t.mock.timers.tick(2000)
        await flushMicrotasks()

        assert.strictEqual(sentRequests.length, 2)
        assert.strictEqual(sentRequests[1].payload.status, FirmwareStatusEnumType.DownloadFailed)
        assert.strictEqual(sentRequests[1].payload.requestId, 8)
      })
    })

    await it('should include requestId in all lifecycle notifications', async t => {
      const { sentRequests, station: trackingStation } = createMockStationWithRequestTracking()
      const service = new OCPP20IncomingRequestService()
      const expectedRequestId = 42

      const request: OCPP20UpdateFirmwareRequest = {
        firmware: {
          location: 'https://firmware.example.com/update.bin',
          retrieveDateTime: new Date('2020-01-01T00:00:00.000Z'),
        },
        requestId: expectedRequestId,
      }
      const response: OCPP20UpdateFirmwareResponse = {
        status: UpdateFirmwareStatusEnumType.Accepted,
      }

      await withMockTimers(t, ['setTimeout'], async () => {
        service.emit(
          OCPP20IncomingRequestCommand.UPDATE_FIRMWARE,
          trackingStation,
          request,
          response
        )

        await flushMicrotasks()
        t.mock.timers.tick(2000)
        await flushMicrotasks()
        t.mock.timers.tick(1000)
        await flushMicrotasks()

        assert.strictEqual(sentRequests.length, 4)
        for (const req of sentRequests) {
          assert.strictEqual(req.payload.requestId, expectedRequestId)
        }
      })
    })

    await it('should include SignatureVerified when firmware has signature', async t => {
      const { sentRequests, station: trackingStation } = createMockStationWithRequestTracking()
      const service = new OCPP20IncomingRequestService()

      const request: OCPP20UpdateFirmwareRequest = {
        firmware: {
          location: 'https://firmware.example.com/update.bin',
          retrieveDateTime: new Date('2020-01-01T00:00:00.000Z'),
          signature: 'dGVzdA==',
        },
        requestId: 5,
      }
      const response: OCPP20UpdateFirmwareResponse = {
        status: UpdateFirmwareStatusEnumType.Accepted,
      }

      await withMockTimers(t, ['setTimeout'], async () => {
        service.emit(
          OCPP20IncomingRequestCommand.UPDATE_FIRMWARE,
          trackingStation,
          request,
          response
        )

        // Downloading
        await flushMicrotasks()
        assert.strictEqual(sentRequests.length, 1)

        // After 2s: Downloaded (then sleep(500) for SignatureVerified)
        t.mock.timers.tick(2000)
        await flushMicrotasks()
        assert.strictEqual(sentRequests.length, 2)
        assert.strictEqual(sentRequests[1].payload.status, FirmwareStatusEnumType.Downloaded)

        // After 500ms: SignatureVerified + Installing (no delay between them)
        t.mock.timers.tick(500)
        await flushMicrotasks()
        assert.strictEqual(sentRequests[2].payload.status, FirmwareStatusEnumType.SignatureVerified)
        assert.strictEqual(sentRequests[3].payload.status, FirmwareStatusEnumType.Installing)

        // After 1s: Installed
        t.mock.timers.tick(1000)
        await flushMicrotasks()
        assert.strictEqual(sentRequests.length, 5)
        assert.strictEqual(sentRequests[4].payload.status, FirmwareStatusEnumType.Installed)
      })
    })
  })
})
