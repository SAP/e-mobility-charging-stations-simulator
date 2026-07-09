/**
 * @file Tests for OCPPIncomingRequestService per-station state plumbing (#1963)
 * @description Unit tests for the shared WeakMap + lazy-init + stop() template
 *   in `OCPPIncomingRequestService` and for the OCPP 1.6 `resetStationState`
 *   contract.
 *
 * The OCPP 2.0.1 5-statement ordering invariant (abort firmware → abort log →
 * cancel retry → resetActiveFirmwareUpdateState → resetActiveLogUploadState)
 * is enforced by three independent mechanisms verified out-of-band from these
 * tests: (1) JSDoc rationale on `OCPP20IncomingRequestService.resetStationState`
 * documenting the `?.abort()` short-circuit consequence of reordering, (2) the
 * `no-restricted-syntax` ESLint rule preventing direct `stationsState`
 * mutations from subclass code, and (3) byte-identical preservation of the
 * pre-refactor `stop()` body.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../src/charging-station/index.js'

import { OCPP16IncomingRequestService } from '../../../src/charging-station/ocpp/1.6/OCPP16IncomingRequestService.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'
import { createMockChargingStation } from '../helpers/StationHelpers.js'

type OCPP16StationStateShape = Record<string, unknown>

interface PlumbingAccess<T extends object> {
  createStationState: () => T
  getOrCreateStationState: (chargingStation: ChargingStation) => T
  resetStationState: (state: T) => void
  stationsState: WeakMap<ChargingStation, T>
}

const asPlumbing = (
  service: OCPP16IncomingRequestService
): PlumbingAccess<OCPP16StationStateShape> =>
  service as unknown as PlumbingAccess<OCPP16StationStateShape>

await describe('OCPPIncomingRequestService — per-station state plumbing', async () => {
  let service: OCPP16IncomingRequestService
  let plumbing: PlumbingAccess<OCPP16StationStateShape>
  let stationA: ChargingStation
  let stationB: ChargingStation

  beforeEach(() => {
    service = new OCPP16IncomingRequestService()
    plumbing = asPlumbing(service)
    stationA = createMockChargingStation({ index: 1 }).station
    stationB = createMockChargingStation({ index: 2 }).station
  })

  afterEach(() => {
    standardCleanup()
  })

  await it('should lazily create state on first access and reuse it on repeat calls', () => {
    const createSpy: ReturnType<typeof mock.fn> = mock.method(
      plumbing,
      'createStationState',
      () => ({})
    )

    const first = plumbing.getOrCreateStationState(stationA)
    const second = plumbing.getOrCreateStationState(stationA)

    assert.strictEqual(first, second)
    assert.strictEqual(createSpy.mock.callCount(), 1)
    assert.strictEqual(plumbing.stationsState.has(stationA), true)
    assert.strictEqual(plumbing.stationsState.get(stationA), first)
  })

  await it('should delete the WeakMap entry after stop()', () => {
    plumbing.getOrCreateStationState(stationA)
    assert.strictEqual(plumbing.stationsState.has(stationA), true)

    service.stop(stationA)

    assert.strictEqual(plumbing.stationsState.has(stationA), false)
  })

  await it('should invoke resetStationState exactly once with the current state on stop()', () => {
    const state = plumbing.getOrCreateStationState(stationA)
    const resetSpy: ReturnType<typeof mock.fn> = mock.method(plumbing, 'resetStationState')

    service.stop(stationA)

    assert.strictEqual(resetSpy.mock.callCount(), 1)
    assert.strictEqual(resetSpy.mock.calls[0].arguments[0], state)
  })

  await it('should be a no-op when stop() is called on a station with no state entry', () => {
    const resetSpy: ReturnType<typeof mock.fn> = mock.method(plumbing, 'resetStationState')

    service.stop(stationA)

    assert.strictEqual(resetSpy.mock.callCount(), 0)
    assert.strictEqual(plumbing.stationsState.has(stationA), false)
  })

  await it('should isolate state per station — stop(A) must not affect B', () => {
    const stateA = plumbing.getOrCreateStationState(stationA)
    const stateB = plumbing.getOrCreateStationState(stationB)
    assert.notStrictEqual(stateA, stateB)

    service.stop(stationA)

    assert.strictEqual(plumbing.stationsState.has(stationA), false)
    assert.strictEqual(plumbing.stationsState.has(stationB), true)
    assert.strictEqual(plumbing.stationsState.get(stationB), stateB)
  })

  await it('should not mutate state in the OCPP 1.6 default resetStationState', () => {
    const state = plumbing.getOrCreateStationState(stationA)
    const keysBefore = Object.keys(state)

    plumbing.resetStationState(state)

    assert.deepStrictEqual(Object.keys(state), keysBefore)
    assert.deepStrictEqual(state, {})
    assert.strictEqual(plumbing.stationsState.get(stationA), state)
  })

  await it('should not delete the WeakMap entry when resetStationState throws, and re-invoke on subsequent stop()', () => {
    const state = plumbing.getOrCreateStationState(stationA)
    const failure = new Error('reset failed')
    let shouldThrow = true
    const resetSpy: ReturnType<typeof mock.fn> = mock.method(plumbing, 'resetStationState', () => {
      if (shouldThrow) {
        throw failure
      }
    })

    assert.throws(
      () => {
        service.stop(stationA)
      },
      (err: unknown) => err === failure
    )
    assert.strictEqual(plumbing.stationsState.has(stationA), true)
    assert.strictEqual(plumbing.stationsState.get(stationA), state)

    shouldThrow = false
    service.stop(stationA)

    assert.strictEqual(resetSpy.mock.callCount(), 2)
    assert.strictEqual(resetSpy.mock.calls[1].arguments[0], state)
    assert.strictEqual(plumbing.stationsState.has(stationA), false)
  })
})
