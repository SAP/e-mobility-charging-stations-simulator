/**
 * @file Tests for OCPP20IncomingRequestService GetLog
 * @description Unit tests for OCPP 2.0.1 GetLog command handling (K01) and
 *   LogStatusNotification lifecycle simulation per N01
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  LogEnumType,
  LogStatusEnumType,
  type OCPP20GetLogRequest,
  type OCPP20GetLogResponse,
  OCPP20IncomingRequestCommand,
  OCPPVersion,
  UploadLogStatusEnumType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import {
  flushMicrotasks,
  standardCleanup,
  withMockTimers,
} from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../helpers/StationHelpers.js'
import { createMockStationWithRequestTracking } from './OCPP20TestUtils.js'

await describe('K01 - GetLog', async () => {
  let station: ChargingStation
  let testableService: ReturnType<typeof createTestableIncomingRequestService>

  beforeEach(() => {
    const { station: mockStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 1,
      evseConfiguration: { evsesCount: 1 },
      stationInfo: {
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
    })
    station = mockStation
    testableService = createTestableIncomingRequestService(new OCPP20IncomingRequestService())
  })

  afterEach(() => {
    standardCleanup()
  })

  await describe('Handler validation', async () => {
    await it('should return Accepted with filename for DiagnosticsLog request', () => {
      const request: OCPP20GetLogRequest = {
        log: {
          remoteLocation: 'ftp://logs.example.com/uploads/',
        },
        logType: LogEnumType.DiagnosticsLog,
        requestId: 1,
      }

      const response = testableService.handleRequestGetLog(station, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(typeof response, 'object')
      assert.strictEqual(response.status, LogStatusEnumType.Accepted)
      assert.strictEqual(response.filename, 'simulator-log.txt')
    })

    await it('should return Accepted with filename for SecurityLog request', () => {
      const request: OCPP20GetLogRequest = {
        log: {
          remoteLocation: 'https://logs.example.com/security/',
        },
        logType: LogEnumType.SecurityLog,
        requestId: 2,
      }

      const response = testableService.handleRequestGetLog(station, request)

      assert.strictEqual(response.status, LogStatusEnumType.Accepted)
      assert.strictEqual(response.filename, 'simulator-log.txt')
    })
  })

  await describe('GET_LOG event listener', async () => {
    let service: OCPP20IncomingRequestService
    let simulateMock: ReturnType<typeof mock.fn>

    beforeEach(() => {
      service = new OCPP20IncomingRequestService()
      simulateMock = mock.method(
        service as unknown as {
          simulateLogUploadLifecycle: (
            chargingStation: ChargingStation,
            requestId: number
          ) => Promise<void>
        },
        'simulateLogUploadLifecycle',
        () => Promise.resolve()
      )
    })

    await it('should register GET_LOG event listener in constructor', () => {
      assert.strictEqual(service.listenerCount(OCPP20IncomingRequestCommand.GET_LOG), 1)
    })

    await it('should call simulateLogUploadLifecycle when GET_LOG event emitted with Accepted response', () => {
      const request: OCPP20GetLogRequest = {
        log: {
          remoteLocation: 'https://csms.example.com/logs',
        },
        logType: LogEnumType.DiagnosticsLog,
        requestId: 10,
      }
      const response: OCPP20GetLogResponse = {
        filename: 'simulator-log.txt',
        status: LogStatusEnumType.Accepted,
      }

      service.emit(OCPP20IncomingRequestCommand.GET_LOG, station, request, response)

      assert.strictEqual(simulateMock.mock.callCount(), 1)
      assert.strictEqual(simulateMock.mock.calls[0].arguments[1], 10)
    })

    await it('should NOT call simulateLogUploadLifecycle when GET_LOG event emitted with Rejected response', () => {
      const request: OCPP20GetLogRequest = {
        log: {
          remoteLocation: 'https://csms.example.com/logs',
        },
        logType: LogEnumType.DiagnosticsLog,
        requestId: 11,
      }
      const response: OCPP20GetLogResponse = {
        status: LogStatusEnumType.Rejected,
      }

      service.emit(OCPP20IncomingRequestCommand.GET_LOG, station, request, response)

      assert.strictEqual(simulateMock.mock.callCount(), 0)
    })

    await it('should handle simulateLogUploadLifecycle rejection gracefully', async () => {
      mock.method(
        service as unknown as {
          simulateLogUploadLifecycle: (
            chargingStation: ChargingStation,
            requestId: number
          ) => Promise<void>
        },
        'simulateLogUploadLifecycle',
        () => Promise.reject(new Error('log upload error'))
      )

      const request: OCPP20GetLogRequest = {
        log: {
          remoteLocation: 'https://csms.example.com/logs',
        },
        logType: LogEnumType.DiagnosticsLog,
        requestId: 99,
      }
      const response: OCPP20GetLogResponse = {
        filename: 'simulator-log.txt',
        status: LogStatusEnumType.Accepted,
      }

      service.emit(OCPP20IncomingRequestCommand.GET_LOG, station, request, response)

      await flushMicrotasks()
    })

    await describe('N01 - LogStatusNotification lifecycle', async () => {
      await it('should send Uploading notification with correct requestId', async t => {
        await withMockTimers(t, ['setTimeout'], async () => {
          // Arrange
          const { sentRequests, station: trackingStation } = createMockStationWithRequestTracking()
          const service = new OCPP20IncomingRequestService()
          const request: OCPP20GetLogRequest = {
            log: { remoteLocation: 'ftp://logs.example.com/' },
            logType: LogEnumType.DiagnosticsLog,
            requestId: 42,
          }
          const response: OCPP20GetLogResponse = {
            filename: 'simulator-log.txt',
            status: LogStatusEnumType.Accepted,
          }

          // Act
          service.emit(OCPP20IncomingRequestCommand.GET_LOG, trackingStation, request, response)
          await flushMicrotasks()

          // Assert
          assert.ok(sentRequests.length >= 1, 'Expected at least one notification')
          assert.deepStrictEqual(sentRequests[0].payload, {
            requestId: 42,
            status: UploadLogStatusEnumType.Uploading,
          })
        })
      })

      await it('should send Uploaded notification with correct requestId after delay', async t => {
        await withMockTimers(t, ['setTimeout'], async () => {
          // Arrange
          const { sentRequests, station: trackingStation } = createMockStationWithRequestTracking()
          const service = new OCPP20IncomingRequestService()
          const request: OCPP20GetLogRequest = {
            log: { remoteLocation: 'ftp://logs.example.com/' },
            logType: LogEnumType.DiagnosticsLog,
            requestId: 42,
          }
          const response: OCPP20GetLogResponse = {
            filename: 'simulator-log.txt',
            status: LogStatusEnumType.Accepted,
          }

          // Act
          service.emit(OCPP20IncomingRequestCommand.GET_LOG, trackingStation, request, response)
          await flushMicrotasks()

          // Only Uploading should be sent before the timer fires
          assert.strictEqual(sentRequests.length, 1)

          // Advance past the simulated upload delay
          t.mock.timers.tick(1000)
          await flushMicrotasks()

          // Assert
          assert.strictEqual(sentRequests.length, 2)
          assert.deepStrictEqual(sentRequests[1].payload, {
            requestId: 42,
            status: UploadLogStatusEnumType.Uploaded,
          })
        })
      })

      await it('should send Uploading before Uploaded in correct sequence', async t => {
        await withMockTimers(t, ['setTimeout'], async () => {
          // Arrange
          const { sentRequests, station: trackingStation } = createMockStationWithRequestTracking()
          const service = new OCPP20IncomingRequestService()
          const request: OCPP20GetLogRequest = {
            log: { remoteLocation: 'ftp://logs.example.com/' },
            logType: LogEnumType.DiagnosticsLog,
            requestId: 7,
          }
          const response: OCPP20GetLogResponse = {
            filename: 'simulator-log.txt',
            status: LogStatusEnumType.Accepted,
          }

          // Act - complete the full lifecycle
          service.emit(OCPP20IncomingRequestCommand.GET_LOG, trackingStation, request, response)
          await flushMicrotasks()
          t.mock.timers.tick(1000)
          await flushMicrotasks()

          // Assert - verify sequence and requestId propagation
          assert.strictEqual(sentRequests.length, 2)
          assert.strictEqual(
            sentRequests[0].payload.status,
            UploadLogStatusEnumType.Uploading,
            'First notification should be Uploading'
          )
          assert.strictEqual(
            sentRequests[1].payload.status,
            UploadLogStatusEnumType.Uploaded,
            'Second notification should be Uploaded'
          )
          assert.strictEqual(sentRequests[0].payload.requestId, 7)
          assert.strictEqual(sentRequests[1].payload.requestId, 7)
        })
      })
    })
  })
})
