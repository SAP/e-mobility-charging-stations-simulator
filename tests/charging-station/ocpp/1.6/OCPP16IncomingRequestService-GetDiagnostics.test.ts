/**
 * @file Tests for OCPP16IncomingRequestService GetDiagnostics supersession semantics
 * @description Unit tests for OCPP 1.6 GetDiagnostics (§6.1) supersession
 *   lifecycle backed by `activeDiagnosticsAbortController` on
 *   `OCPP16StationState`. Exercises the entry guard's abort-then-install
 *   pattern and the identity-guarded finally cleanup that lets a superseding
 *   handler claim state fields without the superseded handler's late cleanup
 *   clobbering them.
 *
 *   Test strategy: `basic-ftp` `Client` is not directly mockable in this
 *   project — the import is module-scoped, there is no dependency-injection
 *   seam, and `--experimental-test-module-mocks` is not enabled by the test
 *   script. The FTP branch is instead exercised through the no-log-file
 *   early-exit inside its `try` block (mocking
 *   `Configuration.getConfigurationSection` so `logConfiguration.file` is
 *   `undefined`). That path still claims state (`abortController` set,
 *   `diagnosticsUploadInProgress = true`), enters the `try`, returns the empty
 *   response, and runs `finally` — covering the entire state lifecycle without
 *   touching the network. Supersession is verified by pre-populating
 *   `stationState.activeDiagnosticsAbortController` on a spy
 *   `AbortController` and asserting its `signal.aborted === true` after a
 *   superseding dispatch returns; the peek-inside-the-try trick captures the
 *   fresh controller before `finally` clears it.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type { OCPP16IncomingRequestService } from '../../../../src/charging-station/ocpp/1.6/OCPP16IncomingRequestService.js'
import type { GetDiagnosticsRequest } from '../../../../src/types/index.js'

import { ConfigurationSection, OCPP16StandardParametersKey } from '../../../../src/types/index.js'
import { Configuration } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import {
  createOCPP16IncomingRequestTestContext,
  type OCPP16IncomingRequestTestContext,
  setMockRequestHandler,
  upsertConfigurationKey,
} from './OCPP16TestUtils.js'

interface OCPP16StationStateShape {
  activeDiagnosticsAbortController?: AbortController
  diagnosticsUploadInProgress?: boolean
  stopped?: boolean
}

interface PlumbingAccess {
  getOrCreateStationState: (chargingStation: ChargingStation) => OCPP16StationStateShape
  stationsState: WeakMap<ChargingStation, OCPP16StationStateShape>
}

const asPlumbing = (service: OCPP16IncomingRequestService): PlumbingAccess =>
  service as unknown as PlumbingAccess

const enableFirmwareManagement = (station: ChargingStation): void => {
  upsertConfigurationKey(
    station,
    OCPP16StandardParametersKey.SupportedFeatureProfiles,
    'Core,FirmwareManagement'
  )
}

const FTP_LOCATION = 'ftp://localhost/diagnostics'
const HTTP_LOCATION = 'http://localhost/diagnostics'

await describe('OCPP16IncomingRequestService — GetDiagnostics supersession', async () => {
  let context: OCPP16IncomingRequestTestContext

  beforeEach(() => {
    context = createOCPP16IncomingRequestTestContext()
  })

  afterEach(() => {
    standardCleanup()
  })

  await it('should claim activeDiagnosticsAbortController on entry and release both fields in the finally block', async t => {
    // Arrange
    const { incomingRequestService, station, testableService } = context
    enableFirmwareManagement(station)
    const plumbing = asPlumbing(incomingRequestService)

    let midHandlerController: AbortController | undefined
    let midHandlerInProgress: boolean | undefined
    t.mock.method(Configuration, 'getConfigurationSection', (section: ConfigurationSection) => {
      if (section === ConfigurationSection.log) {
        const midState = plumbing.stationsState.get(station)
        midHandlerController = midState?.activeDiagnosticsAbortController
        midHandlerInProgress = midState?.diagnosticsUploadInProgress
        return { file: undefined }
      }
      return {}
    })

    const request: GetDiagnosticsRequest = { location: FTP_LOCATION }

    // Act
    const response = await testableService.handleRequestGetDiagnostics(station, request)

    // Assert — mid-handler state was claimed with a fresh, non-aborted controller
    assert.strictEqual(Object.keys(response).length, 0)
    assert.notStrictEqual(
      midHandlerController,
      undefined,
      'activeDiagnosticsAbortController must be set before the log-configuration read'
    )
    assert.ok(midHandlerController instanceof AbortController)
    assert.strictEqual(midHandlerController.signal.aborted, false)
    assert.strictEqual(midHandlerInProgress, true)

    // Assert — finally released both fields symmetrically
    const finalState = plumbing.stationsState.get(station)
    assert.strictEqual(finalState?.activeDiagnosticsAbortController, undefined)
    assert.strictEqual(finalState?.diagnosticsUploadInProgress, undefined)
  })

  await it('should abort the prior in-flight controller and install a fresh controller when a superseding request arrives', async t => {
    // Arrange — pre-populate an in-flight lifecycle so the next dispatch takes
    // the supersession branch of the entry guard.
    const { incomingRequestService, station, testableService } = context
    enableFirmwareManagement(station)
    const plumbing = asPlumbing(incomingRequestService)

    const priorController = new AbortController()
    const priorState = plumbing.getOrCreateStationState(station)
    priorState.activeDiagnosticsAbortController = priorController
    priorState.diagnosticsUploadInProgress = true

    let midHandlerController: AbortController | undefined
    t.mock.method(Configuration, 'getConfigurationSection', (section: ConfigurationSection) => {
      if (section === ConfigurationSection.log) {
        midHandlerController = plumbing.stationsState.get(station)?.activeDiagnosticsAbortController
        return { file: undefined }
      }
      return {}
    })

    // Act
    const response = await testableService.handleRequestGetDiagnostics(station, {
      location: FTP_LOCATION,
    })

    // Assert — prior controller was aborted by the entry guard
    assert.strictEqual(Object.keys(response).length, 0)
    assert.strictEqual(
      priorController.signal.aborted,
      true,
      'the prior in-flight AbortController must be signalled on supersession'
    )

    // Assert — a fresh, non-aborted controller replaced the prior one mid-handler
    assert.notStrictEqual(midHandlerController, undefined)
    assert.notStrictEqual(
      midHandlerController,
      priorController,
      'the superseding handler must install a fresh AbortController'
    )
    assert.strictEqual(midHandlerController?.signal.aborted, false)

    // Assert — finally released both fields (identity guard matched)
    const finalState = plumbing.stationsState.get(station)
    assert.strictEqual(finalState?.activeDiagnosticsAbortController, undefined)
    assert.strictEqual(finalState?.diagnosticsUploadInProgress, undefined)
  })

  await it('should start subsequent dispatches with a fresh, non-aborted controller after a supersession', async t => {
    // Arrange — pre-populate to force B to supersede A. Then a follow-up C
    // dispatches on the clean state left by B's finally.
    const { incomingRequestService, station, testableService } = context
    enableFirmwareManagement(station)
    const plumbing = asPlumbing(incomingRequestService)

    const priorController = new AbortController()
    const priorState = plumbing.getOrCreateStationState(station)
    priorState.activeDiagnosticsAbortController = priorController
    priorState.diagnosticsUploadInProgress = true

    const observedControllers: (AbortController | undefined)[] = []
    t.mock.method(Configuration, 'getConfigurationSection', (section: ConfigurationSection) => {
      if (section === ConfigurationSection.log) {
        observedControllers.push(
          plumbing.stationsState.get(station)?.activeDiagnosticsAbortController
        )
        return { file: undefined }
      }
      return {}
    })

    // Act — B (supersedes A), then C (fresh)
    await testableService.handleRequestGetDiagnostics(station, { location: FTP_LOCATION })
    await testableService.handleRequestGetDiagnostics(station, { location: FTP_LOCATION })

    // Assert — B and C each installed their own fresh controller, distinct from
    // the pre-populated prior controller and from each other.
    assert.strictEqual(observedControllers.length, 2)
    const [duringB, duringC] = observedControllers
    assert.notStrictEqual(duringB, undefined)
    assert.notStrictEqual(duringC, undefined)
    assert.notStrictEqual(duringB, priorController)
    assert.notStrictEqual(duringC, priorController)
    assert.notStrictEqual(
      duringB,
      duringC,
      'each dispatch must install its own fresh AbortController'
    )
    assert.strictEqual(duringC?.signal.aborted, false)

    const finalState = plumbing.stationsState.get(station)
    assert.strictEqual(finalState?.activeDiagnosticsAbortController, undefined)
    assert.strictEqual(finalState?.diagnosticsUploadInProgress, undefined)
  })

  await it('should abort activeDiagnosticsAbortController and mark the WeakMap entry stopped on stop()', () => {
    // Arrange — pre-populate an in-flight lifecycle, then stop.
    const { incomingRequestService, station } = context
    const plumbing = asPlumbing(incomingRequestService)
    const inflightController = new AbortController()
    const state = plumbing.getOrCreateStationState(station)
    state.activeDiagnosticsAbortController = inflightController
    state.diagnosticsUploadInProgress = true

    // Act
    incomingRequestService.stop(station)

    // Assert — cancel-before-mark ordering: the signal must fire before the
    // base template marks the entry stopped, and the entry must be preserved
    // and sealed.
    assert.strictEqual(
      inflightController.signal.aborted,
      true,
      'stop() must signal the in-flight diagnostics AbortController'
    )
    assert.strictEqual(plumbing.stationsState.has(station), true)
    assert.strictEqual(plumbing.stationsState.get(station)?.stopped, true)
  })

  await it('should not install activeDiagnosticsAbortController for non-FTP locations', async () => {
    // Arrange — the else branch calls ocppRequestService.requestHandler to send
    // DiagnosticsStatusNotification(UploadFailed); stub it out.
    const { incomingRequestService, station, testableService } = context
    enableFirmwareManagement(station)
    setMockRequestHandler(station, async () => Promise.resolve({}))
    const plumbing = asPlumbing(incomingRequestService)

    // Act
    const response = await testableService.handleRequestGetDiagnostics(station, {
      location: HTTP_LOCATION,
    })

    // Assert — the AbortController plumbing lives inside the FTP branch only.
    assert.strictEqual(Object.keys(response).length, 0)
    const state = plumbing.stationsState.get(station)
    assert.strictEqual(state?.activeDiagnosticsAbortController, undefined)
    assert.strictEqual(state?.diagnosticsUploadInProgress, undefined)
  })

  await it('should keep diagnosticsUploadInProgress true across the supersession handoff so the trigger cross-check never sees false-idle', async t => {
    // Arrange — pre-populate an in-flight lifecycle. During the superseding
    // handler's try block (before finally clears state), the flag must remain
    // true. The trigger cross-check at handleRequestTriggerMessage's
    // DiagnosticsStatusNotification case reads exactly this predicate
    // (`stationsState.get(chargingStation)?.diagnosticsUploadInProgress === true`);
    // JS single-threaded semantics guarantee the read cannot interleave with a
    // partial state mutation.
    const { incomingRequestService, station, testableService } = context
    enableFirmwareManagement(station)
    const plumbing = asPlumbing(incomingRequestService)

    const priorController = new AbortController()
    const priorState = plumbing.getOrCreateStationState(station)
    priorState.activeDiagnosticsAbortController = priorController
    priorState.diagnosticsUploadInProgress = true

    let midHandlerInProgress: boolean | undefined
    t.mock.method(Configuration, 'getConfigurationSection', (section: ConfigurationSection) => {
      if (section === ConfigurationSection.log) {
        midHandlerInProgress = plumbing.stationsState.get(station)?.diagnosticsUploadInProgress
        return { file: undefined }
      }
      return {}
    })

    // Act
    await testableService.handleRequestGetDiagnostics(station, {
      location: FTP_LOCATION,
    })

    // Assert — flag observed as true mid-handoff, cleared after finally.
    assert.strictEqual(
      midHandlerInProgress,
      true,
      'diagnosticsUploadInProgress must remain true across the supersession handoff'
    )
    assert.strictEqual(plumbing.stationsState.get(station)?.diagnosticsUploadInProgress, undefined)
  })

  await it('should isolate supersession state between stations so an abort on A does not touch B', async t => {
    // Arrange — one shared service, two stations with independent state entries.
    const { incomingRequestService, station: stationA, testableService } = context
    const { station: stationB } = createOCPP16IncomingRequestTestContext({
      baseName: 'get-diag-iso-b',
    })
    enableFirmwareManagement(stationA)

    const plumbing = asPlumbing(incomingRequestService)
    const priorAController = new AbortController()
    const stateA = plumbing.getOrCreateStationState(stationA)
    stateA.activeDiagnosticsAbortController = priorAController
    stateA.diagnosticsUploadInProgress = true

    const priorBController = new AbortController()
    const stateB = plumbing.getOrCreateStationState(stationB)
    stateB.activeDiagnosticsAbortController = priorBController
    stateB.diagnosticsUploadInProgress = true

    t.mock.method(Configuration, 'getConfigurationSection', (section: ConfigurationSection) => {
      if (section === ConfigurationSection.log) {
        return { file: undefined }
      }
      return {}
    })

    // Act — supersede A only.
    await testableService.handleRequestGetDiagnostics(stationA, {
      location: FTP_LOCATION,
    })

    // Assert — A aborted and cleaned.
    assert.strictEqual(priorAController.signal.aborted, true)
    const finalA = plumbing.stationsState.get(stationA)
    assert.strictEqual(finalA?.activeDiagnosticsAbortController, undefined)
    assert.strictEqual(finalA?.diagnosticsUploadInProgress, undefined)

    // Assert — B fully untouched (controller reference preserved, not aborted).
    assert.strictEqual(priorBController.signal.aborted, false)
    const finalB = plumbing.stationsState.get(stationB)
    assert.ok(finalB, 'station B state entry must survive station A supersession')
    assert.strictEqual(finalB.activeDiagnosticsAbortController, priorBController)
    assert.strictEqual(finalB.diagnosticsUploadInProgress, true)
  })
})
