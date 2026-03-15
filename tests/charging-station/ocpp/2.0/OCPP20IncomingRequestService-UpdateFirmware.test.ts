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
  ReasonCodeEnumType,
  UpdateFirmwareStatusEnumType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup, withMockTimers } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'
import {
  createMockCertificateManager,
  createMockStationWithRequestTracking,
} from './OCPP20TestUtils.js'

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

  await describe('Security Features', async () => {
    await it('should return InvalidCertificate for invalid signing certificate PEM', () => {
      // Arrange
      const certManager = createMockCertificateManager()
      const { station: stationWithCert } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        ocppRequestService: {
          requestHandler: mock.fn(async () => Promise.resolve({})),
        },
        stationInfo: {
          ocppStrictCompliance: false,
          ocppVersion: OCPPVersion.VERSION_201,
        },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })
      ;(stationWithCert as unknown as { certificateManager: unknown }).certificateManager =
        certManager

      const request: OCPP20UpdateFirmwareRequest = {
        firmware: {
          location: 'https://firmware.example.com/update.bin',
          retrieveDateTime: new Date('2025-01-15T10:00:00.000Z'),
          signingCertificate: 'INVALID-NOT-PEM',
        },
        requestId: 10,
      }

      // Act
      const response = testableService.handleRequestUpdateFirmware(stationWithCert, request)

      // Assert
      assert.strictEqual(response.status, UpdateFirmwareStatusEnumType.InvalidCertificate)
    })

    await it('should return Accepted for valid signing certificate PEM', () => {
      // Arrange
      const certManager = createMockCertificateManager()
      const { station: stationWithCert } = createMockChargingStation({
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
      ;(stationWithCert as unknown as { certificateManager: unknown }).certificateManager =
        certManager

      const request: OCPP20UpdateFirmwareRequest = {
        firmware: {
          location: 'https://firmware.example.com/update.bin',
          retrieveDateTime: new Date('2025-01-15T10:00:00.000Z'),
          signingCertificate:
            '-----BEGIN CERTIFICATE-----\nMIIBkTCB+wIJAK...\n-----END CERTIFICATE-----',
        },
        requestId: 11,
      }

      // Act
      const response = testableService.handleRequestUpdateFirmware(stationWithCert, request)

      // Assert
      assert.strictEqual(response.status, UpdateFirmwareStatusEnumType.Accepted)
    })

    await it('should return InvalidCertificate when no certificate manager is available', () => {
      const request: OCPP20UpdateFirmwareRequest = {
        firmware: {
          location: 'https://firmware.example.com/update.bin',
          retrieveDateTime: new Date('2025-01-15T10:00:00.000Z'),
          signingCertificate: '-----BEGIN CERTIFICATE-----\ndata\n-----END CERTIFICATE-----',
        },
        requestId: 12,
      }

      const response = testableService.handleRequestUpdateFirmware(station, request)

      assert.strictEqual(response.status, UpdateFirmwareStatusEnumType.InvalidCertificate)
    })

    await it('should return Rejected with TxInProgress when EVSE has active transactions', () => {
      // Arrange
      const { station: evseStation } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 2 },
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: {
          ocppStrictCompliance: false,
          ocppVersion: OCPPVersion.VERSION_201,
        },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      // Set an active transaction on EVSE 1's connector
      const evse1 = evseStation.evses.get(1)
      if (evse1 != null) {
        for (const connector of evse1.connectors.values()) {
          connector.transactionId = 'tx-active-001'
          break
        }
      }

      const request: OCPP20UpdateFirmwareRequest = {
        firmware: {
          location: 'https://firmware.example.com/update.bin',
          retrieveDateTime: new Date('2025-01-15T10:00:00.000Z'),
        },
        requestId: 20,
      }

      // Act
      const response = testableService.handleRequestUpdateFirmware(evseStation, request)

      // Assert
      assert.strictEqual(response.status, UpdateFirmwareStatusEnumType.Rejected)
      assert.notStrictEqual(response.statusInfo, undefined)
      assert.strictEqual(response.statusInfo?.reasonCode, ReasonCodeEnumType.TxInProgress)
    })

    await it('should return Accepted when no EVSE has active transactions', () => {
      // Arrange
      const { station: evseStation } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 2 },
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: {
          ocppStrictCompliance: false,
          ocppVersion: OCPPVersion.VERSION_201,
        },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      const request: OCPP20UpdateFirmwareRequest = {
        firmware: {
          location: 'https://firmware.example.com/update.bin',
          retrieveDateTime: new Date('2025-01-15T10:00:00.000Z'),
        },
        requestId: 21,
      }

      // Act
      const response = testableService.handleRequestUpdateFirmware(evseStation, request)

      // Assert
      assert.strictEqual(response.status, UpdateFirmwareStatusEnumType.Accepted)
    })

    await it('should cancel previous firmware update when new one arrives', async t => {
      const { sentRequests, station: trackingStation } = createMockStationWithRequestTracking()
      const service = new OCPP20IncomingRequestService()
      const testable = createTestableIncomingRequestService(service)

      const firstRequest: OCPP20UpdateFirmwareRequest = {
        firmware: {
          location: 'https://firmware.example.com/v1.bin',
          retrieveDateTime: new Date('2020-01-01T00:00:00.000Z'),
        },
        requestId: 100,
      }
      const firstResponse: OCPP20UpdateFirmwareResponse = {
        status: UpdateFirmwareStatusEnumType.Accepted,
      }

      await withMockTimers(t, ['setTimeout'], async () => {
        service.emit(
          OCPP20IncomingRequestCommand.UPDATE_FIRMWARE,
          trackingStation,
          firstRequest,
          firstResponse
        )

        await flushMicrotasks()
        assert.strictEqual(sentRequests.length, 1)
        assert.strictEqual(sentRequests[0].payload.status, FirmwareStatusEnumType.Downloading)

        const secondRequest: OCPP20UpdateFirmwareRequest = {
          firmware: {
            location: 'https://firmware.example.com/v2.bin',
            retrieveDateTime: new Date('2020-01-01T00:00:00.000Z'),
          },
          requestId: 101,
        }

        const secondResponse = testable.handleRequestUpdateFirmware(
          trackingStation,
          secondRequest
        )
        assert.strictEqual(secondResponse.status, UpdateFirmwareStatusEnumType.Accepted)

        await flushMicrotasks()

        const cancelNotification = sentRequests.find(
          r =>
            r.command === OCPP20RequestCommand.FIRMWARE_STATUS_NOTIFICATION &&
            r.payload.requestId === 100 &&
            r.payload.status === FirmwareStatusEnumType.DownloadFailed
        )
        assert.notStrictEqual(cancelNotification, undefined)
      })
    })
  })

  await describe('Firmware Update Lifecycle', async () => {
    await it('should send full lifecycle Downloading→Downloaded→Installing→Installed + SecurityEvent', async t => {
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

        await flushMicrotasks()
        assert.strictEqual(sentRequests.length, 1)
        assert.strictEqual(sentRequests[0].command, OCPP20RequestCommand.FIRMWARE_STATUS_NOTIFICATION)
        assert.strictEqual(sentRequests[0].payload.status, FirmwareStatusEnumType.Downloading)
        assert.strictEqual(sentRequests[0].payload.requestId, 1)

        t.mock.timers.tick(2000)
        await flushMicrotasks()
        assert.strictEqual(sentRequests.length, 3)
        assert.strictEqual(sentRequests[1].payload.status, FirmwareStatusEnumType.Downloaded)
        assert.strictEqual(sentRequests[2].payload.status, FirmwareStatusEnumType.Installing)

        t.mock.timers.tick(1000)
        await flushMicrotasks()
        assert.strictEqual(sentRequests[3].payload.status, FirmwareStatusEnumType.Installed)

        // H11: SecurityEventNotification for FirmwareUpdated
        assert.strictEqual(sentRequests.length, 5)
        assert.strictEqual(
          sentRequests[4].command,
          OCPP20RequestCommand.SECURITY_EVENT_NOTIFICATION
        )
        assert.strictEqual(sentRequests[4].payload.type, 'FirmwareUpdated')
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

    await it('should include requestId in all firmware status notifications', async t => {
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

        const firmwareNotifications = sentRequests.filter(
          r => r.command === OCPP20RequestCommand.FIRMWARE_STATUS_NOTIFICATION
        )
        assert.strictEqual(firmwareNotifications.length, 4)
        for (const req of firmwareNotifications) {
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

        await flushMicrotasks()
        assert.strictEqual(sentRequests.length, 1)

        t.mock.timers.tick(2000)
        await flushMicrotasks()
        assert.strictEqual(sentRequests.length, 2)
        assert.strictEqual(sentRequests[1].payload.status, FirmwareStatusEnumType.Downloaded)

        t.mock.timers.tick(500)
        await flushMicrotasks()
        assert.strictEqual(sentRequests[2].payload.status, FirmwareStatusEnumType.SignatureVerified)
        assert.strictEqual(sentRequests[3].payload.status, FirmwareStatusEnumType.Installing)

        t.mock.timers.tick(1000)
        await flushMicrotasks()
        assert.strictEqual(sentRequests[4].payload.status, FirmwareStatusEnumType.Installed)

        // H11: SecurityEventNotification after Installed
        assert.strictEqual(sentRequests.length, 6)
        assert.strictEqual(
          sentRequests[5].command,
          OCPP20RequestCommand.SECURITY_EVENT_NOTIFICATION
        )
        assert.strictEqual(sentRequests[5].payload.type, 'FirmwareUpdated')
      })
    })
  })
})
