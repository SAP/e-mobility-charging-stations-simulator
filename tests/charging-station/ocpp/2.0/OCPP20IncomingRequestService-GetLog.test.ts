/**
 * @file Tests for OCPP20IncomingRequestService GetLog
 * @description Unit tests for OCPP 2.0.1 GetLog command handling (N01) and
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
  OCPP20RequestCommand,
  OCPPVersion,
  UploadLogStatusEnumType,
} from '../../../../src/types/index.js'
import { Constants, logger } from '../../../../src/utils/index.js'
import {
  flushMicrotasks,
  standardCleanup,
  withMockTimers,
} from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../helpers/StationHelpers.js'
import { createMockStationWithRequestTracking } from './OCPP20TestUtils.js'

interface LogUploadPlumbing {
  clearActiveLogUpload: (chargingStation: ChargingStation, requestId: number) => void
  getOrCreateStationState: (chargingStation: ChargingStation) => LogUploadStateShape
  simulateLogUploadLifecycle: (chargingStation: ChargingStation, requestId: number) => Promise<void>
  stationsState: WeakMap<ChargingStation, LogUploadStateShape>
}

interface LogUploadStateShape {
  activeLogUploadAbortController?: AbortController
  activeLogUploadRequestId?: number
  activeLogUploadStatus?: UploadLogStatusEnumType
  stopped?: boolean
}

const asPlumbing = (service: OCPP20IncomingRequestService): LogUploadPlumbing =>
  service as unknown as LogUploadPlumbing

await describe('N01 - GetLog', async () => {
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
        async () => Promise.resolve()
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

    await it('should call simulateLogUploadLifecycle when GET_LOG event emitted with AcceptedCanceled response', () => {
      const request: OCPP20GetLogRequest = {
        log: {
          remoteLocation: 'https://csms.example.com/logs',
        },
        logType: LogEnumType.DiagnosticsLog,
        requestId: 12,
      }
      const response: OCPP20GetLogResponse = {
        filename: 'simulator-log.txt',
        status: LogStatusEnumType.AcceptedCanceled,
      }

      service.emit(OCPP20IncomingRequestCommand.GET_LOG, station, request, response)

      assert.strictEqual(simulateMock.mock.callCount(), 1)
      assert.strictEqual(simulateMock.mock.calls[0].arguments[1], 12)
    })

    await it('should handle simulateLogUploadLifecycle rejection gracefully', async t => {
      const errorMock = t.mock.method(logger, 'error')
      simulateMock.mock.mockImplementation(async () =>
        Promise.reject(new Error('log upload error'))
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
      assert.strictEqual(errorMock.mock.callCount(), 1)
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
          assert.strictEqual(
            sentRequests.length,
            1,
            'Expected exactly one notification before the timer fires'
          )
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

  await describe('N01 - GetLog supersession (N01.FR.12/FR.20)', async () => {
    await it('should return AcceptedCanceled, abort the prior upload, and notify with the previous requestId', () => {
      // Arrange: seed an in-flight prior log upload (requestId 1)
      const { sentRequests, station: trackingStation } = createMockStationWithRequestTracking()
      const service = new OCPP20IncomingRequestService()
      const testable = createTestableIncomingRequestService(service)
      const state = asPlumbing(service).getOrCreateStationState(trackingStation)
      const priorAbortController = new AbortController()
      state.activeLogUploadAbortController = priorAbortController
      state.activeLogUploadRequestId = 1

      // Act: a new GetLog supersedes the in-flight upload
      const request: OCPP20GetLogRequest = {
        log: { remoteLocation: 'ftp://logs.example.com/' },
        logType: LogEnumType.DiagnosticsLog,
        requestId: 2,
      }
      const response = testable.handleRequestGetLog(trackingStation, request)

      // Assert: superseded response, prior controller aborted, state reset
      assert.deepStrictEqual(response, {
        filename: 'simulator-log.txt',
        status: LogStatusEnumType.AcceptedCanceled,
      })
      assert.strictEqual(priorAbortController.signal.aborted, true)
      assert.strictEqual(state.activeLogUploadRequestId, undefined)
      assert.strictEqual(state.activeLogUploadAbortController, undefined)
      // Terminal LogStatusNotification(AcceptedCanceled) carries the PREVIOUS requestId (1), not the new one (2)
      assert.strictEqual(sentRequests.length, 1)
      assert.strictEqual(sentRequests[0].command, OCPP20RequestCommand.LOG_STATUS_NOTIFICATION)
      assert.deepStrictEqual(sentRequests[0].payload, {
        requestId: 1,
        status: UploadLogStatusEnumType.AcceptedCanceled,
      })
    })

    await it('should swallow a failed AcceptedCanceled notification and still return AcceptedCanceled', async t => {
      // Arrange: force the terminal LogStatusNotification send to reject
      const { station: trackingStation } = createMockStationWithRequestTracking()
      const service = new OCPP20IncomingRequestService()
      const testable = createTestableIncomingRequestService(service)
      const errorMock = t.mock.method(logger, 'error')
      ;(
        trackingStation.ocppRequestService as unknown as {
          requestHandler: (...args: unknown[]) => Promise<unknown>
        }
      ).requestHandler = async () => Promise.reject(new Error('notification send failed'))
      const state = asPlumbing(service).getOrCreateStationState(trackingStation)
      state.activeLogUploadAbortController = new AbortController()
      state.activeLogUploadRequestId = 1

      // Act
      const request: OCPP20GetLogRequest = {
        log: { remoteLocation: 'ftp://logs.example.com/' },
        logType: LogEnumType.DiagnosticsLog,
        requestId: 2,
      }
      const response = testable.handleRequestGetLog(trackingStation, request)

      // Assert: handler still returns AcceptedCanceled synchronously; the rejection is not thrown
      assert.strictEqual(response.status, LogStatusEnumType.AcceptedCanceled)
      // The rejection is swallowed by the .catch and logged at error
      await flushMicrotasks()
      assert.strictEqual(errorMock.mock.callCount(), 1)
    })
  })

  await describe('N01 - log upload lifecycle abort boundary', async () => {
    await it('should exit at the interruptibleSleep boundary and not emit Uploaded when aborted mid-flight', async t => {
      await withMockTimers(t, ['setTimeout'], async () => {
        // Arrange
        const { sentRequests, station: trackingStation } = createMockStationWithRequestTracking()
        const service = new OCPP20IncomingRequestService()
        const plumbing = asPlumbing(service)

        // Act: drive the lifecycle; it emits Uploading then parks at interruptibleSleep
        const lifecycle = plumbing.simulateLogUploadLifecycle(trackingStation, 77)
        await flushMicrotasks()
        assert.strictEqual(sentRequests.length, 1)
        assert.strictEqual(sentRequests[0].payload.status, UploadLogStatusEnumType.Uploading)

        // Abort mid-flight at the sleep boundary. The requestId stays claimed so
        // the abort signal — not the requestId guard — is what suppresses Uploaded.
        const state = plumbing.stationsState.get(trackingStation)
        state?.activeLogUploadAbortController?.abort()

        // Advance past the step delay (LOG_UPLOAD_STEP_DELAY_MS) and settle the lifecycle
        t.mock.timers.tick(1000)
        await flushMicrotasks()
        await lifecycle

        // Uploaded must NOT be emitted — the lifecycle exited at the boundary
        assert.strictEqual(sentRequests.length, 1)
        assert.strictEqual(
          sentRequests.some(request => request.payload.status === UploadLogStatusEnumType.Uploaded),
          false
        )
        // The finally block ran: clearActiveLogUpload reset the claimed requestId
        assert.strictEqual(state?.activeLogUploadRequestId, undefined)
      })
    })
  })

  await describe('clearActiveLogUpload', async () => {
    await it('should log at debug and preserve state for a superseded (non-matching) requestId', t => {
      // Arrange
      const service = new OCPP20IncomingRequestService()
      const plumbing = asPlumbing(service)
      const debugMock = t.mock.method(logger, 'debug')
      const state = plumbing.getOrCreateStationState(station)
      state.activeLogUploadRequestId = 200

      // Act: a stale/superseded completion for requestId 199
      plumbing.clearActiveLogUpload(station, 199)

      // Assert: else-branch fired the debug log and left state untouched
      assert.strictEqual(debugMock.mock.callCount(), 1)
      assert.strictEqual(state.activeLogUploadRequestId, 200)
    })

    await it('should reset state and not log for a matching requestId', t => {
      // Arrange
      const service = new OCPP20IncomingRequestService()
      const plumbing = asPlumbing(service)
      const debugMock = t.mock.method(logger, 'debug')
      const state = plumbing.getOrCreateStationState(station)
      state.activeLogUploadAbortController = new AbortController()
      state.activeLogUploadRequestId = 200
      state.activeLogUploadStatus = UploadLogStatusEnumType.Uploading

      // Act: the active upload completes cleanly
      plumbing.clearActiveLogUpload(station, 200)

      // Assert: state cleared, no "Ignoring" debug log
      assert.strictEqual(state.activeLogUploadRequestId, undefined)
      assert.strictEqual(state.activeLogUploadAbortController, undefined)
      assert.strictEqual(state.activeLogUploadStatus, undefined)
      assert.strictEqual(debugMock.mock.callCount(), 0)
    })
  })
})
