/**
 * @file Tests for OCPP16IncomingRequestService firmware handlers
 * @description Unit tests for OCPP 1.6 GetDiagnostics (§6.1) guard and
 *   early-exit paths (feature-profile guard, non-FTP protocol, missing
 *   log file, finally cleanup on early exit), and UpdateFirmware (§6.4)
 *   incoming request handlers. Supersession semantics for GetDiagnostics
 *   are covered in
 *   {@link file://./OCPP16IncomingRequestService-GetDiagnostics.test.ts}.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type { GetDiagnosticsRequest } from '../../../../src/types/index.js'

import { OCPP16IncomingRequestService } from '../../../../src/charging-station/ocpp/1.6/OCPP16IncomingRequestService.js'
import {
  ConfigurationSection,
  OCPP16FirmwareStatus,
  OCPP16IncomingRequestCommand,
  OCPP16StandardParametersKey,
  type OCPP16UpdateFirmwareRequest,
  type OCPP16UpdateFirmwareResponse,
} from '../../../../src/types/index.js'
import { Configuration, Constants, logger } from '../../../../src/utils/index.js'
import {
  flushMicrotasks,
  standardCleanup,
  withMockTimers,
} from '../../../helpers/TestLifecycleHelpers.js'
import {
  createOCPP16IncomingRequestTestContext,
  createOCPP16ListenerStation,
  type OCPP16IncomingRequestTestContext,
  upsertConfigurationKey,
} from './OCPP16TestUtils.js'

await describe('OCPP16IncomingRequestService — Firmware', async () => {
  let context: OCPP16IncomingRequestTestContext

  beforeEach(() => {
    context = createOCPP16IncomingRequestTestContext()
  })

  afterEach(() => {
    standardCleanup()
  })

  // §6.1: GetDiagnostics
  await describe('handleRequestGetDiagnostics', async () => {
    // @spec §6.1 — TC_048_CS
    await it('should return empty response for non-FTP location', async () => {
      // Arrange
      const { station, testableService } = context
      upsertConfigurationKey(
        station,
        OCPP16StandardParametersKey.SupportedFeatureProfiles,
        'Core,FirmwareManagement'
      )
      station.ocppRequestService.requestHandler = (() =>
        Promise.resolve({})) as typeof station.ocppRequestService.requestHandler

      const request: GetDiagnosticsRequest = {
        location: 'http://example.com/diagnostics',
      }

      // Act
      const response = await testableService.handleRequestGetDiagnostics(station, request)

      // Assert
      assert.notStrictEqual(response, undefined)
      assert.strictEqual(Object.keys(response).length, 0)
    })

    // @spec §6.1 — TC_047_CS
    await it('should return empty response when FirmwareManagement feature profile is not enabled', async () => {
      // Arrange
      const { station, testableService } = context
      upsertConfigurationKey(station, OCPP16StandardParametersKey.SupportedFeatureProfiles, 'Core')

      const request: GetDiagnosticsRequest = {
        location: 'ftp://localhost/diagnostics',
      }

      // Act
      const response = await testableService.handleRequestGetDiagnostics(station, request)

      // Assert
      assert.notStrictEqual(response, undefined)
      assert.strictEqual(Object.keys(response).length, 0)
    })

    await it('should return empty response when SupportedFeatureProfiles key is missing', async () => {
      // Arrange
      const { station, testableService } = context

      const request: GetDiagnosticsRequest = {
        location: 'ftp://localhost/diagnostics',
      }

      // Act
      const response = await testableService.handleRequestGetDiagnostics(station, request)

      // Assert
      assert.notStrictEqual(response, undefined)
      assert.strictEqual(Object.keys(response).length, 0)
    })

    await it('should clear diagnosticsUploadInProgress in the finally block when the FTP branch returns early on missing log file', async t => {
      // Arrange: enable FirmwareManagement so the FTP branch is entered,
      // then force the early return path inside the try block by returning
      // a log configuration with no file. This exercises the finally clause
      // through a non-throwing exit path.
      const { incomingRequestService, station, testableService } = context
      upsertConfigurationKey(
        station,
        OCPP16StandardParametersKey.SupportedFeatureProfiles,
        'Core,FirmwareManagement'
      )
      t.mock.method(Configuration, 'getConfigurationSection', (section: ConfigurationSection) => {
        if (section === ConfigurationSection.log) {
          return { file: undefined }
        }
        return {}
      })

      const request: GetDiagnosticsRequest = {
        location: 'ftp://localhost/diagnostics',
      }

      // Act
      const response = await testableService.handleRequestGetDiagnostics(station, request)

      // Assert
      assert.strictEqual(Object.keys(response).length, 0)
      const plumbing = incomingRequestService as unknown as {
        stationsState: WeakMap<ChargingStation, { diagnosticsUploadInProgress?: boolean }>
      }
      assert.strictEqual(
        plumbing.stationsState.get(station)?.diagnosticsUploadInProgress,
        undefined
      )
    })
  })

  // §6.4: UpdateFirmware
  await describe('handleRequestUpdateFirmware', async () => {
    // @spec §6.4 — TC_044_CS
    await it('should return empty response for valid location with immediate retrieve date', () => {
      // Arrange
      const { station, testableService } = context
      upsertConfigurationKey(
        station,
        OCPP16StandardParametersKey.SupportedFeatureProfiles,
        'Core,FirmwareManagement'
      )

      // Act
      const response = testableService.handleRequestUpdateFirmware(station, {
        location: 'ftp://localhost/firmware.bin',
        retrieveDate: new Date(),
      })

      // Assert
      assert.notStrictEqual(response, undefined)
      assert.strictEqual(Object.keys(response).length, 0)
    })

    await it('should return empty response when FirmwareManagement feature profile is not enabled', () => {
      // Arrange
      const { station, testableService } = context
      upsertConfigurationKey(station, OCPP16StandardParametersKey.SupportedFeatureProfiles, 'Core')

      // Act
      const response = testableService.handleRequestUpdateFirmware(station, {
        location: 'ftp://localhost/firmware.bin',
        retrieveDate: new Date(),
      })

      // Assert
      assert.notStrictEqual(response, undefined)
      assert.strictEqual(Object.keys(response).length, 0)
    })

    await it('should return empty response and log the "already in progress" warning when firmwareUpdateInProgress is set', t => {
      // Arrange
      const { incomingRequestService, station, testableService } = context
      upsertConfigurationKey(
        station,
        OCPP16StandardParametersKey.SupportedFeatureProfiles,
        'Core,FirmwareManagement'
      )
      const plumbing = incomingRequestService as unknown as {
        getOrCreateStationState: (cs: ChargingStation) => { firmwareUpdateInProgress?: boolean }
      }
      plumbing.getOrCreateStationState(station).firmwareUpdateInProgress = true
      const warnSpy = t.mock.method(logger, 'warn')

      // Act
      const response = testableService.handleRequestUpdateFirmware(station, {
        location: 'ftp://localhost/firmware.bin',
        retrieveDate: new Date(),
      })

      // Assert
      assert.strictEqual(Object.keys(response).length, 0)
      const warnMessages = warnSpy.mock.calls.map(call => call.arguments[0] as unknown as string)
      assert.ok(
        warnMessages.some(m => m.includes('firmware update is already in progress')),
        `expected an "already in progress" warning, got: ${JSON.stringify(warnMessages)}`
      )
    })

    await it('should NOT log the "already in progress" warning when stationInfo.firmwareStatus is stale but firmwareUpdateInProgress is unset', t => {
      // Regression guard: a stale stationInfo.firmwareStatus left at
      // Downloading / Downloaded / Installing by a prior exception unwind
      // must not suppress a legitimate new UpdateFirmware.req. The
      // authoritative predicate is firmwareUpdateInProgress on the
      // per-station state, not stationInfo.

      // Arrange
      const { station, testableService } = context
      upsertConfigurationKey(
        station,
        OCPP16StandardParametersKey.SupportedFeatureProfiles,
        'Core,FirmwareManagement'
      )
      if (station.stationInfo != null) {
        station.stationInfo.firmwareStatus = OCPP16FirmwareStatus.Downloading
      }
      const warnSpy = t.mock.method(logger, 'warn')

      // Act
      const response = testableService.handleRequestUpdateFirmware(station, {
        location: 'ftp://localhost/firmware.bin',
        retrieveDate: new Date(),
      })

      // Assert
      assert.strictEqual(Object.keys(response).length, 0)
      const warnMessages = warnSpy.mock.calls.map(call => call.arguments[0] as unknown as string)
      assert.ok(
        warnMessages.every(m => !m.includes('firmware update is already in progress')),
        `expected no "already in progress" warning, got: ${JSON.stringify(warnMessages)}`
      )
    })
  })

  // §6.4: UpdateFirmware event listener
  await describe('UPDATE_FIRMWARE event listener', async () => {
    let listenerService: OCPP16IncomingRequestService
    let updateFirmwareMock: ReturnType<typeof mock.fn>

    beforeEach(() => {
      listenerService = new OCPP16IncomingRequestService()
      updateFirmwareMock = mock.method(
        listenerService as unknown as {
          updateFirmwareSimulation: (chargingStation: unknown) => Promise<void>
        },
        'updateFirmwareSimulation',
        mock.fn(async () => Promise.resolve())
      )
    })

    afterEach(() => {
      standardCleanup()
    })

    await it('should register UPDATE_FIRMWARE event listener in constructor', () => {
      assert.strictEqual(
        listenerService.listenerCount(OCPP16IncomingRequestCommand.UPDATE_FIRMWARE),
        1
      )
    })

    await it('should call updateFirmwareSimulation when retrieveDate is in the past', async () => {
      // Arrange
      const { station } = createOCPP16ListenerStation('listener-station-past')

      const request: OCPP16UpdateFirmwareRequest = {
        location: 'ftp://localhost/firmware.bin',
        retrieveDate: new Date(Date.now() - 10000),
      }
      const response: OCPP16UpdateFirmwareResponse = {}

      // Act
      listenerService.emit(OCPP16IncomingRequestCommand.UPDATE_FIRMWARE, station, request, response)
      await flushMicrotasks()

      // Assert
      assert.strictEqual(updateFirmwareMock.mock.callCount(), 1)
    })

    await it('should schedule deferred updateFirmwareSimulation when retrieveDate is in the future', async t => {
      // Arrange
      const { station } = createOCPP16ListenerStation('listener-station-future')

      const futureMs = 5000
      const request: OCPP16UpdateFirmwareRequest = {
        location: 'ftp://localhost/firmware.bin',
        retrieveDate: new Date(Date.now() + futureMs),
      }
      const response: OCPP16UpdateFirmwareResponse = {}

      // Act & Assert
      await withMockTimers(t, ['setTimeout'], async () => {
        listenerService.emit(
          OCPP16IncomingRequestCommand.UPDATE_FIRMWARE,
          station,
          request,
          response
        )

        // Before tick: simulation not yet called
        assert.strictEqual(updateFirmwareMock.mock.callCount(), 0)

        // Advance timers past the retrieve date delay
        t.mock.timers.tick(futureMs + 1)
        await flushMicrotasks()

        // After tick: simulation should have been called
        assert.strictEqual(updateFirmwareMock.mock.callCount(), 1)
      })
    })

    await it('should handle updateFirmwareSimulation failure gracefully', async () => {
      // Arrange
      const { station } = createOCPP16ListenerStation('listener-station-error')
      mock.method(
        listenerService as unknown as {
          updateFirmwareSimulation: (chargingStation: unknown) => Promise<void>
        },
        'updateFirmwareSimulation',
        mock.fn(async () => Promise.reject(new Error('firmware simulation error')))
      )

      const request: OCPP16UpdateFirmwareRequest = {
        location: 'ftp://localhost/firmware.bin',
        retrieveDate: new Date(Date.now() - 1000),
      }
      const response: OCPP16UpdateFirmwareResponse = {}

      // Act: emit should not throw even if simulation rejects
      listenerService.emit(OCPP16IncomingRequestCommand.UPDATE_FIRMWARE, station, request, response)

      // Allow the rejected promise to be handled by the error handler in the listener
      await flushMicrotasks()
      await flushMicrotasks()

      // Assert: test passes if no unhandled rejection was thrown
    })
  })

  // Deferred UpdateFirmware timer lifecycle on OCPP16StationState
  await describe('UPDATE_FIRMWARE deferred timer lifecycle', async () => {
    interface OCPP16StationStateShape {
      deferredFirmwareUpdateTimer?: NodeJS.Timeout
      stopped?: boolean
    }

    interface PlumbingAccess {
      stationsState: WeakMap<ChargingStation, OCPP16StationStateShape>
    }

    const asPlumbing = (service: OCPP16IncomingRequestService): PlumbingAccess =>
      service as unknown as PlumbingAccess

    let listenerService: OCPP16IncomingRequestService
    let updateFirmwareMock: ReturnType<typeof mock.fn>

    beforeEach(() => {
      listenerService = new OCPP16IncomingRequestService()
      updateFirmwareMock = mock.method(
        listenerService as unknown as {
          updateFirmwareSimulation: (chargingStation: unknown) => Promise<void>
        },
        'updateFirmwareSimulation',
        mock.fn(async () => Promise.resolve())
      )
    })

    afterEach(() => {
      standardCleanup()
    })

    await it('should store the deferred timer handle on OCPP16StationState when retrieveDate is in the future', async t => {
      // Arrange
      const { station } = createOCPP16ListenerStation('listener-timer-store')
      const request: OCPP16UpdateFirmwareRequest = {
        location: 'ftp://localhost/firmware.bin',
        retrieveDate: new Date(Date.now() + 60_000),
      }
      const response: OCPP16UpdateFirmwareResponse = {}

      // Act & Assert
      await withMockTimers(t, ['setTimeout'], () => {
        listenerService.emit(
          OCPP16IncomingRequestCommand.UPDATE_FIRMWARE,
          station,
          request,
          response
        )

        const state = asPlumbing(listenerService).stationsState.get(station)
        assert.notStrictEqual(state, undefined)
        assert.notStrictEqual(state?.deferredFirmwareUpdateTimer, undefined)
      })
    })

    await it('should cancel the deferred timer on stop() and never fire updateFirmwareSimulation', async t => {
      // Arrange
      const { station } = createOCPP16ListenerStation('listener-timer-stop')
      const request: OCPP16UpdateFirmwareRequest = {
        location: 'ftp://localhost/firmware.bin',
        retrieveDate: new Date(Date.now() + 60_000),
      }
      const response: OCPP16UpdateFirmwareResponse = {}

      // Act & Assert
      await withMockTimers(t, ['setTimeout'], async () => {
        listenerService.emit(
          OCPP16IncomingRequestCommand.UPDATE_FIRMWARE,
          station,
          request,
          response
        )

        const plumbing = asPlumbing(listenerService)
        assert.strictEqual(plumbing.stationsState.has(station), true)

        listenerService.stop(station)
        assert.strictEqual(plumbing.stationsState.has(station), true)
        assert.strictEqual(plumbing.stationsState.get(station)?.stopped, true)
        assert.strictEqual(
          plumbing.stationsState.get(station)?.deferredFirmwareUpdateTimer,
          undefined
        )

        t.mock.timers.tick(120_000)
        await flushMicrotasks()

        assert.strictEqual(updateFirmwareMock.mock.callCount(), 0)
      })
    })

    await it('should self-clear the deferred timer handle when the callback fires on schedule', async t => {
      // Arrange
      const { station } = createOCPP16ListenerStation('listener-timer-self-clear')
      const request: OCPP16UpdateFirmwareRequest = {
        location: 'ftp://localhost/firmware.bin',
        retrieveDate: new Date(Date.now() + 100),
      }
      const response: OCPP16UpdateFirmwareResponse = {}

      // Act & Assert
      await withMockTimers(t, ['setTimeout'], async () => {
        listenerService.emit(
          OCPP16IncomingRequestCommand.UPDATE_FIRMWARE,
          station,
          request,
          response
        )

        const plumbing = asPlumbing(listenerService)
        assert.notStrictEqual(
          plumbing.stationsState.get(station)?.deferredFirmwareUpdateTimer,
          undefined
        )

        t.mock.timers.tick(200)
        await flushMicrotasks()

        assert.strictEqual(updateFirmwareMock.mock.callCount(), 1)
        assert.strictEqual(
          plumbing.stationsState.get(station)?.deferredFirmwareUpdateTimer,
          undefined
        )
      })
    })

    await it('should cancel the previous deferred timer when re-scheduled before it fires', async t => {
      // Arrange
      const { station } = createOCPP16ListenerStation('listener-timer-reschedule')
      const firstRequest: OCPP16UpdateFirmwareRequest = {
        location: 'ftp://localhost/firmware.bin',
        retrieveDate: new Date(Date.now() + 60_000),
      }
      const secondRequest: OCPP16UpdateFirmwareRequest = {
        location: 'ftp://localhost/firmware.bin',
        retrieveDate: new Date(Date.now() + 30_000),
      }
      const response: OCPP16UpdateFirmwareResponse = {}

      // Act & Assert
      await withMockTimers(t, ['setTimeout'], async () => {
        listenerService.emit(
          OCPP16IncomingRequestCommand.UPDATE_FIRMWARE,
          station,
          firstRequest,
          response
        )
        listenerService.emit(
          OCPP16IncomingRequestCommand.UPDATE_FIRMWARE,
          station,
          secondRequest,
          response
        )

        t.mock.timers.tick(31_000)
        await flushMicrotasks()
        assert.strictEqual(updateFirmwareMock.mock.callCount(), 1)

        t.mock.timers.tick(60_000)
        await flushMicrotasks()
        assert.strictEqual(updateFirmwareMock.mock.callCount(), 1)
      })
    })

    await it('should isolate deferred timers between stations - stop(A) must not cancel B', async t => {
      // Arrange
      const { station: stationA } = createOCPP16ListenerStation('listener-timer-iso-a')
      const { station: stationB } = createOCPP16ListenerStation('listener-timer-iso-b')
      const request: OCPP16UpdateFirmwareRequest = {
        location: 'ftp://localhost/firmware.bin',
        retrieveDate: new Date(Date.now() + 60_000),
      }
      const response: OCPP16UpdateFirmwareResponse = {}

      // Act & Assert
      await withMockTimers(t, ['setTimeout'], async () => {
        listenerService.emit(
          OCPP16IncomingRequestCommand.UPDATE_FIRMWARE,
          stationA,
          request,
          response
        )
        listenerService.emit(
          OCPP16IncomingRequestCommand.UPDATE_FIRMWARE,
          stationB,
          request,
          response
        )

        const plumbing = asPlumbing(listenerService)
        assert.strictEqual(plumbing.stationsState.has(stationA), true)
        assert.strictEqual(plumbing.stationsState.has(stationB), true)

        listenerService.stop(stationA)
        assert.strictEqual(plumbing.stationsState.has(stationA), true)
        assert.strictEqual(plumbing.stationsState.get(stationA)?.stopped, true)
        assert.strictEqual(
          plumbing.stationsState.get(stationA)?.deferredFirmwareUpdateTimer,
          undefined
        )
        assert.strictEqual(plumbing.stationsState.has(stationB), true)
        assert.notStrictEqual(
          plumbing.stationsState.get(stationB)?.deferredFirmwareUpdateTimer,
          undefined
        )

        t.mock.timers.tick(70_000)
        await flushMicrotasks()

        assert.strictEqual(updateFirmwareMock.mock.callCount(), 1)
      })
    })

    await it('should self-clear the deferred timer handle even when updateFirmwareSimulation rejects', async t => {
      // Arrange
      const { station } = createOCPP16ListenerStation('listener-timer-defer-reject')
      const rejectingMock = mock.method(
        listenerService as unknown as {
          updateFirmwareSimulation: (chargingStation: unknown) => Promise<void>
        },
        'updateFirmwareSimulation',
        mock.fn(async () => Promise.reject(new Error('deferred firmware simulation error')))
      )
      const request: OCPP16UpdateFirmwareRequest = {
        location: 'ftp://localhost/firmware.bin',
        retrieveDate: new Date(Date.now() + 100),
      }
      const response: OCPP16UpdateFirmwareResponse = {}

      // Act & Assert
      await withMockTimers(t, ['setTimeout'], async () => {
        listenerService.emit(
          OCPP16IncomingRequestCommand.UPDATE_FIRMWARE,
          station,
          request,
          response
        )

        t.mock.timers.tick(200)
        await flushMicrotasks()
        await flushMicrotasks()

        assert.strictEqual(rejectingMock.mock.callCount(), 1)
        assert.strictEqual(
          asPlumbing(listenerService).stationsState.get(station)?.deferredFirmwareUpdateTimer,
          undefined
        )
      })
    })

    await it('should clamp retrieveDate delay to Node setTimeout 32-bit maximum and warn', async t => {
      // Arrange
      const { station } = createOCPP16ListenerStation('listener-timer-clamp')
      const warnSpy = t.mock.method(logger, 'warn')
      // MAX_SETINTERVAL_DELAY_MS + 1000 ms drift buffer: Date.now() is not
      // mocked, so a 1 s cushion avoids flake if the listener re-samples
      // Date.now() a few ms later and delayMs drops to exactly MAX.
      const request: OCPP16UpdateFirmwareRequest = {
        location: 'ftp://localhost/firmware.bin',
        retrieveDate: new Date(Date.now() + Constants.MAX_SETINTERVAL_DELAY_MS + 1000),
      }
      const response: OCPP16UpdateFirmwareResponse = {}

      // Act & Assert
      await withMockTimers(t, ['setTimeout'], () => {
        listenerService.emit(
          OCPP16IncomingRequestCommand.UPDATE_FIRMWARE,
          station,
          request,
          response
        )

        assert.strictEqual(warnSpy.mock.callCount(), 1)
        const warnMessage = warnSpy.mock.calls[0].arguments[0] as unknown as string
        assert.match(
          warnMessage,
          new RegExp(
            `exceeds ${Constants.MAX_SETINTERVAL_DELAY_MS.toString()} ms, clamping to ${Constants.MAX_SETINTERVAL_DELAY_MS.toString()} ms`
          )
        )
        assert.notStrictEqual(
          asPlumbing(listenerService).stationsState.get(station)?.deferredFirmwareUpdateTimer,
          undefined
        )
      })
    })
  })
})
