/**
 * @file Tests for OCPP20IncomingRequestService post-stop() resurrection guard
 * @description Covers the OCPP 2.0.1 side of the shared post-stop
 *   resurrection guard: `sendSecurityEventNotification`,
 *   `sendQueuedSecurityEvents`, `sendNotifyReportRequest`,
 *   `getCertSigningRetryManager`, `simulateFirmwareUpdateLifecycle`,
 *   and `simulateLogUploadLifecycle` all silent-drop (or return
 *   undefined) when the WeakMap entry is absent or sealed
 *   `stopped: true`. Also exercises the `sendQueuedSecurityEvents`
 *   retry `setTimeout` handle discipline: store on state, self-clear
 *   on fire, cancel on re-schedule, cancel in `resetStationState`.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import { GenericStatus, OCPPVersion, ReportBaseEnumType } from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import {
  flushMicrotasks,
  standardCleanup,
  withMockTimers,
} from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../helpers/StationHelpers.js'

interface OCPP20StationStateShape {
  activeFirmwareUpdateAbortController?: AbortController
  activeFirmwareUpdateRequestId?: number
  activeLogUploadAbortController?: AbortController
  activeLogUploadRequestId?: number
  certSigningRetryManager?: unknown
  isDrainingSecurityEvents: boolean
  reportDataCache: Map<number, unknown[]>
  securityEventQueue: QueuedSecurityEventShape[]
  securityEventRetryTimer?: NodeJS.Timeout
  stopped?: boolean
}

interface PlumbingAccess {
  createStationState: () => OCPP20StationStateShape
  getOrCreateStationState: (chargingStation: ChargingStation) => OCPP20StationStateShape
  sendNotifyReportRequest: (
    chargingStation: ChargingStation,
    request: { reportBase: string; requestId: number },
    response: { status: string }
  ) => Promise<void>
  sendQueuedSecurityEvents: (chargingStation: ChargingStation) => void
  sendSecurityEventNotification: (
    chargingStation: ChargingStation,
    type: string,
    techInfo?: string
  ) => void
  simulateFirmwareUpdateLifecycle: (
    chargingStation: ChargingStation,
    requestId: number,
    firmware: unknown,
    retries?: number,
    retryInterval?: number
  ) => Promise<void>
  simulateLogUploadLifecycle: (chargingStation: ChargingStation, requestId: number) => Promise<void>
  stationsState: WeakMap<ChargingStation, OCPP20StationStateShape>
}

interface QueuedSecurityEventShape {
  retryCount?: number
  techInfo?: string
  timestamp: Date
  type: string
}

const asPlumbing = (service: OCPP20IncomingRequestService): PlumbingAccess =>
  service as unknown as PlumbingAccess

const createStation = (baseNameSuffix: string): ChargingStation => {
  const { station } = createMockChargingStation({
    baseName: `${TEST_CHARGING_STATION_BASE_NAME}-${baseNameSuffix}`,
    connectorsCount: 1,
    evseConfiguration: { evsesCount: 1 },
    stationInfo: {
      ocppStrictCompliance: false,
      ocppVersion: OCPPVersion.VERSION_201,
    },
    websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
  })
  const openStation = station as ChargingStation & { isWebSocketConnectionOpened: () => boolean }
  openStation.isWebSocketConnectionOpened = () => true
  return station
}

const setRequestHandler = (
  station: ChargingStation,
  handler: (...args: unknown[]) => Promise<unknown>
): void => {
  ;(
    station.ocppRequestService as unknown as {
      requestHandler: (...args: unknown[]) => Promise<unknown>
    }
  ).requestHandler = handler
}

await describe('OCPP20IncomingRequestService — post-stop resurrection guard', async () => {
  let service: OCPP20IncomingRequestService
  let plumbing: PlumbingAccess

  beforeEach(() => {
    service = new OCPP20IncomingRequestService()
    plumbing = asPlumbing(service)
  })

  afterEach(() => {
    standardCleanup()
  })

  await describe('sendSecurityEventNotification', async () => {
    await it('should create state and enqueue on a fresh station (lifecycle-entry preserved)', () => {
      const station = createStation('sec-fresh')
      const requestHandlerMock = mock.fn(async () => Promise.resolve({}))
      setRequestHandler(station, requestHandlerMock)

      plumbing.sendSecurityEventNotification(station, 'FirmwareUpdated', 'info')

      const state = plumbing.stationsState.get(station)
      assert.notStrictEqual(state, undefined)
      assert.strictEqual(state?.stopped, undefined)
    })

    await it('should silent-drop after stop() without resurrecting the entry', () => {
      const station = createStation('sec-post-stop')
      const state = plumbing.getOrCreateStationState(station)
      const queueRef = state.securityEventQueue

      service.stop(station)
      assert.strictEqual(state.stopped, true)

      plumbing.sendSecurityEventNotification(station, 'FirmwareUpdated', 'info')

      assert.strictEqual(plumbing.stationsState.get(station), state)
      assert.strictEqual(state.stopped, true)
      assert.strictEqual(queueRef.length, 0)
    })

    await it('should push to the queue on the pre-stop happy path (regression guard)', () => {
      const station = createStation('sec-pre-stop')
      // Close the WebSocket so `sendQueuedSecurityEvents` bails before
      // draining and the queued event stays observable.
      const closedStation = station as ChargingStation & {
        isWebSocketConnectionOpened: () => boolean
      }
      closedStation.isWebSocketConnectionOpened = () => false
      const state = plumbing.getOrCreateStationState(station)
      const queueLengthBefore = state.securityEventQueue.length

      plumbing.sendSecurityEventNotification(station, 'FirmwareUpdated', 'tech-info')

      assert.strictEqual(state.stopped, undefined)
      assert.strictEqual(state.securityEventQueue.length, queueLengthBefore + 1)
      assert.strictEqual(state.securityEventQueue[0].type, 'FirmwareUpdated')
      assert.strictEqual(state.securityEventQueue[0].techInfo, 'tech-info')
    })
  })

  await describe('sendNotifyReportRequest', async () => {
    await it('should silent-drop when no state entry exists', async () => {
      const station = createStation('nr-no-entry')
      const requestHandlerMock = mock.fn(async () => Promise.resolve({}))
      setRequestHandler(station, requestHandlerMock)

      await plumbing.sendNotifyReportRequest(
        station,
        { reportBase: ReportBaseEnumType.FullInventory, requestId: 1 },
        { status: GenericStatus.Accepted }
      )

      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
      assert.strictEqual(plumbing.stationsState.has(station), false)
    })

    await it('should silent-drop after stop() without resurrecting the entry', async () => {
      const station = createStation('nr-post-stop')
      const state = plumbing.getOrCreateStationState(station)
      const requestHandlerMock = mock.fn(async () => Promise.resolve({}))
      setRequestHandler(station, requestHandlerMock)

      service.stop(station)
      assert.strictEqual(state.stopped, true)

      await plumbing.sendNotifyReportRequest(
        station,
        { reportBase: ReportBaseEnumType.FullInventory, requestId: 42 },
        { status: GenericStatus.Accepted }
      )

      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
      assert.strictEqual(plumbing.stationsState.get(station), state)
    })
  })

  await describe('sendQueuedSecurityEvents retry timer discipline', async () => {
    await it('should store the retry handle on stationState after a failed send', async t => {
      await withMockTimers(t, ['setTimeout'], async () => {
        const station = createStation('retry-store')
        const requestHandlerMock = mock.fn(async () =>
          Promise.reject(new Error('websocket rejected'))
        )
        setRequestHandler(station, requestHandlerMock)

        plumbing.sendSecurityEventNotification(station, 'TamperDetected', 'sim')
        await flushMicrotasks()
        await flushMicrotasks()

        const state = plumbing.stationsState.get(station)
        assert.notStrictEqual(state, undefined)
        assert.notStrictEqual(state?.securityEventRetryTimer, undefined)
      })
    })

    await it('should cancel the retry timer on stop() and prevent late fire', async t => {
      await withMockTimers(t, ['setTimeout'], async () => {
        const station = createStation('retry-cancel-on-stop')
        const requestHandlerMock = mock.fn(async () =>
          Promise.reject(new Error('websocket rejected'))
        )
        setRequestHandler(station, requestHandlerMock)

        plumbing.sendSecurityEventNotification(station, 'TamperDetected', 'sim')
        await flushMicrotasks()
        await flushMicrotasks()

        const state = plumbing.stationsState.get(station)
        assert.notStrictEqual(state?.securityEventRetryTimer, undefined)

        service.stop(station)

        assert.strictEqual(state?.securityEventRetryTimer, undefined)
        assert.strictEqual(state?.stopped, true)

        const callCountBeforeTick = requestHandlerMock.mock.callCount()
        t.mock.timers.tick(60_000)
        await flushMicrotasks()
        await flushMicrotasks()

        assert.strictEqual(requestHandlerMock.mock.callCount(), callCountBeforeTick)
      })
    })

    await it('should self-clear the retry handle when the retry callback fires', async t => {
      await withMockTimers(t, ['setTimeout'], async () => {
        const station = createStation('retry-self-clear')
        let rejectCount = 0
        const requestHandlerMock = mock.fn(async () => {
          rejectCount += 1
          if (rejectCount === 1) {
            return Promise.reject(new Error('first attempt fails'))
          }
          return Promise.resolve({})
        })
        setRequestHandler(station, requestHandlerMock)

        plumbing.sendSecurityEventNotification(station, 'TamperDetected', 'sim')
        await flushMicrotasks()
        await flushMicrotasks()

        const state = plumbing.stationsState.get(station)
        assert.notStrictEqual(state?.securityEventRetryTimer, undefined)

        t.mock.timers.tick(60_000)
        await flushMicrotasks()
        await flushMicrotasks()

        assert.strictEqual(state?.securityEventRetryTimer, undefined)
      })
    })

    await it('should cancel the previous retry timer when a new retry is scheduled', async t => {
      await withMockTimers(t, ['setTimeout'], async () => {
        const station = createStation('retry-reschedule')
        const requestHandlerMock = mock.fn(async () => Promise.reject(new Error('always fails')))
        setRequestHandler(station, requestHandlerMock)

        plumbing.sendSecurityEventNotification(station, 'TamperDetected', 'first')
        await flushMicrotasks()
        await flushMicrotasks()

        const state = plumbing.stationsState.get(station)
        const firstHandle = state?.securityEventRetryTimer
        assert.notStrictEqual(firstHandle, undefined)

        t.mock.timers.tick(60_000)
        await flushMicrotasks()
        await flushMicrotasks()

        const secondHandle = state?.securityEventRetryTimer
        assert.notStrictEqual(secondHandle, undefined)
        assert.notStrictEqual(secondHandle, firstHandle)
      })
    })

    await it('should silent-drop the recursive retry call after stop() even if the handle survives race', () => {
      const station = createStation('retry-recursive-drop')
      const state = plumbing.getOrCreateStationState(station)
      const requestHandlerMock = mock.fn(async () => Promise.resolve({}))
      setRequestHandler(station, requestHandlerMock)
      state.securityEventQueue.push({
        retryCount: 1,
        timestamp: new Date(),
        type: 'TamperDetected',
      })

      service.stop(station)

      plumbing.sendQueuedSecurityEvents(station)

      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
      assert.strictEqual(state.stopped, true)
    })
  })

  await describe('getCertSigningRetryManager', async () => {
    await it('should return undefined after stop() to prevent leaked retry timer', () => {
      const station = createStation('cert-post-stop')
      plumbing.getOrCreateStationState(station)

      service.stop(station)

      const manager = service.getCertSigningRetryManager(station)
      assert.strictEqual(manager, undefined)
    })

    await it('should lazily create the retry manager on the pre-stop happy path', () => {
      const station = createStation('cert-pre-stop')

      const first = service.getCertSigningRetryManager(station)
      const second = service.getCertSigningRetryManager(station)

      assert.notStrictEqual(first, undefined)
      assert.strictEqual(first, second)
    })
  })

  await describe('simulateFirmwareUpdateLifecycle', async () => {
    await it('should silent-drop after stop() without setting activeFirmwareUpdateAbortController', async () => {
      const station = createStation('firmware-post-stop')
      const state = plumbing.getOrCreateStationState(station)
      const requestHandlerMock = mock.fn(async () => Promise.resolve({}))
      setRequestHandler(station, requestHandlerMock)

      service.stop(station)

      await plumbing.simulateFirmwareUpdateLifecycle(station, 42, {
        location: 'ftp://localhost/f.bin',
        retrieveDateTime: new Date(),
      })

      assert.strictEqual(state.activeFirmwareUpdateAbortController, undefined)
      assert.strictEqual(state.activeFirmwareUpdateRequestId, undefined)
      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
    })
  })

  await describe('simulateLogUploadLifecycle', async () => {
    await it('should silent-drop after stop() without setting activeLogUploadAbortController', async () => {
      const station = createStation('log-post-stop')
      const state = plumbing.getOrCreateStationState(station)
      const requestHandlerMock = mock.fn(async () => Promise.resolve({}))
      setRequestHandler(station, requestHandlerMock)

      service.stop(station)

      await plumbing.simulateLogUploadLifecycle(station, 42)

      assert.strictEqual(state.activeLogUploadAbortController, undefined)
      assert.strictEqual(state.activeLogUploadRequestId, undefined)
      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
    })
  })

  await describe('resetStationState abort-on-stop', async () => {
    await it('should abort in-flight firmware and log upload controllers on stop()', () => {
      const station = createStation('reset-abort')
      const state = plumbing.getOrCreateStationState(station)
      const firmwareController = new AbortController()
      const logController = new AbortController()
      state.activeFirmwareUpdateAbortController = firmwareController
      state.activeLogUploadAbortController = logController

      service.stop(station)

      assert.strictEqual(firmwareController.signal.aborted, true)
      assert.strictEqual(logController.signal.aborted, true)
      assert.strictEqual(state.activeFirmwareUpdateAbortController, undefined)
      assert.strictEqual(state.activeLogUploadAbortController, undefined)
      assert.strictEqual(state.stopped, true)
    })
  })
})
