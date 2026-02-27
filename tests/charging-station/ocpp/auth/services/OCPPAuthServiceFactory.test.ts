/**
 * @file Tests for OCPPAuthServiceFactory
 * @description Unit tests for OCPP authentication service factory
 */
import { expect } from '@std/expect'
import { afterEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../../src/charging-station/ChargingStation.js'

import { OCPPAuthServiceFactory } from '../../../../../src/charging-station/ocpp/auth/services/OCPPAuthServiceFactory.js'
import { OCPPVersion } from '../../../../../src/types/ocpp/OCPPVersion.js'
import { createMockAuthServiceTestStation } from '../helpers/MockFactories.js'

await describe('OCPPAuthServiceFactory', async () => {
  // Clear all cached instances after each test to ensure test isolation
  afterEach(() => {
    OCPPAuthServiceFactory.clearAllInstances()
  })

  await describe('getInstance', async () => {
    await it('should create a new instance for a charging station', async () => {
      const mockStation = createMockAuthServiceTestStation('001')

      const authService = await OCPPAuthServiceFactory.getInstance(mockStation)

      expect(authService).toBeDefined()
      expect(typeof authService.authorize).toBe('function')
      expect(typeof authService.getConfiguration).toBe('function')
    })

    await it('should return cached instance for same charging station', async () => {
      const mockStation = createMockAuthServiceTestStation('002', OCPPVersion.VERSION_20)

      const authService1 = await OCPPAuthServiceFactory.getInstance(mockStation)
      const authService2 = await OCPPAuthServiceFactory.getInstance(mockStation)

      expect(authService1).toBe(authService2)
    })

    await it('should create different instances for different charging stations', async () => {
      const mockStation1 = createMockAuthServiceTestStation('003')
      const mockStation2 = createMockAuthServiceTestStation('004', OCPPVersion.VERSION_20)

      const authService1 = await OCPPAuthServiceFactory.getInstance(mockStation1)
      const authService2 = await OCPPAuthServiceFactory.getInstance(mockStation2)

      expect(authService1).not.toBe(authService2)
    })

    await it('should throw error for charging station without stationInfo', async () => {
      const mockStation = {
        logPrefix: () => '[TEST-CS-UNKNOWN]',
        stationInfo: undefined,
      } as unknown as ChargingStation

      try {
        await OCPPAuthServiceFactory.getInstance(mockStation)
        // If we get here, the test should fail
        expect(true).toBe(false) // Force failure
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toContain('OCPP version not found in charging station')
      }
    })
  })

  await describe('createInstance', async () => {
    await it('should create a new uncached instance', async () => {
      const mockStation = createMockAuthServiceTestStation('005')

      const authService1 = await OCPPAuthServiceFactory.createInstance(mockStation)
      const authService2 = await OCPPAuthServiceFactory.createInstance(mockStation)

      expect(authService1).toBeDefined()
      expect(authService2).toBeDefined()
      expect(authService1).not.toBe(authService2)
    })

    await it('should not cache created instances', async () => {
      const mockStation = createMockAuthServiceTestStation('006', OCPPVersion.VERSION_20)

      const initialCount = OCPPAuthServiceFactory.getCachedInstanceCount()
      await OCPPAuthServiceFactory.createInstance(mockStation)
      const finalCount = OCPPAuthServiceFactory.getCachedInstanceCount()

      expect(finalCount).toBe(initialCount)
    })
  })

  await describe('clearInstance', async () => {
    await it('should clear cached instance for a charging station', async () => {
      const mockStation = createMockAuthServiceTestStation('007')

      // Create and cache instance
      const authService1 = await OCPPAuthServiceFactory.getInstance(mockStation)

      // Clear the cache
      OCPPAuthServiceFactory.clearInstance(mockStation)

      // Get instance again - should be a new instance
      const authService2 = await OCPPAuthServiceFactory.getInstance(mockStation)

      expect(authService1).not.toBe(authService2)
    })

    await it('should not throw when clearing non-existent instance', () => {
      const mockStation = createMockAuthServiceTestStation('008', OCPPVersion.VERSION_20)

      expect(() => {
        OCPPAuthServiceFactory.clearInstance(mockStation)
      }).not.toThrow()
    })
  })

  await describe('clearAllInstances', async () => {
    await it('should clear all cached instances', async () => {
      const mockStation1 = createMockAuthServiceTestStation('009')
      const mockStation2 = createMockAuthServiceTestStation('010', OCPPVersion.VERSION_20)

      // Create multiple instances
      await OCPPAuthServiceFactory.getInstance(mockStation1)
      await OCPPAuthServiceFactory.getInstance(mockStation2)

      // Clear all
      OCPPAuthServiceFactory.clearAllInstances()

      // Verify all cleared
      const count = OCPPAuthServiceFactory.getCachedInstanceCount()
      expect(count).toBe(0)
    })
  })

  await describe('getCachedInstanceCount', async () => {
    await it('should return the number of cached instances', async () => {
      OCPPAuthServiceFactory.clearAllInstances()

      const mockStation1 = createMockAuthServiceTestStation('011')
      const mockStation2 = createMockAuthServiceTestStation('012', OCPPVersion.VERSION_20)

      expect(OCPPAuthServiceFactory.getCachedInstanceCount()).toBe(0)

      await OCPPAuthServiceFactory.getInstance(mockStation1)
      expect(OCPPAuthServiceFactory.getCachedInstanceCount()).toBe(1)

      await OCPPAuthServiceFactory.getInstance(mockStation2)
      expect(OCPPAuthServiceFactory.getCachedInstanceCount()).toBe(2)

      // Getting same instance should not increase count
      await OCPPAuthServiceFactory.getInstance(mockStation1)
      expect(OCPPAuthServiceFactory.getCachedInstanceCount()).toBe(2)
    })
  })

  await describe('getStatistics', async () => {
    await it('should return factory statistics', async () => {
      OCPPAuthServiceFactory.clearAllInstances()

      const mockStation1 = createMockAuthServiceTestStation('013')
      const mockStation2 = createMockAuthServiceTestStation('014', OCPPVersion.VERSION_20)

      await OCPPAuthServiceFactory.getInstance(mockStation1)
      await OCPPAuthServiceFactory.getInstance(mockStation2)

      const stats = OCPPAuthServiceFactory.getStatistics()

      expect(stats).toBeDefined()
      expect(stats.cachedInstances).toBe(2)
      expect(stats.stationIds).toHaveLength(2)
      expect(stats.stationIds).toContain('TEST-CS-013')
      expect(stats.stationIds).toContain('TEST-CS-014')
    })

    await it('should return empty statistics when no instances cached', () => {
      OCPPAuthServiceFactory.clearAllInstances()

      const stats = OCPPAuthServiceFactory.getStatistics()

      expect(stats.cachedInstances).toBe(0)
      expect(stats.stationIds).toHaveLength(0)
    })
  })

  await describe('OCPP version handling', async () => {
    await it('should create service for OCPP 1.6 station', async () => {
      const mockStation = createMockAuthServiceTestStation('015')

      const authService = await OCPPAuthServiceFactory.getInstance(mockStation)

      expect(authService).toBeDefined()
      expect(typeof authService.authorize).toBe('function')
      expect(typeof authService.getConfiguration).toBe('function')
    })

    await it('should create service for OCPP 2.0 station', async () => {
      const mockStation = createMockAuthServiceTestStation('016', OCPPVersion.VERSION_20)

      const authService = await OCPPAuthServiceFactory.getInstance(mockStation)

      expect(authService).toBeDefined()
      expect(typeof authService.authorize).toBe('function')
      expect(typeof authService.testConnectivity).toBe('function')
    })
  })

  await describe('memory management', async () => {
    await it('should properly manage instance lifecycle', async () => {
      OCPPAuthServiceFactory.clearAllInstances()

      const mockStations = Array.from({ length: 5 }, (_, i) =>
        createMockAuthServiceTestStation(
          String(100 + i),
          i % 2 === 0 ? OCPPVersion.VERSION_16 : OCPPVersion.VERSION_20
        )
      )

      // Create instances
      for (const station of mockStations) {
        await OCPPAuthServiceFactory.getInstance(station)
      }

      expect(OCPPAuthServiceFactory.getCachedInstanceCount()).toBe(5)

      // Clear one instance
      OCPPAuthServiceFactory.clearInstance(mockStations[0])
      expect(OCPPAuthServiceFactory.getCachedInstanceCount()).toBe(4)

      // Clear all
      OCPPAuthServiceFactory.clearAllInstances()
      expect(OCPPAuthServiceFactory.getCachedInstanceCount()).toBe(0)
    })
  })
})
