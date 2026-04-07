/**
 * @file Tests for Configuration
 * @description Verifies configuration loading, section building, and deprecated key handling
 *
 * Covers:
 * - getConfigurationData — returns parsed configuration
 * - getConfigurationSection — returns cached section with defaults
 * - getStationTemplateUrls — returns template URLs
 * - getSupervisionUrls — returns supervision URLs
 * - getSupervisionUrlDistribution — returns distribution strategy
 * - workerPoolInUse / workerDynamicPoolInUse — pool type checks
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import type {
  ConfigurationData,
  LogConfiguration,
  StorageConfiguration,
  UIServerConfiguration,
  WorkerConfiguration,
} from '../../src/types/index.js'

import {
  ApplicationProtocol,
  ApplicationProtocolVersion,
  ConfigurationSection,
  StorageType,
  SupervisionUrlDistribution,
} from '../../src/types/index.js'
import { Configuration } from '../../src/utils/index.js'
import { WorkerProcessType } from '../../src/worker/index.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

/**
 * Get a reference to the private configurationData for injection.
 * @returns The internal configurationData holder
 */
function getConfigurationInternals (): {
  configurationData: ConfigurationData | undefined
} {
  return Configuration as unknown as {
    configurationData: ConfigurationData | undefined
  }
}

/**
 * Reset the Configuration section cache to force rebuilding sections.
 * Useful when testing with injected configurationData.
 */
function resetSectionCache (): void {
  const configClass = Configuration as unknown as {
    configurationSectionCache: Map<string, unknown>
  }
  configClass.configurationSectionCache.clear()
}

await describe('Configuration', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await it('should return configuration data', () => {
    const data = Configuration.getConfigurationData()
    assert.notStrictEqual(data, undefined)
    assert.ok(Array.isArray(data?.stationTemplateUrls))
  })

  await it('should return the same data on subsequent calls', () => {
    const first = Configuration.getConfigurationData()
    const second = Configuration.getConfigurationData()
    assert.strictEqual(first, second)
  })

  await it('should return log configuration with defaults', () => {
    const log = Configuration.getConfigurationSection<LogConfiguration>(ConfigurationSection.log)
    assert.notStrictEqual(log, undefined)
    assert.strictEqual(typeof log.enabled, 'boolean')
    assert.strictEqual(typeof log.file, 'string')
    assert.strictEqual(typeof log.level, 'string')
    assert.strictEqual(typeof log.format, 'string')
  })

  await it('should include default log values', () => {
    const log = Configuration.getConfigurationSection<LogConfiguration>(ConfigurationSection.log)
    assert.strictEqual(log.level, 'info')
    assert.strictEqual(log.format, 'simple')
    assert.strictEqual(log.rotate, true)
    assert.strictEqual(log.enabled, true)
  })

  await it('should return worker configuration with defaults', () => {
    const worker = Configuration.getConfigurationSection<WorkerConfiguration>(
      ConfigurationSection.worker
    )
    assert.notStrictEqual(worker, undefined)
    assert.strictEqual(worker.processType, WorkerProcessType.workerSet)
    assert.strictEqual(worker.startDelay, 500)
    assert.strictEqual(typeof worker.poolMinSize, 'number')
    assert.strictEqual(typeof worker.poolMaxSize, 'number')
    assert.strictEqual(worker.elementsPerWorker, 'auto')
  })

  await it('should include default worker process type', () => {
    const worker = Configuration.getConfigurationSection<WorkerConfiguration>(
      ConfigurationSection.worker
    )
    assert.strictEqual(worker.processType, WorkerProcessType.workerSet)
  })

  await it('should return UI server configuration with defaults', () => {
    const uiServer = Configuration.getConfigurationSection<UIServerConfiguration>(
      ConfigurationSection.uiServer
    )
    assert.notStrictEqual(uiServer, undefined)
    assert.strictEqual(uiServer.enabled, false)
    assert.strictEqual(uiServer.type, ApplicationProtocol.WS)
    assert.strictEqual(uiServer.version, ApplicationProtocolVersion.VERSION_11)
    assert.notStrictEqual(uiServer.options, undefined)
    assert.strictEqual(typeof uiServer.options?.host, 'string')
    assert.strictEqual(typeof uiServer.options?.port, 'number')
  })

  await it('should return performance storage configuration', () => {
    const storage = Configuration.getConfigurationSection<StorageConfiguration>(
      ConfigurationSection.performanceStorage
    )
    assert.notStrictEqual(storage, undefined)
    assert.strictEqual(storage.enabled, true)
    assert.strictEqual(storage.type, StorageType.NONE)
  })

  await it('should return station template URLs', () => {
    const urls = Configuration.getStationTemplateUrls()
    assert.notStrictEqual(urls, undefined)
    assert.ok(Array.isArray(urls))
  })

  await it('should return supervision URL distribution', () => {
    const distribution = Configuration.getSupervisionUrlDistribution()
    assert.notStrictEqual(distribution, undefined)
    assert.strictEqual(
      distribution != null && Object.values(SupervisionUrlDistribution).includes(distribution),
      true
    )
  })

  await it('should default to ROUND_ROBIN when not configured', () => {
    const internals = getConfigurationInternals()
    const originalData = internals.configurationData
    internals.configurationData = {
      stationTemplateUrls: [],
    } as ConfigurationData

    try {
      const distribution = Configuration.getSupervisionUrlDistribution()
      assert.strictEqual(distribution, SupervisionUrlDistribution.ROUND_ROBIN)
    } finally {
      internals.configurationData = originalData
      resetSectionCache()
    }
  })

  await it('should return false for workerPoolInUse with default workerSet config', () => {
    assert.strictEqual(Configuration.workerPoolInUse(), false)
  })

  await it('should return false for workerDynamicPoolInUse with default workerSet config', () => {
    assert.strictEqual(Configuration.workerDynamicPoolInUse(), false)
  })

  await it('should return supervision URLs from configuration', () => {
    const urls = Configuration.getSupervisionUrls()
    assert.ok(urls == null || typeof urls === 'string' || Array.isArray(urls))
  })

  await it('should throw for unknown configuration section', () => {
    assert.throws(() => {
      Configuration.getConfigurationSection('unknown' as ConfigurationSection)
    }, Error)
  })
})
