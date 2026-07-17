/**
 * @file Tests that a charging station keeps its configured identity across a reset.
 * @description A reset re-initializes the station. A station with a persisted
 * configuration restores its identity from the saved config file; a
 * non-persistent one only keeps it when the creation options are re-applied.
 */
import assert from 'node:assert/strict'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { setTimeout as sleep } from 'node:timers/promises'

import type { ChargingStationOptions } from '../../src/types/index.js'

import { ChargingStation } from '../../src/charging-station/ChargingStation.js'
import { SharedLRUCache } from '../../src/charging-station/SharedLRUCache.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

// The identity logic lives in initialize(); the identity tests call it directly
// to avoid reset()'s stop/sleep/start (which would dial a socket). A separate
// test drives reset() with those stubbed to guard the reset -> initialize wiring.
interface StationInternals {
  creationOptions?: ChargingStationOptions
  initialize: (options?: ChargingStationOptions) => void
}
const internalsOf = (station: ChargingStation): StationInternals =>
  station as unknown as StationInternals

const identityOf = (station: ChargingStation): string | undefined =>
  station.stationInfo?.chargingStationId

const tmpRoots: string[] = []

// Fresh template under its own temp station-templates dir, so each test's
// persisted config lands in an isolated sibling configurations dir. Optional
// overrides are merged into the template's top-level fields (e.g. to enable the
// OCPP-config supervision URL mechanism).
const makeTemplate = (overrides?: Record<string, boolean | number | string>): string => {
  const root = mkdtempSync(join(tmpdir(), 'cs-reset-identity-'))
  tmpRoots.push(root)
  mkdirSync(join(root, 'station-templates'), { recursive: true })
  const file = join(root, 'station-templates', 'virtual-simple.station-template.json')
  const source = join(
    process.cwd(),
    'src/assets/station-templates/virtual-simple.station-template.json'
  )
  if (overrides == null) {
    copyFileSync(source, file)
  } else {
    const template = JSON.parse(readFileSync(source, 'utf8')) as Record<string, unknown>
    writeFileSync(file, JSON.stringify({ ...template, ...overrides }, null, 2))
  }
  return file
}

// Config writes are asynchronous, so wait until the identity has been persisted.
// The configurations dir sits beside the station-templates dir (same derivation
// the station uses to place its config file).
const waitForPersistedId = async (
  templateFile: string,
  chargingStationId: string
): Promise<boolean> => {
  const configurationsDir = dirname(templateFile.replace('station-templates', 'configurations'))
  for (let attempt = 0; attempt < 100; attempt++) {
    if (existsSync(configurationsDir)) {
      for (const file of readdirSync(configurationsDir)) {
        const { stationInfo } = JSON.parse(readFileSync(join(configurationsDir, file), 'utf8')) as {
          stationInfo?: { chargingStationId?: string }
        }
        if (stationInfo?.chargingStationId === chargingStationId) {
          return true
        }
      }
    }
    await sleep(20)
  }
  return false
}

await describe('ChargingStation keeps its identity across a reset', async () => {
  afterEach(() => {
    standardCleanup()
    // The real ChargingStation uses the real SharedLRUCache singleton (not the
    // mock standardCleanup resets); clear it so a cached template cannot bleed
    // between tests.
    SharedLRUCache.getInstance().clear()
    for (const root of tmpRoots.splice(0)) {
      rmSync(root, { force: true, recursive: true })
    }
  })

  await it('should keep identity only when the creation options are re-applied (non-persistent)', () => {
    const options: ChargingStationOptions = {
      autoStart: false,
      baseName: 'TEST-RESET-ID',
      fixedName: true,
      persistentConfiguration: false,
      supervisionUrls: 'ws://localhost:9999/',
    }
    const station = new ChargingStation(1, makeTemplate(), options)
    assert.strictEqual(identityOf(station), 'TEST-RESET-ID')

    // With no options and no saved config to fall back to, the station reverts
    // to the template's default identity.
    internalsOf(station).initialize()
    assert.notStrictEqual(identityOf(station), 'TEST-RESET-ID')

    // Re-applying the retained creation options restores the configured identity.
    internalsOf(station).initialize(internalsOf(station).creationOptions)
    assert.strictEqual(identityOf(station), 'TEST-RESET-ID')
  })

  await it('should keep identity without re-applying the creation options (persistent)', async () => {
    const templateFile = makeTemplate()
    const station = new ChargingStation(1, templateFile, {
      autoStart: false,
      baseName: 'TEST-PERSIST-ID',
      fixedName: true,
      persistentConfiguration: true,
      supervisionUrls: 'ws://localhost:9999/',
    })
    assert.strictEqual(identityOf(station), 'TEST-PERSIST-ID')
    assert.ok(
      await waitForPersistedId(templateFile, 'TEST-PERSIST-ID'),
      'identity was not persisted'
    )

    // The saved configuration restores the identity on its own, so only a
    // non-persistent station needs the retained options.
    internalsOf(station).initialize()
    assert.strictEqual(identityOf(station), 'TEST-PERSIST-ID')
  })

  // reset() forwards the creation options to initialize() only for a
  // non-persistent station; a persistent one restores from its saved config, so
  // reset() passes nothing. stop/start are stubbed so reset() neither tears down
  // nor dials a socket, and the reset delay is zeroed.
  for (const persistentConfiguration of [false, true]) {
    await it(`should re-apply the creation options to initialize() only when non-persistent (persistent=${persistentConfiguration.toString()})`, async t => {
      const station = new ChargingStation(1, makeTemplate(), {
        autoStart: false,
        baseName: 'TEST-RESET-WIRING',
        fixedName: true,
        persistentConfiguration,
        supervisionUrls: 'ws://localhost:9999/',
      })
      if (station.stationInfo != null) {
        station.stationInfo.resetTime = 0
      }
      const internals = station as unknown as StationInternals & {
        start: () => void
        stop: () => Promise<void>
      }
      t.mock.method(internals, 'stop', () => Promise.resolve())
      t.mock.method(internals, 'start', () => undefined)
      const initializeSpy = t.mock.method(internals, 'initialize', () => undefined)

      await station.reset()

      assert.strictEqual(initializeSpy.mock.calls.length, 1)
      assert.strictEqual(
        initializeSpy.mock.calls[0].arguments[0],
        persistentConfiguration ? undefined : internals.creationOptions
      )
    })
  }

  await it('should keep the setSupervisionUrl URL across a reset via the retained options', () => {
    const station = new ChargingStation(1, makeTemplate(), {
      autoStart: false,
      persistentConfiguration: false,
      supervisionUrls: 'ws://localhost:9999/',
    })
    station.setSupervisionUrl('ws://localhost:8888/')

    // The runtime URL is mirrored into the retained options...
    assert.strictEqual(
      internalsOf(station).creationOptions?.supervisionUrls,
      'ws://localhost:8888/'
    )
    // ...so re-applying them on reset keeps it instead of the creation-time URL.
    internalsOf(station).initialize(internalsOf(station).creationOptions)
    assert.strictEqual(station.stationInfo?.supervisionUrls, 'ws://localhost:8888/')
  })

  await it('should keep an OCPP-config supervision URL across a warm-cache reset (non-persistent)', async t => {
    // supervisionUrlOcppConfiguration routes the URL through an OCPP config key
    // rather than stationInfo.supervisionUrls, and must be a template field to
    // survive the reset rebuild.
    const station = new ChargingStation(
      1,
      makeTemplate({
        supervisionUrlOcppConfiguration: true,
        supervisionUrlOcppKey: 'ConnectionUrl',
      }),
      { autoStart: false, persistentConfiguration: false, supervisionUrls: 'ws://localhost:9999/' }
    )
    station.setSupervisionUrl('ws://localhost:7777/')
    if (station.stationInfo != null) {
      station.stationInfo.resetTime = 0
    }
    // Stub stop/start so the real reset() re-initializes without tearing down or
    // dialing a socket.
    const internals = station as unknown as { start: () => void; stop: () => Promise<void> }
    t.mock.method(internals, 'stop', () => Promise.resolve())
    t.mock.method(internals, 'start', () => undefined)

    await station.reset()

    // A plain reset() reuses the warm template cache, whose in-place OCPP-key
    // mutation still carries the URL; the retained-options mirror is not exercised
    // on this path (see the cache-cold reload test below).
    assert.strictEqual(station.wsConnectionUrl.host, 'localhost:7777')
  })

  await it('should re-seed an OCPP-config supervision URL from the retained options on template reload (non-persistent)', () => {
    const station = new ChargingStation(
      1,
      makeTemplate({
        supervisionUrlOcppConfiguration: true,
        supervisionUrlOcppKey: 'ConnectionUrl',
      }),
      { autoStart: false, persistentConfiguration: false, supervisionUrls: 'ws://localhost:9999/' }
    )
    station.setSupervisionUrl('ws://localhost:7777/')

    // Invalidate the cached template exactly as the template-reload path does (the
    // watcher calls deleteChargingStationTemplate before initialize), forcing the
    // OCPP key absent on reinitialization so it is re-seeded from configuredSupervisionUrl.
    // This is the only path where the retained-options mirror is load-bearing: a
    // warm-cache reset passes via the cached mutation and would not guard it.
    SharedLRUCache.getInstance().clear()
    internalsOf(station).initialize(internalsOf(station).creationOptions)

    assert.strictEqual(station.wsConnectionUrl.host, 'localhost:7777')
  })
})
