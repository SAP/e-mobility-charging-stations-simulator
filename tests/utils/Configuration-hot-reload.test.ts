/**
 * @file Tests for Configuration hot-reload rollback semantics
 * @description Verifies that the private reloadConfiguration() method
 * - captures a pre-clear snapshot of configurationData and configurationSectionCache,
 * - on success: replaces caches and invokes the change callback,
 * - on validation/parse failure: restores caches, logs an error, does NOT invoke the callback,
 * - clears the configurationFileReloading flag in `finally` on both paths.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'

import type { ConfigurationData } from '../../src/types/index.js'

import { ConfigurationSection } from '../../src/types/index.js'
import { Configuration, logger } from '../../src/utils/index.js'
import { buildMinimalConfiguration } from '../charging-station/helpers/ConfigurationFixtures.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

interface ConfigurationInternals {
  configurationChangeCallback?: () => Promise<void>
  configurationData: ConfigurationData | undefined
  configurationFile: string | undefined
  configurationFileReloading: boolean
  configurationSectionCache: Map<ConfigurationSection, unknown>
  reloadConfiguration: () => void
}

const getInternals = (): ConfigurationInternals =>
  Configuration as unknown as ConfigurationInternals

const createTempConfigDir = (): string => mkdtempSync(join(tmpdir(), 'cfg-hot-reload-'))

const writeConfigFile = (dir: string, contents: unknown): string => {
  const file = join(dir, 'config.json')
  writeFileSync(file, typeof contents === 'string' ? contents : JSON.stringify(contents))
  return file
}

const flushMicrotasks = (): Promise<void> =>
  new Promise<void>(resolve => {
    setImmediate(resolve)
  })

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

      internals.reloadConfiguration()
      await flushMicrotasks()

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

      internals.reloadConfiguration()
      await flushMicrotasks()

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
    } finally {
      internals.configurationFile = originalFile
      internals.configurationData = originalData
      internals.configurationSectionCache = originalCache
      internals.configurationFileReloading = originalReloading
      internals.configurationChangeCallback = originalCallback
      rmSync(tempDir, { force: true, recursive: true })
    }
  })

  await it('should reset configurationFileReloading to false on both success and failure paths', t => {
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
      internals.reloadConfiguration()
      assert.strictEqual(internals.configurationFileReloading, false, 'flag must reset on success')

      const invalidFile = join(tempDir, 'invalid.json')
      writeFileSync(invalidFile, '{ this is not valid json')
      internals.configurationFile = invalidFile
      internals.configurationFileReloading = true
      internals.reloadConfiguration()
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
