/**
 * @file Tests for Configuration hot-reload rollback semantics
 * @description Validates snapshot rollback, callback gating, lock release, and event coalescing
 */
import assert from 'node:assert/strict'
import { type FSWatcher, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'

import type { ConfigurationData } from '../../src/types/index.js'

import { BaseError } from '../../src/exception/index.js'
import { ConfigurationSection } from '../../src/types/index.js'
import { ConfigurationValidationError } from '../../src/utils/index.js'
import { Configuration, logger } from '../../src/utils/index.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'
import {
  buildInvalidJsonString,
  buildMinimalConfiguration,
} from './helpers/ConfigurationFixtures.js'

interface ConfigurationInternals {
  configurationChangeCallback?: () => Promise<void>
  configurationData: ConfigurationData | undefined
  configurationFile: string | undefined
  configurationFileReloading: boolean
  configurationFileReloadPending: boolean
  configurationFileWatcher?: FSWatcher
  configurationSectionCache: Map<ConfigurationSection, unknown>
  performReload: () => Promise<void>
  runReloadLoop: () => Promise<void>
}

const getInternals = (): ConfigurationInternals =>
  Configuration as unknown as ConfigurationInternals

const createTempConfigDir = (): string => mkdtempSync(join(tmpdir(), 'cfg-hot-reload-'))

const writeConfigFile = (dir: string, contents: unknown): string => {
  const file = join(dir, 'config.json')
  writeFileSync(file, typeof contents === 'string' ? contents : JSON.stringify(contents))
  return file
}

await describe('Configuration hot-reload', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await it('should replace caches and invoke callback on a valid reload', async t => {
    t.mock.method(logger, 'error')
    const internals = getInternals()
    const tempDir = createTempConfigDir()
    const originalFile = internals.configurationFile
    const originalData = internals.configurationData
    const originalCallback = internals.configurationChangeCallback
    const originalCache = new Map(internals.configurationSectionCache)
    const originalReloading = internals.configurationFileReloading

    try {
      const file = writeConfigFile(tempDir, buildMinimalConfiguration())
      internals.configurationFile = file
      internals.configurationData = {
        stationTemplateUrls: [{ file: 'previous.json', numberOfStations: 1 }],
      } as unknown as ConfigurationData
      internals.configurationSectionCache = new Map<ConfigurationSection, unknown>([
        [ConfigurationSection.log, { sentinel: 'previous-log' }],
      ])
      internals.configurationFileReloading = true

      let callbackInvocations = 0
      internals.configurationChangeCallback = async () => {
        callbackInvocations += 1
        return Promise.resolve()
      }

      await internals.runReloadLoop()

      assert.strictEqual(callbackInvocations, 1)
      assert.strictEqual(internals.configurationFileReloading, false)
      assert.notStrictEqual(internals.configurationData, undefined)
      assert.deepStrictEqual(internals.configurationData.stationTemplateUrls, [
        { file: 'minimal.station-template.json', numberOfStations: 1 },
      ])
      assert.strictEqual(internals.configurationSectionCache.has(ConfigurationSection.log), false)
    } finally {
      internals.configurationFile = originalFile
      internals.configurationData = originalData
      internals.configurationSectionCache = originalCache
      internals.configurationFileReloading = originalReloading
      internals.configurationChangeCallback = originalCallback
      rmSync(tempDir, { force: true, recursive: true })
    }
  })

  await it('should restore caches and skip callback when reload validation fails', async t => {
    const errorMock = t.mock.method(logger, 'error')
    const internals = getInternals()
    const tempDir = createTempConfigDir()
    const originalFile = internals.configurationFile
    const originalData = internals.configurationData
    const originalCallback = internals.configurationChangeCallback
    const originalCache = new Map(internals.configurationSectionCache)
    const originalReloading = internals.configurationFileReloading

    try {
      const file = writeConfigFile(tempDir, { $schemaVersion: 1, bogusKey: true })
      internals.configurationFile = file
      const previousData = {
        stationTemplateUrls: [{ file: 'previous.json', numberOfStations: 1 }],
      } as unknown as ConfigurationData
      internals.configurationData = previousData
      const sentinelSection = { sentinel: 'previous-log' }
      internals.configurationSectionCache = new Map<ConfigurationSection, unknown>([
        [ConfigurationSection.log, sentinelSection],
      ])
      internals.configurationFileReloading = true

      let callbackInvocations = 0
      internals.configurationChangeCallback = async () => {
        callbackInvocations += 1
        return Promise.resolve()
      }

      await internals.runReloadLoop()

      assert.strictEqual(callbackInvocations, 0)
      assert.strictEqual(internals.configurationFileReloading, false)
      assert.deepStrictEqual(
        internals.configurationData.stationTemplateUrls,
        previousData.stationTemplateUrls
      )
      assert.strictEqual(
        internals.configurationSectionCache.get(ConfigurationSection.log),
        sentinelSection
      )
      assert.ok(errorMock.mock.calls.length >= 1)
      const errorCall = errorMock.mock.calls[errorMock.mock.calls.length - 1]
      const errorArg = errorCall.arguments.find(arg => arg instanceof Error)
      assert.ok(errorArg instanceof BaseError, 'Expected logger.error to receive a BaseError')
      assert.ok(
        errorArg instanceof ConfigurationValidationError,
        'Expected schema-phase failure to surface ConfigurationValidationError'
      )
    } finally {
      internals.configurationFile = originalFile
      internals.configurationData = originalData
      internals.configurationSectionCache = originalCache
      internals.configurationFileReloading = originalReloading
      internals.configurationChangeCallback = originalCallback
      rmSync(tempDir, { force: true, recursive: true })
    }
  })

  await it('should restore configurationData on JSON parse error', async t => {
    t.mock.method(logger, 'error')
    const internals = getInternals()
    const tempDir = createTempConfigDir()
    const originalFile = internals.configurationFile
    const originalData = internals.configurationData
    const originalCallback = internals.configurationChangeCallback
    const originalCache = new Map(internals.configurationSectionCache)
    const originalReloading = internals.configurationFileReloading

    try {
      const previousData = {
        $schemaVersion: 1,
        stationTemplateUrls: [{ file: 'previous.json', numberOfStations: 1 }],
      } as unknown as ConfigurationData
      const sentinelSection = { sentinel: 'previous-log' }
      internals.configurationData = previousData
      internals.configurationSectionCache = new Map<ConfigurationSection, unknown>([
        [ConfigurationSection.log, sentinelSection],
      ])
      internals.configurationChangeCallback = undefined

      const file = join(tempDir, 'malformed.json')
      writeFileSync(file, buildInvalidJsonString())
      internals.configurationFile = file
      internals.configurationFileReloading = true

      await internals.runReloadLoop()

      assert.deepStrictEqual(internals.configurationData, previousData)
      assert.strictEqual(
        internals.configurationSectionCache.get(ConfigurationSection.log),
        sentinelSection
      )
      assert.strictEqual(internals.configurationSectionCache.size, 1)
      assert.strictEqual(internals.configurationFileReloading, false)
    } finally {
      internals.configurationFile = originalFile
      internals.configurationData = originalData
      internals.configurationSectionCache = originalCache
      internals.configurationFileReloading = originalReloading
      internals.configurationChangeCallback = originalCallback
      rmSync(tempDir, { force: true, recursive: true })
    }
  })

  await it('should keep the file watcher active after a failed reload', async t => {
    t.mock.method(logger, 'error')
    const internals = getInternals()
    const tempDir = createTempConfigDir()
    const originalFile = internals.configurationFile
    const originalData = internals.configurationData
    const originalCallback = internals.configurationChangeCallback
    const originalCache = new Map(internals.configurationSectionCache)
    const originalReloading = internals.configurationFileReloading
    const originalWatcher = internals.configurationFileWatcher

    try {
      const file = writeConfigFile(tempDir, buildMinimalConfiguration())
      internals.configurationFile = file
      internals.configurationData = buildMinimalConfiguration() as unknown as ConfigurationData
      internals.configurationSectionCache = new Map()
      internals.configurationChangeCallback = undefined
      // Sentinel watcher must survive across the failing reload.
      const sentinelWatcher = { close: (): void => undefined } as unknown as FSWatcher
      internals.configurationFileWatcher = sentinelWatcher

      writeFileSync(file, buildInvalidJsonString())
      internals.configurationFileReloading = true
      await internals.runReloadLoop()

      assert.strictEqual(
        internals.configurationFileWatcher,
        sentinelWatcher,
        'Watcher must survive a failed reload'
      )
    } finally {
      internals.configurationFile = originalFile
      internals.configurationData = originalData
      internals.configurationSectionCache = originalCache
      internals.configurationFileReloading = originalReloading
      internals.configurationChangeCallback = originalCallback
      internals.configurationFileWatcher = originalWatcher
      rmSync(tempDir, { force: true, recursive: true })
    }
  })

  await it('should drain pending reloads and reflect the latest content under rapid double-save', async t => {
    t.mock.method(logger, 'error')
    const internals = getInternals()
    const tempDir = createTempConfigDir()
    const originalFile = internals.configurationFile
    const originalData = internals.configurationData
    const originalCallback = internals.configurationChangeCallback
    const originalCache = new Map(internals.configurationSectionCache)
    const originalReloading = internals.configurationFileReloading
    const originalPending = internals.configurationFileReloadPending

    try {
      const file = writeConfigFile(tempDir, buildMinimalConfiguration({ persistState: false }))
      internals.configurationFile = file
      internals.configurationData = undefined
      internals.configurationSectionCache = new Map()

      let callbackInvocations = 0
      internals.configurationChangeCallback = async () => {
        callbackInvocations += 1
        // After the FIRST reload sees `persistState: false`, simulate a
        // second file save that arrives during the in-flight callback.
        if (callbackInvocations === 1) {
          writeFileSync(file, JSON.stringify(buildMinimalConfiguration({ persistState: true })))
          internals.configurationFileReloadPending = true
        }
        return Promise.resolve()
      }

      internals.configurationFileReloading = true
      await internals.runReloadLoop()

      // Read through a function to defeat TS's narrowing of `configurationData`
      // to `undefined` (set explicitly above before the reload).
      const readConfigurationData = (): ConfigurationData | undefined => internals.configurationData
      const reloadedData = readConfigurationData()
      assert.strictEqual(callbackInvocations, 2, 'Pending event must trigger one drain reload')
      assert.strictEqual(
        reloadedData?.persistState,
        true,
        'Latest write must be reflected in configurationData'
      )
      assert.strictEqual(internals.configurationFileReloading, false)
      assert.strictEqual(internals.configurationFileReloadPending, false)
    } finally {
      internals.configurationFile = originalFile
      internals.configurationData = originalData
      internals.configurationSectionCache = originalCache
      internals.configurationFileReloading = originalReloading
      internals.configurationFileReloadPending = originalPending
      internals.configurationChangeCallback = originalCallback
      rmSync(tempDir, { force: true, recursive: true })
    }
  })

  await it('should reset configurationFileReloading to false on both success and failure paths', async t => {
    t.mock.method(logger, 'error')
    const internals = getInternals()
    const tempDir = createTempConfigDir()
    const originalFile = internals.configurationFile
    const originalData = internals.configurationData
    const originalCallback = internals.configurationChangeCallback
    const originalCache = new Map(internals.configurationSectionCache)
    const originalReloading = internals.configurationFileReloading

    try {
      const validFile = writeConfigFile(tempDir, buildMinimalConfiguration())
      internals.configurationChangeCallback = undefined
      internals.configurationData = undefined
      internals.configurationSectionCache = new Map()

      internals.configurationFile = validFile
      internals.configurationFileReloading = true
      await internals.runReloadLoop()
      assert.strictEqual(internals.configurationFileReloading, false, 'flag must reset on success')

      const invalidFile = join(tempDir, 'invalid.json')
      writeFileSync(invalidFile, buildInvalidJsonString())
      internals.configurationFile = invalidFile
      internals.configurationFileReloading = true
      await internals.runReloadLoop()
      assert.strictEqual(internals.configurationFileReloading, false, 'flag must reset on failure')
    } finally {
      internals.configurationFile = originalFile
      internals.configurationData = originalData
      internals.configurationSectionCache = originalCache
      internals.configurationFileReloading = originalReloading
      internals.configurationChangeCallback = originalCallback
      rmSync(tempDir, { force: true, recursive: true })
    }
  })
})
