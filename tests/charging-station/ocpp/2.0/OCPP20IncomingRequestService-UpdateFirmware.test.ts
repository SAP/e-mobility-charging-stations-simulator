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
  type FirmwareType,
  OCPP20ConnectorStatusEnumType,
  OCPP20FirmwareStatusEnumType,
  OCPP20IncomingRequestCommand,
  OCPP20RequestCommand,
  type OCPP20UpdateFirmwareRequest,
  type OCPP20UpdateFirmwareResponse,
  OCPPVersion,
  UpdateFirmwareStatusEnumType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import {
  flushMicrotasks,
  standardCleanup,
  withMockTimers,
} from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'
import {
  createMockCertificateManager,
  createMockStationWithRequestTracking,
  createStationWithCertificateManager,
} from './OCPP20TestUtils.js'

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

  await describe('Handler validation', async () => {
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
      createStationWithCertificateManager(stationWithCert, certManager)

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
      createStationWithCertificateManager(stationWithCert, certManager)

      const request: OCPP20UpdateFirmwareRequest = {
        firmware: {
          location: 'https://firmware.example.com/update.bin',
          retrieveDateTime: new Date('2025-01-15T10:00:00.000Z'),
          signingCertificate:
            '-----BEGIN CERTIFICATE-----\nMIIBkTCB0123...\n-----END CERTIFICATE-----',
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

    await it('should return Accepted when EVSE has active transactions (L01.FR.06: defer installation)', () => {
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
        const firstConnector = evse1.connectors.values().next().value
        if (firstConnector != null) {
          firstConnector.transactionId = 'tx-active-001'
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
      assert.strictEqual(response.status, UpdateFirmwareStatusEnumType.Accepted)
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
  })

  await describe('UPDATE_FIRMWARE event listener', async () => {
    let service: OCPP20IncomingRequestService
    let simulateMock: ReturnType<typeof mock.fn>

    beforeEach(() => {
      service = new OCPP20IncomingRequestService()
      simulateMock = mock.method(
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
    })

    await it('should register UPDATE_FIRMWARE event listener in constructor', () => {
      assert.strictEqual(service.listenerCount(OCPP20IncomingRequestCommand.UPDATE_FIRMWARE), 1)
    })

    await it('should call simulateFirmwareUpdateLifecycle when UPDATE_FIRMWARE event emitted with Accepted response', () => {
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

      await flushMicrotasks()
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
        assert.strictEqual(sentRequests[0].payload.status, OCPP20FirmwareStatusEnumType.Downloading)

        const secondRequest: OCPP20UpdateFirmwareRequest = {
          firmware: {
            location: 'https://firmware.example.com/v2.bin',
            retrieveDateTime: new Date('2020-01-01T00:00:00.000Z'),
          },
          requestId: 101,
        }

        const secondResponse = testable.handleRequestUpdateFirmware(trackingStation, secondRequest)
        assert.strictEqual(secondResponse.status, UpdateFirmwareStatusEnumType.AcceptedCanceled)

        await flushMicrotasks()
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
          assert.strictEqual(
            sentRequests[0].command,
            OCPP20RequestCommand.FIRMWARE_STATUS_NOTIFICATION
          )
          assert.strictEqual(
            sentRequests[0].payload.status,
            OCPP20FirmwareStatusEnumType.Downloading
          )
          assert.strictEqual(sentRequests[0].payload.requestId, 1)

          t.mock.timers.tick(2000)
          await flushMicrotasks()
          assert.strictEqual(sentRequests.length, 3)
          assert.strictEqual(
            sentRequests[1].payload.status,
            OCPP20FirmwareStatusEnumType.Downloaded
          )
          assert.strictEqual(
            sentRequests[2].payload.status,
            OCPP20FirmwareStatusEnumType.Installing
          )

          t.mock.timers.tick(1000)
          await flushMicrotasks()
          assert.strictEqual(sentRequests[3].payload.status, OCPP20FirmwareStatusEnumType.Installed)

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
          assert.strictEqual(
            sentRequests[0].payload.status,
            OCPP20FirmwareStatusEnumType.Downloading
          )

          t.mock.timers.tick(2000)
          await flushMicrotasks()
          assert.strictEqual(sentRequests.length, 2)
          assert.strictEqual(
            sentRequests[1].payload.status,
            OCPP20FirmwareStatusEnumType.DownloadFailed
          )
          assert.strictEqual(sentRequests[1].payload.requestId, 7)
        })
      })

      await it('should send DownloadFailed for malformed firmware location after exhausting retries (L01.FR.30)', async t => {
        const { sentRequests, station: trackingStation } = createMockStationWithRequestTracking()
        const service = new OCPP20IncomingRequestService()

        const request: OCPP20UpdateFirmwareRequest = {
          firmware: {
            location: 'not-a-valid-url',
            retrieveDateTime: new Date('2020-01-01T00:00:00.000Z'),
          },
          requestId: 8,
          retries: 2,
          retryInterval: 3,
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
          assert.strictEqual(
            sentRequests[0].payload.status,
            OCPP20FirmwareStatusEnumType.Downloading
          )

          // Initial download delay
          t.mock.timers.tick(2000)
          await flushMicrotasks()

          // Retry 1: retryInterval (3s) then re-send Downloading
          t.mock.timers.tick(3000)
          await flushMicrotasks()
          assert.strictEqual(sentRequests.length, 2)
          assert.strictEqual(
            sentRequests[1].payload.status,
            OCPP20FirmwareStatusEnumType.Downloading
          )

          // Retry 1: download delay (2s)
          t.mock.timers.tick(2000)
          await flushMicrotasks()

          // Retry 2: retryInterval (3s) then re-send Downloading
          t.mock.timers.tick(3000)
          await flushMicrotasks()
          assert.strictEqual(sentRequests.length, 3)
          assert.strictEqual(
            sentRequests[2].payload.status,
            OCPP20FirmwareStatusEnumType.Downloading
          )

          // Retry 2: download delay (2s) → retries exhausted → DownloadFailed
          t.mock.timers.tick(2000)
          await flushMicrotasks()
          assert.strictEqual(sentRequests.length, 4)
          assert.strictEqual(
            sentRequests[3].payload.status,
            OCPP20FirmwareStatusEnumType.DownloadFailed
          )
          assert.strictEqual(sentRequests[3].payload.requestId, 8)
        })
      })

      await it('should set newly-available EVSE to Unavailable during transaction wait (L01.FR.07)', async t => {
        const { sentRequests, station: trackingStation } = createMockStationWithRequestTracking()
        const service = new OCPP20IncomingRequestService()
        const { OCPP20VariableManager } =
          await import('../../../../src/charging-station/ocpp/2.0/OCPP20VariableManager.js')
        const { AttributeEnumType, OCPP20ComponentName } =
          await import('../../../../src/types/index.js')

        OCPP20VariableManager.getInstance().setVariables(trackingStation, [
          {
            attributeType: AttributeEnumType.Actual,
            attributeValue: 'false',
            component: { name: OCPP20ComponentName.ChargingStation as string },
            variable: { name: 'AllowNewSessionsPendingFirmwareUpdate' },
          },
        ])

        // Set active transactions on EVSE 1 and EVSE 2
        const evse1 = trackingStation.getEvseStatus(1)
        const evse2 = trackingStation.getEvseStatus(2)
        const evse1Connector = evse1?.connectors.values().next().value
        const evse2Connector = evse2?.connectors.values().next().value
        if (evse1Connector != null) evse1Connector.transactionId = 'tx-fw-001'
        if (evse2Connector != null) evse2Connector.transactionId = 'tx-fw-002'

        const request: OCPP20UpdateFirmwareRequest = {
          firmware: {
            location: 'https://firmware.example.com/update.bin',
            retrieveDateTime: new Date('2020-01-01T00:00:00.000Z'),
          },
          requestId: 10,
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
          // Downloaded
          t.mock.timers.tick(2000)
          await flushMicrotasks()

          // Now in transaction-wait loop: EVSE 3 (no transaction) should be set Unavailable
          const unavailableBeforeClear = sentRequests.filter(
            req => req.payload.connectorStatus === OCPP20ConnectorStatusEnumType.Unavailable
          )
          assert.notStrictEqual(unavailableBeforeClear.length, 0)

          // Clear EVSE 2's transaction → it becomes available
          if (evse2Connector != null) evse2Connector.transactionId = undefined
          const countBefore = unavailableBeforeClear.length

          // Advance one loop iteration (FIRMWARE_INSTALL_DELAY_MS = 5000ms)
          t.mock.timers.tick(5000)
          await flushMicrotasks()

          // EVSE 2 should now also be set to Unavailable
          const countAfter = sentRequests.filter(
            req => req.payload.connectorStatus === OCPP20ConnectorStatusEnumType.Unavailable
          ).length
          assert.ok(
            countAfter > countBefore,
            `Expected more Unavailable notifications after clearing EVSE 2 transaction (before: ${countBefore.toString()}, after: ${countAfter.toString()})`
          )

          // Clear EVSE 1's transaction to let the lifecycle proceed
          if (evse1Connector != null) evse1Connector.transactionId = undefined
          t.mock.timers.tick(5000)
          await flushMicrotasks()

          // Lifecycle should proceed to Installing
          const installingRequests = sentRequests.filter(
            req => req.payload.status === OCPP20FirmwareStatusEnumType.Installing
          )
          assert.strictEqual(installingRequests.length, 1)
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
            r =>
              (r.command) ===
              OCPP20RequestCommand.FIRMWARE_STATUS_NOTIFICATION
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
          assert.strictEqual(
            sentRequests[1].payload.status,
            OCPP20FirmwareStatusEnumType.Downloaded
          )

          t.mock.timers.tick(500)
          await flushMicrotasks()
          assert.strictEqual(sentRequests.length, 4)
          assert.strictEqual(
            sentRequests[2].payload.status,
            OCPP20FirmwareStatusEnumType.SignatureVerified
          )
          assert.strictEqual(
            sentRequests[3].payload.status,
            OCPP20FirmwareStatusEnumType.Installing
          )

          t.mock.timers.tick(1000)
          await flushMicrotasks()
          assert.strictEqual(sentRequests[4].payload.status, OCPP20FirmwareStatusEnumType.Installed)

          // H11: SecurityEventNotification after Installed
          assert.strictEqual(sentRequests.length, 6)
          assert.strictEqual(
            sentRequests[5].command,
            OCPP20RequestCommand.SECURITY_EVENT_NOTIFICATION
          )
          assert.strictEqual(sentRequests[5].payload.type, 'FirmwareUpdated')
        })
      })

      await it('should send InvalidSignature when SimulateSignatureVerificationFailure is true', async t => {
        const { sentRequests, station: trackingStation } = createMockStationWithRequestTracking()
        const service = new OCPP20IncomingRequestService()
        const { OCPP20VariableManager } =
          await import('../../../../src/charging-station/ocpp/2.0/OCPP20VariableManager.js')
        const { AttributeEnumType, OCPP20ComponentName } =
          await import('../../../../src/types/index.js')

        // Arrange: Set Device Model variable to simulate verification failure
        OCPP20VariableManager.getInstance().setVariables(trackingStation, [
          {
            attributeType: AttributeEnumType.Actual,
            attributeValue: 'true',
            component: { name: OCPP20ComponentName.FirmwareCtrlr as string },
            variable: { name: 'SimulateSignatureVerificationFailure' },
          },
        ])

        const request: OCPP20UpdateFirmwareRequest = {
          firmware: {
            location: 'https://firmware.example.com/update.bin',
            retrieveDateTime: new Date('2020-01-01T00:00:00.000Z'),
            signature: 'dGVzdA==',
          },
          requestId: 6,
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
          assert.strictEqual(
            sentRequests[0].payload.status,
            OCPP20FirmwareStatusEnumType.Downloading
          )

          t.mock.timers.tick(2000)
          await flushMicrotasks()
          assert.strictEqual(sentRequests.length, 2)
          assert.strictEqual(
            sentRequests[1].payload.status,
            OCPP20FirmwareStatusEnumType.Downloaded
          )

          t.mock.timers.tick(500)
          await flushMicrotasks()
          assert.strictEqual(sentRequests.length, 4)
          assert.strictEqual(
            sentRequests[2].payload.status,
            OCPP20FirmwareStatusEnumType.InvalidSignature
          )

          // Verify lifecycle stops after InvalidSignature: no Installing/Installed emitted
          const requestCountAfterInvalidSignature = sentRequests.length
          t.mock.timers.tick(10_000)
          await flushMicrotasks()
          assert.strictEqual(sentRequests.length, requestCountAfterInvalidSignature)

          const securityEventNotifications = sentRequests.filter(
            req => req.command === OCPP20RequestCommand.SECURITY_EVENT_NOTIFICATION
          )
          assert.strictEqual(securityEventNotifications.length, 1)
          assert.strictEqual(
            securityEventNotifications[0]?.payload?.type,
            'InvalidFirmwareSignature'
          )
        })
      })

      await it('should not send InvalidSignature when SimulateSignatureVerificationFailure is false', async t => {
        const { sentRequests, station: trackingStation } = createMockStationWithRequestTracking()
        const service = new OCPP20IncomingRequestService()
        const { OCPP20VariableManager } =
          await import('../../../../src/charging-station/ocpp/2.0/OCPP20VariableManager.js')
        const { AttributeEnumType, OCPP20ComponentName } =
          await import('../../../../src/types/index.js')

        // Arrange: Explicitly set variable to false (default behavior)
        OCPP20VariableManager.getInstance().setVariables(trackingStation, [
          {
            attributeType: AttributeEnumType.Actual,
            attributeValue: 'false',
            component: { name: OCPP20ComponentName.FirmwareCtrlr as string },
            variable: { name: 'SimulateSignatureVerificationFailure' },
          },
        ])

        const request: OCPP20UpdateFirmwareRequest = {
          firmware: {
            location: 'https://firmware.example.com/update.bin',
            retrieveDateTime: new Date('2020-01-01T00:00:00.000Z'),
            signature: 'dGVzdA==',
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

          t.mock.timers.tick(2000)
          await flushMicrotasks()
          assert.strictEqual(sentRequests.length, 2)
          assert.strictEqual(
            sentRequests[1].payload.status,
            OCPP20FirmwareStatusEnumType.Downloaded
          )

          t.mock.timers.tick(500)
          await flushMicrotasks()
          assert.strictEqual(sentRequests.length, 4)
          assert.strictEqual(
            sentRequests[2].payload.status,
            OCPP20FirmwareStatusEnumType.SignatureVerified
          )
          assert.strictEqual(
            sentRequests[3].payload.status,
            OCPP20FirmwareStatusEnumType.Installing
          )

          t.mock.timers.tick(1000)
          await flushMicrotasks()
          assert.strictEqual(sentRequests[4].payload.status, OCPP20FirmwareStatusEnumType.Installed)

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
})
