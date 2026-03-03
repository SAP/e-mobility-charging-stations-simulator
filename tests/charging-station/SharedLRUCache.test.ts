/**
 * @file Tests for SharedLRUCache singleton
 * @description Verifies the LRU cache for charging station templates and configurations
 *
 * Covers:
 * - Singleton pattern (getInstance)
 * - Template CRUD (set/get/has/delete)
 * - Configuration CRUD (set/get/has/delete with cacheability validation)
 * - Cache clear
 */

import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type {
  ChargingStationConfiguration,
  ChargingStationTemplate,
} from '../../src/types/index.js'

import { Bootstrap } from '../../src/charging-station/Bootstrap.js'
import { SharedLRUCache } from '../../src/charging-station/SharedLRUCache.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

interface BootstrapStatic {
  instance: Bootstrap | null
}

/**
 *
 * @param hash
 */
function createCacheableConfiguration (hash: string): ChargingStationConfiguration {
  return {
    automaticTransactionGenerator: { enable: false, maxDuration: 120, minDuration: 60 },
    configurationHash: hash,
    configurationKey: [{ key: 'HeartbeatInterval', readonly: false, value: '60' }],
    stationInfo: { chargingStationId: 'test-station' },
  } as unknown as ChargingStationConfiguration
}

/**
 *
 * @param hash
 */
function createTemplate (hash: string): ChargingStationTemplate {
  return {
    baseName: 'test-template',
    chargePointModel: 'test-model',
    chargePointVendor: 'test-vendor',
    templateHash: hash,
  } as ChargingStationTemplate
}

// Inject a mock Bootstrap singleton so that SharedLRUCache constructor reads numeric getters
// instead of triggering a real Bootstrap construction.
/**
 *
 */
function installMockBootstrap (): void {
  ;(Bootstrap as unknown as BootstrapStatic).instance = {
    numberOfChargingStationTemplates: 10,
    numberOfConfiguredChargingStations: 20,
    numberOfProvisionedChargingStations: 5,
  } as unknown as Bootstrap
}

/**
 *
 */
function resetSharedLRUCache (): void {
  ;(SharedLRUCache as unknown as { instance: null }).instance = null
}

await describe('SharedLRUCache', async () => {
  beforeEach(() => {
    installMockBootstrap()
  })

  afterEach(() => {
    standardCleanup()
    resetSharedLRUCache()
    ;(Bootstrap as unknown as BootstrapStatic).instance = null
  })

  await describe('getInstance', async () => {
    await it('should return the same instance on multiple calls', () => {
      const instance1 = SharedLRUCache.getInstance()
      const instance2 = SharedLRUCache.getInstance()

      expect(instance1).toBe(instance2)
    })

    await it('should create new instance after reset', () => {
      const instance1 = SharedLRUCache.getInstance()
      resetSharedLRUCache()
      const instance2 = SharedLRUCache.getInstance()

      expect(instance1).not.toBe(instance2)
    })
  })

  await describe('template operations', async () => {
    await it('should store and retrieve a charging station template', () => {
      const cache = SharedLRUCache.getInstance()
      const template = createTemplate('tmpl-hash-1')

      cache.setChargingStationTemplate(template)
      const retrieved = cache.getChargingStationTemplate('tmpl-hash-1')

      expect(retrieved).toStrictEqual(template)
    })

    await it('should return undefined for non-existent template', () => {
      const cache = SharedLRUCache.getInstance()

      const result = cache.getChargingStationTemplate('unknown-hash')

      expect(result).toBeUndefined()
    })

    await it('should report has correctly for templates', () => {
      const cache = SharedLRUCache.getInstance()
      const template = createTemplate('tmpl-hash-2')

      cache.setChargingStationTemplate(template)

      expect(cache.hasChargingStationTemplate('tmpl-hash-2')).toBe(true)
      expect(cache.hasChargingStationTemplate('unknown-hash')).toBe(false)
    })

    await it('should delete a charging station template', () => {
      const cache = SharedLRUCache.getInstance()
      const template = createTemplate('tmpl-hash-3')

      cache.setChargingStationTemplate(template)
      cache.deleteChargingStationTemplate('tmpl-hash-3')

      expect(cache.hasChargingStationTemplate('tmpl-hash-3')).toBe(false)
    })
  })

  await describe('configuration operations', async () => {
    await it('should store and retrieve a cacheable configuration', () => {
      const cache = SharedLRUCache.getInstance()
      const config = createCacheableConfiguration('config-hash-1')

      cache.setChargingStationConfiguration(config)
      const retrieved = cache.getChargingStationConfiguration('config-hash-1')

      expect(retrieved).toStrictEqual(config)
    })

    await it('should not cache configuration with empty configurationKey', () => {
      const cache = SharedLRUCache.getInstance()
      const config = createCacheableConfiguration('config-hash-empty-key')
      ;(config as unknown as { configurationKey: never[] }).configurationKey = []

      cache.setChargingStationConfiguration(config)

      expect(cache.hasChargingStationConfiguration('config-hash-empty-key')).toBe(false)
    })

    await it('should not cache configuration with null stationInfo', () => {
      const cache = SharedLRUCache.getInstance()
      const config = createCacheableConfiguration('config-hash-no-info')
      ;(config as unknown as { stationInfo: undefined }).stationInfo = undefined

      cache.setChargingStationConfiguration(config)

      expect(cache.hasChargingStationConfiguration('config-hash-no-info')).toBe(false)
    })

    await it('should not cache configuration with empty configurationHash', () => {
      const cache = SharedLRUCache.getInstance()
      const config = createCacheableConfiguration('')

      cache.setChargingStationConfiguration(config)

      expect(cache.hasChargingStationConfiguration('')).toBe(false)
    })

    await it('should delete a charging station configuration', () => {
      const cache = SharedLRUCache.getInstance()
      const config = createCacheableConfiguration('config-hash-del')

      cache.setChargingStationConfiguration(config)
      cache.deleteChargingStationConfiguration('config-hash-del')

      expect(cache.hasChargingStationConfiguration('config-hash-del')).toBe(false)
    })
  })

  await describe('clear', async () => {
    await it('should clear all cached entries', () => {
      const cache = SharedLRUCache.getInstance()
      const template = createTemplate('tmpl-clear')
      const config = createCacheableConfiguration('config-clear')

      cache.setChargingStationTemplate(template)
      cache.setChargingStationConfiguration(config)
      cache.clear()

      expect(cache.hasChargingStationTemplate('tmpl-clear')).toBe(false)
      expect(cache.hasChargingStationConfiguration('config-clear')).toBe(false)
    })
  })
})
