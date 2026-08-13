/**
 * @file Tests for `numberOfPhases` default seeding into `stationInfo`.
 * @description The derived `numberOfPhases` default lives only in the
 * `getNumberOfPhases` getter (AC: template value ?? 3, DC: 0) and must be
 * seeded into `stationInfo` by `getStationInfo` so raw consumers — the UI data
 * payload (`buildAddedMessage`) and the persisted configuration — receive the
 * effective value instead of `undefined`. An explicit AC template value is
 * preserved (idempotent, no clobber), DC pins 0 even against an explicit
 * template value, and a persisted configuration predating the field is
 * backfilled on reload.
 */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { afterEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/ChargingStation.js'

import { buildAddedMessage } from '../../src/utils/MessageChannelUtils.js'
import { flushMicrotasks, standardCleanup } from '../helpers/TestLifecycleHelpers.js'
import {
  cleanupStationTemplates,
  createStationFromTemplate,
  resolvePersistedConfigurationFile,
  writeStationTemplate,
} from './helpers/StationHelpers.realStation.js'

const POWER_W = 22000

interface TemplateOverrides {
  currentOutType?: string
  numberOfPhases?: number
}

const buildTemplate = (overrides: TemplateOverrides = {}): Record<string, unknown> => ({
  $schemaVersion: 1,
  baseName: 'TEST-NUMBER-OF-PHASES',
  chargePointModel: 'Simulator simple',
  chargePointVendor: 'Simulator',
  Connectors: {
    0: {},
    1: { bootStatus: 'Available' },
  },
  currentOutType: overrides.currentOutType ?? 'AC',
  numberOfConnectors: 1,
  power: POWER_W,
  powerUnit: 'W',
  randomConnectors: false,
  ...(overrides.numberOfPhases != null ? { numberOfPhases: overrides.numberOfPhases } : {}),
})

const makeStation = (templateFile: string, persistentConfiguration = false): ChargingStation =>
  createStationFromTemplate(templateFile, {
    baseName: 'TEST-NUMBER-OF-PHASES',
    fixedName: true,
    persistentConfiguration,
  })

const newStation = (overrides: TemplateOverrides = {}): ChargingStation =>
  makeStation(writeStationTemplate(buildTemplate(overrides)))

await describe('ChargingStation numberOfPhases seeding', async () => {
  afterEach(() => {
    standardCleanup()
    cleanupStationTemplates()
  })

  await it('should seed numberOfPhases to 3 for an AC template omitting the field', () => {
    const station = newStation({ currentOutType: 'AC' })
    assert.strictEqual(station.stationInfo?.numberOfPhases, 3)
  })

  await it('should seed numberOfPhases to 0 for a DC template', () => {
    const station = newStation({ currentOutType: 'DC' })
    assert.strictEqual(station.stationInfo?.numberOfPhases, 0)
  })

  await it('should preserve an explicit AC template numberOfPhases value', () => {
    const station = newStation({ currentOutType: 'AC', numberOfPhases: 1 })
    assert.strictEqual(station.stationInfo?.numberOfPhases, 1)
  })

  await it('should transmit the seeded numberOfPhases in the UI data payload', () => {
    const station = newStation({ currentOutType: 'AC' })
    const payload = buildAddedMessage(station).data
    assert.strictEqual(payload.stationInfo.numberOfPhases, 3)
  })

  await it('should match getNumberOfPhases so backend consumers are invariant', () => {
    const acStation = newStation({ currentOutType: 'AC' })
    assert.strictEqual(acStation.stationInfo?.numberOfPhases, acStation.getNumberOfPhases())
    const dcStation = newStation({ currentOutType: 'DC' })
    assert.strictEqual(dcStation.stationInfo?.numberOfPhases, dcStation.getNumberOfPhases())
  })

  await it('should pin numberOfPhases to 0 for DC even when the template sets it', () => {
    const station = newStation({ currentOutType: 'DC', numberOfPhases: 3 })
    assert.strictEqual(station.stationInfo?.numberOfPhases, 0)
  })

  await it('should backfill numberOfPhases into a persisted config that predates the field', async () => {
    const templateFile = writeStationTemplate(buildTemplate({ currentOutType: 'AC' }))
    // The persisted config write runs under an async lock; flush before reading it back.
    makeStation(templateFile, true)
    await flushMicrotasks()
    // Simulate a legacy configuration written before numberOfPhases was seeded.
    const configurationFile = resolvePersistedConfigurationFile(templateFile)
    const configuration = JSON.parse(readFileSync(configurationFile, 'utf8')) as {
      stationInfo: { numberOfPhases?: number }
    }
    assert.strictEqual(configuration.stationInfo.numberOfPhases, 3)
    delete configuration.stationInfo.numberOfPhases
    writeFileSync(configurationFile, JSON.stringify(configuration), 'utf8')
    // A fresh station starts with an empty configurationFileHash, so getConfigurationFromFile
    // bypasses the shared cache and reads the file from disk; the file-sourced stationInfo
    // must backfill the field.
    const reloaded = makeStation(templateFile, true)
    assert.strictEqual(reloaded.stationInfo?.numberOfPhases, 3)
  })
})
