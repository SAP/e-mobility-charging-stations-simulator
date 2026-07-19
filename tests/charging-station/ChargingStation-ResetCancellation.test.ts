/**
 * @file Tests that delete() cancels a pending reset() (issue #2027 part A).
 * @description reset() stops the station, waits resetTime, then re-initializes
 * and reconnects. A delete() during that window must abort the pending
 * re-initialize so the deleted station is not resurrected and reconnected to the
 * CSMS (the "zombie" reconnect that triggers issue #2017).
 */
import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'

import type { ChargingStationOptions } from '../../src/types/index.js'

import { ChargingStation } from '../../src/charging-station/ChargingStation.js'
import {
  flushMicrotasks,
  standardCleanup,
  withMockTimers,
} from '../helpers/TestLifecycleHelpers.js'

const RESET_TIME_MS = 60000

const tmpRoots: string[] = []

// Fresh template under its own temp station-templates dir so each test is
// isolated, mirroring the ChargingStation-ResetIdentity harness.
const makeTemplate = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'cs-reset-cancel-'))
  tmpRoots.push(root)
  mkdirSync(join(root, 'station-templates'), { recursive: true })
  const file = join(root, 'station-templates', 'virtual-simple.station-template.json')
  copyFileSync(
    join(process.cwd(), 'src/assets/station-templates/virtual-simple.station-template.json'),
    file
  )
  return file
}

interface ResetInternals {
  initialize: (options?: ChargingStationOptions) => void
  start: () => void
  stop: () => Promise<void>
}

const newStation = (resetTimeMs = RESET_TIME_MS): ChargingStation => {
  const station = new ChargingStation(1, makeTemplate(), {
    autoStart: false,
    baseName: 'TEST-RESET-CANCEL',
    fixedName: true,
    persistentConfiguration: false,
    supervisionUrls: 'ws://localhost:9999/',
  })
  if (station.stationInfo != null) {
    station.stationInfo.resetTime = resetTimeMs
  }
  return station
}

await describe('ChargingStation cancellable reset', async () => {
  afterEach(() => {
    standardCleanup()
    for (const root of tmpRoots.splice(0)) {
      rmSync(root, { force: true, recursive: true })
    }
  })

  await it('should not re-initialize or reconnect when deleted during the reset sleep window', async t => {
    await withMockTimers(t, ['setTimeout'], async () => {
      const station = newStation()
      // Stub stop/start/initialize so the real reset() neither tears down nor
      // dials a socket; the spies observe whether a deleted station is resurrected.
      const internals = station as unknown as ResetInternals
      t.mock.method(internals, 'stop', () => Promise.resolve())
      const initializeSpy = t.mock.method(internals, 'initialize', () => undefined)
      const startSpy = t.mock.method(internals, 'start', () => undefined)

      // Fire-and-forget reset() (matching the OCPP Reset handler) and let it
      // reach the interruptible sleep.
      const resetPromise = station.reset()
      await flushMicrotasks()

      // Delete mid-reset; this must abort the pending re-initialize.
      await station.delete(false)

      // Elapse the full reset delay to prove even a completed timer cannot
      // resurrect a deleted station.
      t.mock.timers.tick(RESET_TIME_MS)
      await resetPromise

      assert.strictEqual(initializeSpy.mock.calls.length, 0)
      assert.strictEqual(startSpy.mock.calls.length, 0)
    })
  })

  await it('should not re-initialize when deleted after the reset sleep resolves but before re-initialization', async t => {
    await withMockTimers(t, ['setTimeout'], async () => {
      const station = newStation()
      const internals = station as unknown as ResetInternals
      t.mock.method(internals, 'stop', () => Promise.resolve())
      const initializeSpy = t.mock.method(internals, 'initialize', () => undefined)
      const startSpy = t.mock.method(internals, 'start', () => undefined)

      const resetPromise = station.reset()
      await flushMicrotasks()

      // Fire the timer first: the sleep resolves normally and queues reset's
      // continuation as a microtask. Deleting before that microtask runs (abort
      // is synchronous) must still be observed by the post-sleep recheck.
      t.mock.timers.tick(RESET_TIME_MS)
      const deletePromise = station.delete(false)
      await deletePromise
      await resetPromise

      assert.strictEqual(initializeSpy.mock.calls.length, 0)
      assert.strictEqual(startSpy.mock.calls.length, 0)
    })
  })

  await it('should not re-initialize when deleted during a zero reset time window', async t => {
    await withMockTimers(t, ['setTimeout'], async () => {
      const station = newStation(0)
      const internals = station as unknown as ResetInternals
      t.mock.method(internals, 'stop', () => Promise.resolve())
      const initializeSpy = t.mock.method(internals, 'initialize', () => undefined)
      const startSpy = t.mock.method(internals, 'start', () => undefined)

      const resetPromise = station.reset()
      await flushMicrotasks()

      await station.delete(false)

      t.mock.timers.tick(0)
      await resetPromise

      assert.strictEqual(initializeSpy.mock.calls.length, 0)
      assert.strictEqual(startSpy.mock.calls.length, 0)
    })
  })

  await it('should re-initialize and start on each consecutive normal reset when not deleted', async t => {
    await withMockTimers(t, ['setTimeout'], async () => {
      const station = newStation()
      const internals = station as unknown as ResetInternals
      t.mock.method(internals, 'stop', () => Promise.resolve())
      const initializeSpy = t.mock.method(internals, 'initialize', () => undefined)
      const startSpy = t.mock.method(internals, 'start', () => undefined)

      // Positive control: a normal reset (no delete) must re-initialize and
      // start, so the abort guard cannot fire spuriously. A second reset must
      // re-initialize too, proving reset() never consumes the shared signal.
      const firstReset = station.reset()
      await flushMicrotasks()
      t.mock.timers.tick(RESET_TIME_MS)
      await firstReset

      assert.strictEqual(initializeSpy.mock.calls.length, 1)
      assert.strictEqual(startSpy.mock.calls.length, 1)

      const secondReset = station.reset()
      await flushMicrotasks()
      t.mock.timers.tick(RESET_TIME_MS)
      await secondReset

      assert.strictEqual(initializeSpy.mock.calls.length, 2)
      assert.strictEqual(startSpy.mock.calls.length, 2)
    })
  })
})
