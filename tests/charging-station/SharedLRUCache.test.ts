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

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type {
  ChargingStationConfiguration,
  ChargingStationTemplate,
} from '../../src/types/index.js'

import { Bootstrap } from '../../src/charging-station/Bootstrap.js'
import { SharedLRUCache } from '../../src/charging-station/SharedLRUCache.js'
import { OCPP16StandardParametersKey } from '../../src/types/index.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

interface BootstrapStatic {
  instance: Bootstrap | null
}

/**
 * Creates a cacheable ChargingStationConfiguration fixture with the given hash.
 * @param hash - The configurationHash to assign
 * @returns A ChargingStationConfiguration fixture
 */
function createCacheableConfiguration (hash: string): ChargingStationConfiguration {
  return {
    automaticTransactionGenerator: { enable: false, maxDuration: 120, minDuration: 60 },
    configurationHash: hash,
    configurationKey: [
      { key: OCPP16StandardParametersKey.HeartbeatInterval, readonly: false, value: '60' },
    ],
    stationInfo: { chargingStationId: 'test-station' },
  } as unknown as ChargingStationConfiguration
}

/**
 * Creates a ChargingStationTemplate fixture with the given hash.
 * @param hash - The templateHash to assign
 * @returns A ChargingStationTemplate fixture
 */
function createTemplate (hash: string): ChargingStationTemplate {
  return {
    baseName: 'test-template',
    chargePointModel: 'test-model',
    chargePointVendor: 'test-vendor',
    templateHash: hash,
  } as ChargingStationTemplate
}

/**
 * Injects a mock Bootstrap singleton so SharedLRUCache reads numeric getters
 * instead of triggering real Bootstrap construction.
 */
function installMockBootstrap (): void {
  ;(Bootstrap as unknown as BootstrapStatic).instance = {
    numberOfChargingStationTemplates: 10,
    numberOfConfiguredChargingStations: 20,
    numberOfProvisionedChargingStations: 5,
  } as unknown as Bootstrap
}

/**
 * Resets the SharedLRUCache singleton so subsequent getInstance() creates a fresh cache.
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

      assert.strictEqual(instance1, instance2)
    })

    await it('should create new instance after reset', () => {
      const instance1 = SharedLRUCache.getInstance()
      resetSharedLRUCache()
      const instance2 = SharedLRUCache.getInstance()

      assert.notStrictEqual(instance1, instance2)
    })
  })

  await describe('template operations', async () => {
    await it('should store and retrieve a charging station template', () => {
      const cache = SharedLRUCache.getInstance()
      const template = createTemplate('template-hash-1')

      cache.setChargingStationTemplate(template)
      const retrieved = cache.getChargingStationTemplate('template-hash-1')

      assert.deepStrictEqual(retrieved, template)
    })

    await it('should return undefined for non-existent template', () => {
      const cache = SharedLRUCache.getInstance()

      const result = cache.getChargingStationTemplate('unknown-hash')

      assert.strictEqual(result, undefined)
    })

    await it('should report has correctly for templates', () => {
      const cache = SharedLRUCache.getInstance()
      const template = createTemplate('template-hash-2')

      cache.setChargingStationTemplate(template)

      assert.strictEqual(cache.hasChargingStationTemplate('template-hash-2'), true)
      assert.strictEqual(cache.hasChargingStationTemplate('unknown-hash'), false)
    })

    await it('should delete a charging station template', () => {
      const cache = SharedLRUCache.getInstance()
      const template = createTemplate('template-hash-3')

      cache.setChargingStationTemplate(template)
      cache.deleteChargingStationTemplate('template-hash-3')

      assert.strictEqual(cache.hasChargingStationTemplate('template-hash-3'), false)
    })
  })

  await describe('configuration operations', async () => {
    await it('should store and retrieve a cacheable configuration', () => {
      const cache = SharedLRUCache.getInstance()
      const config = createCacheableConfiguration('config-hash-1')

      cache.setChargingStationConfiguration(config)
      const retrieved = cache.getChargingStationConfiguration('config-hash-1')

      assert.deepStrictEqual(retrieved, config)
    })

    await it('should not cache configuration with empty configurationKey', () => {
      const cache = SharedLRUCache.getInstance()
      const config = createCacheableConfiguration('config-hash-empty-key')
      ;(config as unknown as { configurationKey: never[] }).configurationKey = []

      cache.setChargingStationConfiguration(config)

      assert.strictEqual(cache.hasChargingStationConfiguration('config-hash-empty-key'), false)
    })

    await it('should not cache configuration with null stationInfo', () => {
      const cache = SharedLRUCache.getInstance()
      const config = createCacheableConfiguration('config-hash-no-info')
      ;(config as unknown as { stationInfo: undefined }).stationInfo = undefined

      cache.setChargingStationConfiguration(config)

      assert.strictEqual(cache.hasChargingStationConfiguration('config-hash-no-info'), false)
    })

    await it('should not cache configuration with empty configurationHash', () => {
      const cache = SharedLRUCache.getInstance()
      const config = createCacheableConfiguration('')

      cache.setChargingStationConfiguration(config)

      assert.strictEqual(cache.hasChargingStationConfiguration(''), false)
    })

    await it('should delete a charging station configuration', () => {
      const cache = SharedLRUCache.getInstance()
      const config = createCacheableConfiguration('config-hash-del')

      cache.setChargingStationConfiguration(config)
      cache.deleteChargingStationConfiguration('config-hash-del')

      assert.strictEqual(cache.hasChargingStationConfiguration('config-hash-del'), false)
    })
  })

  await describe('clear', async () => {
    await it('should clear all cached entries', () => {
      const cache = SharedLRUCache.getInstance()
      const template = createTemplate('template-clear')
      const config = createCacheableConfiguration('config-clear')

      cache.setChargingStationTemplate(template)
      cache.setChargingStationConfiguration(config)
      cache.clear()

      assert.strictEqual(cache.hasChargingStationTemplate('template-clear'), false)
      assert.strictEqual(cache.hasChargingStationConfiguration('config-clear'), false)
    })
  })
})
