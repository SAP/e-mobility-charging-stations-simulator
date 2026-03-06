/**
 * @file Tests for Configuration static class
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
import { expect } from '@std/expect'
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
import { WorkerProcessType } from '../../src/worker/WorkerTypes.js'
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
    expect(data).toBeDefined()
    expect(Array.isArray(data?.stationTemplateUrls)).toBe(true)
  })

  await it('should return the same data on subsequent calls', () => {
    const first = Configuration.getConfigurationData()
    const second = Configuration.getConfigurationData()
    expect(first).toBe(second)
  })

  await it('should return log configuration with defaults', () => {
    const log = Configuration.getConfigurationSection<LogConfiguration>(ConfigurationSection.log)
    expect(log).toBeDefined()
    expect(typeof log.enabled).toBe('boolean')
    expect(typeof log.file).toBe('string')
    expect(typeof log.level).toBe('string')
    expect(typeof log.format).toBe('string')
  })

  await it('should include default log values', () => {
    const log = Configuration.getConfigurationSection<LogConfiguration>(ConfigurationSection.log)
    expect(log.level).toBe('info')
    expect(log.format).toBe('simple')
    expect(log.rotate).toBe(true)
    expect(log.enabled).toBe(true)
  })

  await it('should return worker configuration with defaults', () => {
    const worker = Configuration.getConfigurationSection<WorkerConfiguration>(
      ConfigurationSection.worker
    )
    expect(worker).toBeDefined()
    expect(worker.processType).toBe(WorkerProcessType.workerSet)
    expect(worker.startDelay).toBe(500)
    expect(typeof worker.poolMinSize).toBe('number')
    expect(typeof worker.poolMaxSize).toBe('number')
    expect(worker.elementsPerWorker).toBe('auto')
  })

  await it('should include default worker process type', () => {
    const worker = Configuration.getConfigurationSection<WorkerConfiguration>(
      ConfigurationSection.worker
    )
    expect(worker.processType).toBe(WorkerProcessType.workerSet)
  })

  await it('should return UI server configuration with defaults', () => {
    const uiServer = Configuration.getConfigurationSection<UIServerConfiguration>(
      ConfigurationSection.uiServer
    )
    expect(uiServer).toBeDefined()
    expect(uiServer.enabled).toBe(false)
    expect(uiServer.type).toBe(ApplicationProtocol.WS)
    expect(uiServer.version).toBe(ApplicationProtocolVersion.VERSION_11)
    expect(uiServer.options).toBeDefined()
    expect(typeof uiServer.options?.host).toBe('string')
    expect(typeof uiServer.options?.port).toBe('number')
  })

  await it('should return performance storage configuration', () => {
    const storage = Configuration.getConfigurationSection<StorageConfiguration>(
      ConfigurationSection.performanceStorage
    )
    expect(storage).toBeDefined()
    expect(storage.enabled).toBe(true)
    expect(storage.type).toBe(StorageType.NONE)
  })

  await it('should return station template URLs', () => {
    const urls = Configuration.getStationTemplateUrls()
    expect(urls).toBeDefined()
    expect(Array.isArray(urls)).toBe(true)
  })

  await it('should return supervision URL distribution', () => {
    const distribution = Configuration.getSupervisionUrlDistribution()
    expect(distribution).toBeDefined()
    expect(
      distribution != null && Object.values(SupervisionUrlDistribution).includes(distribution)
    ).toBe(true)
  })

  await it('should default to ROUND_ROBIN when not configured', () => {
    const internals = getConfigurationInternals()
    const originalData = internals.configurationData
    internals.configurationData = {
      stationTemplateUrls: [],
    } as ConfigurationData

    try {
      const distribution = Configuration.getSupervisionUrlDistribution()
      expect(distribution).toBe(SupervisionUrlDistribution.ROUND_ROBIN)
    } finally {
      internals.configurationData = originalData
      resetSectionCache()
    }
  })

  await it('should return false for workerPoolInUse with default workerSet config', () => {
    expect(Configuration.workerPoolInUse()).toBe(false)
  })

  await it('should return false for workerDynamicPoolInUse with default workerSet config', () => {
    expect(Configuration.workerDynamicPoolInUse()).toBe(false)
  })

  await it('should return supervision URLs from configuration', () => {
    const urls = Configuration.getSupervisionUrls()
    expect(urls == null || typeof urls === 'string' || Array.isArray(urls)).toBe(true)
  })

  await it('should throw for unknown configuration section', () => {
    expect(() => {
      Configuration.getConfigurationSection('unknown' as ConfigurationSection)
    }).toThrow(Error)
  })
})
