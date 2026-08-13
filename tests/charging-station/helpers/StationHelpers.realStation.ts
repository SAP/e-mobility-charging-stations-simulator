/**
 * @file Helpers to build a real ChargingStation from a template file.
 * @description Tests that exercise the real construction pipeline
 * (`initialize()`/`getStationInfo()`, persistence, reset, reconnect) cannot use
 * the `createMockChargingStation` stub, which bypasses it. Grouped by concern:
 * (1) temp `station-templates` dir lifecycle — write an inline template
 * (`writeStationTemplate`) or copy a bundled asset (`copyStationTemplate`),
 * removed by a single `afterEach` `cleanupStationTemplates`; (2) real
 * `ChargingStation` construction (`createStationFromTemplate`); (3) resolution of
 * the persisted configuration the station writes (`persistedConfigurationDir`,
 * `resolvePersistedConfigurationFile`).
 */
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import type { ChargingStationOptions } from '../../../src/types/index.js'

import { ChargingStation } from '../../../src/charging-station/ChargingStation.js'

const TEST_SUPERVISION_URL = 'ws://localhost:9999/'
const ASSET_TEMPLATES_DIR = join(process.cwd(), 'src', 'assets', 'station-templates')
const DEFAULT_ASSET_TEMPLATE = 'virtual-simple.station-template.json'

const templateRoots: string[] = []

const freshTemplateDir = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'cs-test-'))
  templateRoots.push(root)
  mkdirSync(join(root, 'station-templates'), { recursive: true })
  return root
}

// ---------------------------------------------------------------
// Temp template dir lifecycle
// ---------------------------------------------------------------

/**
 * Writes an inline template object into a fresh isolated `station-templates` dir.
 * @param template - Template object to serialize.
 * @param fileName - Template file name (cosmetic; the config path derives from the dir).
 * @returns Absolute path to the written template file.
 */
export const writeStationTemplate = (
  template: Record<string, unknown>,
  fileName = 'test.station-template.json'
): string => {
  const file = join(freshTemplateDir(), 'station-templates', fileName)
  writeFileSync(file, JSON.stringify(template), 'utf8')
  return file
}

/**
 * Copies a bundled asset template into a fresh isolated `station-templates` dir,
 * optionally merging top-level overrides.
 * @param overrides - Top-level fields merged into the asset template.
 * @param assetFileName - Asset template file name under `src/assets/station-templates`.
 * @returns Absolute path to the template file.
 */
export const copyStationTemplate = (
  overrides?: Record<string, unknown>,
  assetFileName = DEFAULT_ASSET_TEMPLATE
): string => {
  const file = join(freshTemplateDir(), 'station-templates', assetFileName)
  const source = join(ASSET_TEMPLATES_DIR, assetFileName)
  if (overrides == null) {
    copyFileSync(source, file)
  } else {
    const template = JSON.parse(readFileSync(source, 'utf8')) as Record<string, unknown>
    writeFileSync(file, JSON.stringify({ ...template, ...overrides }), 'utf8')
  }
  return file
}

/**
 * Removes every temp template dir created by `writeStationTemplate`/`copyStationTemplate`.
 * Call in `afterEach`, alongside `standardCleanup()`.
 */
export const cleanupStationTemplates = (): void => {
  for (const root of templateRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true })
  }
}

// ---------------------------------------------------------------
// Real station construction
// ---------------------------------------------------------------

/**
 * Constructs a real ChargingStation from a template file with test defaults
 * (`autoStart` off, local supervision URL); caller options take precedence.
 * @param templateFile - Path returned by `writeStationTemplate`/`copyStationTemplate`.
 * @param options - Charging station options merged over the defaults.
 * @param index - Station index.
 * @returns The constructed ChargingStation.
 */
export const createStationFromTemplate = (
  templateFile: string,
  options: ChargingStationOptions = {},
  index = 1
): ChargingStation =>
  new ChargingStation(index, templateFile, {
    autoStart: false,
    supervisionUrls: TEST_SUPERVISION_URL,
    ...options,
  })

// ---------------------------------------------------------------
// Persisted configuration resolution
// ---------------------------------------------------------------

/**
 * Resolves the isolated `configurations` dir sitting beside the
 * `station-templates` dir of a template file — where a persisted
 * ChargingStation writes its configuration.
 * @param templateFile - Path returned by `writeStationTemplate`/`copyStationTemplate`.
 * @returns Absolute path to the sibling `configurations` dir.
 */
export const persistedConfigurationDir = (templateFile: string): string =>
  join(dirname(dirname(templateFile)), 'configurations')

/**
 * Resolves the single persisted configuration file written by a station built
 * from `templateFile`. Throws when none exists yet (flush the async write first).
 * @param templateFile - Path returned by `writeStationTemplate`/`copyStationTemplate`.
 * @returns Absolute path to the persisted configuration `.json` file.
 */
export const resolvePersistedConfigurationFile = (templateFile: string): string => {
  const configurationDir = persistedConfigurationDir(templateFile)
  const configurationFile = readdirSync(configurationDir).find(entry => entry.endsWith('.json'))
  if (configurationFile == null) {
    throw new Error(`No persisted configuration file found in ${configurationDir}`)
  }
  return join(configurationDir, configurationFile)
}
