import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import type { ChargingStation } from '../../../../../src/charging-station/ChargingStation.js'

import { OCPPAuthServiceFactory } from '../../../../../src/charging-station/ocpp/auth/services/OCPPAuthServiceFactory.js'
import { OCPPVersion } from '../../../../../src/types/ocpp/OCPPVersion.js'

await describe('OCPPAuthServiceFactory', async () => {
  await describe('getInstance', async () => {
    await it('should create a new instance for a charging station', async () => {
      const mockStation = {
        logPrefix: () => '[TEST-CS-001]',
        stationInfo: {
          chargingStationId: 'TEST-CS-001',
          ocppVersion: OCPPVersion.VERSION_16,
        },
      } as unknown as ChargingStation

      const authService = await OCPPAuthServiceFactory.getInstance(mockStation)

      expect(authService).toBeDefined()
      expect(typeof authService.authorize).toBe('function')
      expect(typeof authService.getConfiguration).toBe('function')
    })

    await it('should return cached instance for same charging station', async () => {
      const mockStation = {
        logPrefix: () => '[TEST-CS-002]',
        stationInfo: {
          chargingStationId: 'TEST-CS-002',
          ocppVersion: OCPPVersion.VERSION_20,
        },
      } as unknown as ChargingStation

      const authService1 = await OCPPAuthServiceFactory.getInstance(mockStation)
      const authService2 = await OCPPAuthServiceFactory.getInstance(mockStation)

      expect(authService1).toBe(authService2)
    })

    await it('should create different instances for different charging stations', async () => {
      const mockStation1 = {
        logPrefix: () => '[TEST-CS-003]',
        stationInfo: {
          chargingStationId: 'TEST-CS-003',
          ocppVersion: OCPPVersion.VERSION_16,
        },
      } as unknown as ChargingStation

      const mockStation2 = {
        logPrefix: () => '[TEST-CS-004]',
        stationInfo: {
          chargingStationId: 'TEST-CS-004',
          ocppVersion: OCPPVersion.VERSION_20,
        },
      } as unknown as ChargingStation

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
      const mockStation = {
        logPrefix: () => '[TEST-CS-005]',
        stationInfo: {
          chargingStationId: 'TEST-CS-005',
          ocppVersion: OCPPVersion.VERSION_16,
        },
      } as unknown as ChargingStation

      const authService1 = await OCPPAuthServiceFactory.createInstance(mockStation)
      const authService2 = await OCPPAuthServiceFactory.createInstance(mockStation)

      expect(authService1).toBeDefined()
      expect(authService2).toBeDefined()
      expect(authService1).not.toBe(authService2)
    })

    await it('should not cache created instances', async () => {
      const mockStation = {
        logPrefix: () => '[TEST-CS-006]',
        stationInfo: {
          chargingStationId: 'TEST-CS-006',
          ocppVersion: OCPPVersion.VERSION_20,
        },
      } as unknown as ChargingStation

      const initialCount = OCPPAuthServiceFactory.getCachedInstanceCount()
      await OCPPAuthServiceFactory.createInstance(mockStation)
      const finalCount = OCPPAuthServiceFactory.getCachedInstanceCount()

      expect(finalCount).toBe(initialCount)
    })
  })

  await describe('clearInstance', async () => {
    await it('should clear cached instance for a charging station', async () => {
      const mockStation = {
        logPrefix: () => '[TEST-CS-007]',
        stationInfo: {
          chargingStationId: 'TEST-CS-007',
          ocppVersion: OCPPVersion.VERSION_16,
        },
      } as unknown as ChargingStation

      // Create and cache instance
      const authService1 = await OCPPAuthServiceFactory.getInstance(mockStation)

      // Clear the cache
      OCPPAuthServiceFactory.clearInstance(mockStation)

      // Get instance again - should be a new instance
      const authService2 = await OCPPAuthServiceFactory.getInstance(mockStation)

      expect(authService1).not.toBe(authService2)
    })

    await it('should not throw when clearing non-existent instance', () => {
      const mockStation = {
        logPrefix: () => '[TEST-CS-008]',
        stationInfo: {
          chargingStationId: 'TEST-CS-008',
          ocppVersion: OCPPVersion.VERSION_20,
        },
      } as unknown as ChargingStation

      expect(() => {
        OCPPAuthServiceFactory.clearInstance(mockStation)
      }).not.toThrow()
    })
  })

  await describe('clearAllInstances', async () => {
    await it('should clear all cached instances', async () => {
      const mockStation1 = {
        logPrefix: () => '[TEST-CS-009]',
        stationInfo: {
          chargingStationId: 'TEST-CS-009',
          ocppVersion: OCPPVersion.VERSION_16,
        },
      } as unknown as ChargingStation

      const mockStation2 = {
        logPrefix: () => '[TEST-CS-010]',
        stationInfo: {
          chargingStationId: 'TEST-CS-010',
          ocppVersion: OCPPVersion.VERSION_20,
        },
      } as unknown as ChargingStation

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

      const mockStation1 = {
        logPrefix: () => '[TEST-CS-011]',
        stationInfo: {
          chargingStationId: 'TEST-CS-011',
          ocppVersion: OCPPVersion.VERSION_16,
        },
      } as unknown as ChargingStation

      const mockStation2 = {
        logPrefix: () => '[TEST-CS-012]',
        stationInfo: {
          chargingStationId: 'TEST-CS-012',
          ocppVersion: OCPPVersion.VERSION_20,
        },
      } as unknown as ChargingStation

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

      const mockStation1 = {
        logPrefix: () => '[TEST-CS-013]',
        stationInfo: {
          chargingStationId: 'TEST-CS-013',
          ocppVersion: OCPPVersion.VERSION_16,
        },
      } as unknown as ChargingStation

      const mockStation2 = {
        logPrefix: () => '[TEST-CS-014]',
        stationInfo: {
          chargingStationId: 'TEST-CS-014',
          ocppVersion: OCPPVersion.VERSION_20,
        },
      } as unknown as ChargingStation

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
      const mockStation = {
        logPrefix: () => '[TEST-CS-015]',
        stationInfo: {
          chargingStationId: 'TEST-CS-015',
          ocppVersion: OCPPVersion.VERSION_16,
        },
      } as unknown as ChargingStation

      const authService = await OCPPAuthServiceFactory.getInstance(mockStation)

      expect(authService).toBeDefined()
      expect(typeof authService.authorize).toBe('function')
      expect(typeof authService.getConfiguration).toBe('function')
    })

    await it('should create service for OCPP 2.0 station', async () => {
      const mockStation = {
        logPrefix: () => '[TEST-CS-016]',
        stationInfo: {
          chargingStationId: 'TEST-CS-016',
          ocppVersion: OCPPVersion.VERSION_20,
        },
      } as unknown as ChargingStation

      const authService = await OCPPAuthServiceFactory.getInstance(mockStation)

      expect(authService).toBeDefined()
      expect(typeof authService.authorize).toBe('function')
      expect(typeof authService.testConnectivity).toBe('function')
    })
  })

  await describe('memory management', async () => {
    await it('should properly manage instance lifecycle', async () => {
      OCPPAuthServiceFactory.clearAllInstances()

      const mockStations = Array.from({ length: 5 }, (_, i) => ({
        logPrefix: () => `[TEST-CS-${String(100 + i)}]`,
        stationInfo: {
          chargingStationId: `TEST-CS-${String(100 + i)}`,
          ocppVersion: i % 2 === 0 ? OCPPVersion.VERSION_16 : OCPPVersion.VERSION_20,
        },
      })) as unknown as ChargingStation[]

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
