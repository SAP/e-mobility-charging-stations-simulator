/**
 * @file Tests for `autoRegister` and `ocppProtocol` default seeding into `stationInfo`.
 * @description Both fields are static defaults with no derivation, so they live in
 * `DEFAULT_STATION_INFO` (`autoRegister: false`, `ocppProtocol: OCPPProtocol.JSON`)
 * and are applied by `getStationInfo` via `mergeDeepRight(DEFAULT_STATION_INFO, stationInfo)`.
 * A template omitting them must yield the seeded values in `stationInfo` and in the UI
 * data payload (`buildAddedMessage`) instead of `undefined` (the empty Web UI placeholder).
 * An explicit template value is preserved (idempotent, no clobber), and a persisted
 * configuration predating the fields is backfilled on reload. `ocppProtocol` preservation
 * is not tested: the enum has a single value, so an explicit value is indistinguishable
 * from the default (non-discriminant).
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/ChargingStation.js'

import { OCPPProtocol } from '../../src/types/index.js'
import { buildAddedMessage } from '../../src/utils/MessageChannelUtils.js'
import { flushMicrotasks, standardCleanup } from '../helpers/TestLifecycleHelpers.js'
import {
  cleanupStationTemplates,
  createStationFromTemplate,
  writeStationTemplate,
} from './helpers/StationHelpers.realStation.js'

const POWER_W = 22000

interface TemplateOverrides {
  autoRegister?: boolean
}

const buildTemplate = (overrides: TemplateOverrides = {}): Record<string, unknown> => ({
  $schemaVersion: 1,
  baseName: 'TEST-AUTO-REGISTER-OCPP-PROTOCOL',
  chargePointModel: 'Simulator simple',
  chargePointVendor: 'Simulator',
  Connectors: {
    0: {},
    1: { bootStatus: 'Available' },
  },
  currentOutType: 'AC',
  numberOfConnectors: 1,
  power: POWER_W,
  powerUnit: 'W',
  randomConnectors: false,
  ...(overrides.autoRegister != null ? { autoRegister: overrides.autoRegister } : {}),
})

const makeStation = (templateFile: string, persistentConfiguration = false): ChargingStation =>
  createStationFromTemplate(templateFile, {
    baseName: 'TEST-AUTO-REGISTER-OCPP-PROTOCOL',
    fixedName: true,
    persistentConfiguration,
  })

const newStation = (overrides: TemplateOverrides = {}): ChargingStation =>
  makeStation(writeStationTemplate(buildTemplate(overrides)))

await describe('ChargingStation autoRegister/ocppProtocol seeding', async () => {
  afterEach(() => {
    standardCleanup()
    cleanupStationTemplates()
  })

  await it('should seed autoRegister to false for a template omitting the field', () => {
    const station = newStation()
    assert.strictEqual(station.stationInfo?.autoRegister, false)
  })

  await it('should seed ocppProtocol to json for a template omitting the field', () => {
    const station = newStation()
    assert.strictEqual(station.stationInfo?.ocppProtocol, OCPPProtocol.JSON)
  })

  await it('should transmit the seeded defaults in the UI data payload', () => {
    const station = newStation()
    const { stationInfo } = buildAddedMessage(station).data
    assert.strictEqual(stationInfo.autoRegister, false)
    assert.strictEqual(stationInfo.ocppProtocol, OCPPProtocol.JSON)
  })

  await it('should preserve an explicit autoRegister template value', () => {
    const station = newStation({ autoRegister: true })
    assert.strictEqual(station.stationInfo?.autoRegister, true)
  })

  await it('should backfill the defaults into a persisted config that predates the fields', async () => {
    const templateFile = writeStationTemplate(buildTemplate())
    // The persisted config write runs under an async lock; flush before reading it back.
    makeStation(templateFile, true)
    await flushMicrotasks()
    // Simulate a legacy configuration written before the fields were seeded.
    const configurationDir = join(dirname(dirname(templateFile)), 'configurations')
    const configurationFile = join(
      configurationDir,
      readdirSync(configurationDir).find(entry => entry.endsWith('.json')) ?? ''
    )
    const configuration = JSON.parse(readFileSync(configurationFile, 'utf8')) as {
      stationInfo: { autoRegister?: boolean; ocppProtocol?: string }
    }
    assert.strictEqual(configuration.stationInfo.autoRegister, false)
    assert.strictEqual(configuration.stationInfo.ocppProtocol, OCPPProtocol.JSON)
    delete configuration.stationInfo.autoRegister
    delete configuration.stationInfo.ocppProtocol
    writeFileSync(configurationFile, JSON.stringify(configuration), 'utf8')
    // A fresh station starts with an empty configurationFileHash, so getConfigurationFromFile
    // bypasses the shared cache and reads the file from disk; the file-sourced stationInfo
    // is backfilled by mergeDeepRight(DEFAULT_STATION_INFO, stationInfo) in getStationInfo.
    const reloaded = makeStation(templateFile, true)
    assert.ok(reloaded.stationInfo)
    assert.strictEqual(reloaded.stationInfo.autoRegister, false)
    assert.strictEqual(reloaded.stationInfo.ocppProtocol, OCPPProtocol.JSON)
  })
})
