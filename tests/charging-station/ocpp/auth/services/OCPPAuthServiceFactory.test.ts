/**
 * @file Tests for OCPPAuthServiceFactory
 * @description Unit tests for OCPP authentication service factory
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../../src/charging-station/ChargingStation.js'

import { OCPPAuthServiceFactory } from '../../../../../src/charging-station/ocpp/auth/services/OCPPAuthServiceFactory.js'
import { OCPPVersion } from '../../../../../src/types/index.js'
import { standardCleanup } from '../../../../helpers/TestLifecycleHelpers.js'
import { createMockAuthServiceTestStation } from '../helpers/MockFactories.js'

await describe('OCPPAuthServiceFactory', async () => {
  // Clear all cached instances after each test to ensure test isolation
  afterEach(() => {
    OCPPAuthServiceFactory.clearAllInstances()
    standardCleanup()
  })

  await describe('getInstance', async () => {
    let mockStation16: ChargingStation
    let mockStation20: ChargingStation

    beforeEach(() => {
      mockStation16 = createMockAuthServiceTestStation('getInstance-16')
      mockStation20 = createMockAuthServiceTestStation('getInstance-20', OCPPVersion.VERSION_20)
    })

    await it('should create a new instance for a charging station', async () => {
      const authService = await OCPPAuthServiceFactory.getInstance(mockStation16)

      assert.notStrictEqual(authService, undefined)
      assert.strictEqual(typeof authService.authorize, 'function')
      assert.strictEqual(typeof authService.getConfiguration, 'function')
    })

    await it('should return cached instance for same charging station', async () => {
      const authService1 = await OCPPAuthServiceFactory.getInstance(mockStation20)
      const authService2 = await OCPPAuthServiceFactory.getInstance(mockStation20)

      assert.strictEqual(authService1, authService2)
    })

    await it('should create different instances for different charging stations', async () => {
      const authService1 = await OCPPAuthServiceFactory.getInstance(mockStation16)
      const authService2 = await OCPPAuthServiceFactory.getInstance(mockStation20)

      assert.notStrictEqual(authService1, authService2)
    })

    await it('should throw error for charging station without stationInfo', async () => {
      const mockStation = {
        logPrefix: () => '[TEST-CS-UNKNOWN]',
        stationInfo: undefined,
      } as unknown as ChargingStation

      try {
        await OCPPAuthServiceFactory.getInstance(mockStation)
        assert.fail('Expected getInstance to throw for station without stationInfo')
      } catch (error) {
        assert.ok(error instanceof Error)
        assert.ok(error.message.includes('OCPP version not found in charging station'))
      }
    })
  })

  await describe('createInstance', async () => {
    let mockStation16: ChargingStation
    let mockStation20: ChargingStation

    beforeEach(() => {
      mockStation16 = createMockAuthServiceTestStation('createInstance-16')
      mockStation20 = createMockAuthServiceTestStation('createInstance-20', OCPPVersion.VERSION_20)
    })

    await it('should create a new uncached instance', async () => {
      const authService1 = await OCPPAuthServiceFactory.createInstance(mockStation16)
      const authService2 = await OCPPAuthServiceFactory.createInstance(mockStation16)

      assert.notStrictEqual(authService1, undefined)
      assert.notStrictEqual(authService2, undefined)
      assert.notStrictEqual(authService1, authService2)
    })

    await it('should not cache created instances', async () => {
      const initialCount = OCPPAuthServiceFactory.getCachedInstanceCount()
      await OCPPAuthServiceFactory.createInstance(mockStation20)
      const finalCount = OCPPAuthServiceFactory.getCachedInstanceCount()

      assert.strictEqual(finalCount, initialCount)
    })
  })

  await describe('clearInstance', async () => {
    let mockStation16: ChargingStation
    let mockStation20: ChargingStation

    beforeEach(() => {
      mockStation16 = createMockAuthServiceTestStation('clearInstance-16')
      mockStation20 = createMockAuthServiceTestStation('clearInstance-20', OCPPVersion.VERSION_20)
    })

    await it('should clear cached instance for a charging station', async () => {
      // Create and cache instance
      const authService1 = await OCPPAuthServiceFactory.getInstance(mockStation16)

      // Clear the cache
      OCPPAuthServiceFactory.clearInstance(mockStation16)

      // Get instance again - should be a new instance
      const authService2 = await OCPPAuthServiceFactory.getInstance(mockStation16)

      assert.notStrictEqual(authService1, authService2)
    })

    await it('should not throw when clearing non-existent instance', () => {
      assert.doesNotThrow(() => {
        OCPPAuthServiceFactory.clearInstance(mockStation20)
      })
    })
  })

  await describe('clearAllInstances', async () => {
    let mockStation16: ChargingStation
    let mockStation20: ChargingStation

    beforeEach(() => {
      mockStation16 = createMockAuthServiceTestStation('clearAll-16')
      mockStation20 = createMockAuthServiceTestStation('clearAll-20', OCPPVersion.VERSION_20)
    })

    await it('should clear all cached instances', async () => {
      // Create multiple instances
      await OCPPAuthServiceFactory.getInstance(mockStation16)
      await OCPPAuthServiceFactory.getInstance(mockStation20)

      // Clear all
      OCPPAuthServiceFactory.clearAllInstances()

      // Verify all cleared
      const count = OCPPAuthServiceFactory.getCachedInstanceCount()
      assert.strictEqual(count, 0)
    })
  })

  await describe('getCachedInstanceCount', async () => {
    let mockStation16: ChargingStation
    let mockStation20: ChargingStation

    beforeEach(() => {
      OCPPAuthServiceFactory.clearAllInstances()
      mockStation16 = createMockAuthServiceTestStation('count-16')
      mockStation20 = createMockAuthServiceTestStation('count-20', OCPPVersion.VERSION_20)
    })

    await it('should return the number of cached instances', async () => {
      assert.strictEqual(OCPPAuthServiceFactory.getCachedInstanceCount(), 0)

      await OCPPAuthServiceFactory.getInstance(mockStation16)
      assert.strictEqual(OCPPAuthServiceFactory.getCachedInstanceCount(), 1)

      await OCPPAuthServiceFactory.getInstance(mockStation20)
      assert.strictEqual(OCPPAuthServiceFactory.getCachedInstanceCount(), 2)

      // Getting same instance should not increase count
      await OCPPAuthServiceFactory.getInstance(mockStation16)
      assert.strictEqual(OCPPAuthServiceFactory.getCachedInstanceCount(), 2)
    })
  })

  await describe('getStatistics', async () => {
    let mockStation16: ChargingStation
    let mockStation20: ChargingStation

    beforeEach(() => {
      OCPPAuthServiceFactory.clearAllInstances()
      mockStation16 = createMockAuthServiceTestStation('stats-16')
      mockStation20 = createMockAuthServiceTestStation('stats-20', OCPPVersion.VERSION_20)
    })

    await it('should return factory statistics', async () => {
      await OCPPAuthServiceFactory.getInstance(mockStation16)
      await OCPPAuthServiceFactory.getInstance(mockStation20)

      const stats = OCPPAuthServiceFactory.getStatistics()

      assert.notStrictEqual(stats, undefined)
      assert.strictEqual(stats.cachedInstances, 2)
      assert.strictEqual(stats.stationIds.length, 2)
      assert.ok(stats.stationIds.includes('TEST-CS-stats-16'))
      assert.ok(stats.stationIds.includes('TEST-CS-stats-20'))
    })

    await it('should return empty statistics when no instances cached', () => {
      OCPPAuthServiceFactory.clearAllInstances()

      const stats = OCPPAuthServiceFactory.getStatistics()

      assert.strictEqual(stats.cachedInstances, 0)
      assert.strictEqual(stats.stationIds.length, 0)
    })
  })

  await describe('OCPP version handling', async () => {
    let mockStation16: ChargingStation
    let mockStation20: ChargingStation

    beforeEach(() => {
      mockStation16 = createMockAuthServiceTestStation('version-16')
      mockStation20 = createMockAuthServiceTestStation('version-20', OCPPVersion.VERSION_20)
    })

    await it('should create service for OCPP 1.6 station', async () => {
      const authService = await OCPPAuthServiceFactory.getInstance(mockStation16)

      assert.notStrictEqual(authService, undefined)
      assert.strictEqual(typeof authService.authorize, 'function')
      assert.strictEqual(typeof authService.getConfiguration, 'function')
    })

    await it('should create service for OCPP 2.0 station', async () => {
      const authService = await OCPPAuthServiceFactory.getInstance(mockStation20)

      assert.notStrictEqual(authService, undefined)
      assert.strictEqual(typeof authService.authorize, 'function')
      assert.strictEqual(typeof authService.testConnectivity, 'function')
    })
  })

  await describe('memory management', async () => {
    let mockStations: ChargingStation[]

    beforeEach(() => {
      OCPPAuthServiceFactory.clearAllInstances()
      mockStations = Array.from({ length: 5 }, (_, i) =>
        createMockAuthServiceTestStation(
          `memory-${String(i)}`,
          i % 2 === 0 ? OCPPVersion.VERSION_16 : OCPPVersion.VERSION_20
        )
      )
    })

    await it('should properly manage instance lifecycle', async () => {
      // Create instances
      for (const station of mockStations) {
        await OCPPAuthServiceFactory.getInstance(station)
      }

      assert.strictEqual(OCPPAuthServiceFactory.getCachedInstanceCount(), 5)

      // Clear one instance
      OCPPAuthServiceFactory.clearInstance(mockStations[0])
      assert.strictEqual(OCPPAuthServiceFactory.getCachedInstanceCount(), 4)

      // Clear all
      OCPPAuthServiceFactory.clearAllInstances()
      assert.strictEqual(OCPPAuthServiceFactory.getCachedInstanceCount(), 0)
    })
  })
})
