/**
 * @file Tests for MikroOrmStorage
 * @description Unit tests for MikroORM-based performance storage
 */
import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { MikroOrmStorage } from '../../../src/performance/storage/MikroOrmStorage.js'
import { type Statistics, StorageType } from '../../../src/types/index.js'
import { PerformanceRecord } from '../../../src/types/orm/entities/PerformanceRecord.js'
import { logger } from '../../../src/utils/Logger.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'

const TEST_LOG_PREFIX = '[MikroOrmStorage Test]'
const TEST_STORAGE_URI = 'file:performance/e-mobility-charging-stations-simulator.db'

interface MockEntityManager {
  fork: () => MockEntityManager
  upsert: (entity: unknown, data: unknown) => Promise<unknown>
}

interface MockOrm {
  close: () => Promise<void>
  em: MockEntityManager
  schema: {
    updateSchema: () => Promise<void>
  }
}

class TestableMikroOrmStorage extends MikroOrmStorage {
  public getOrm (): unknown {
    return Reflect.get(this, 'orm')
  }

  public setOrm (orm: MockOrm): void {
    Reflect.set(this, 'orm', orm)
  }
}

/**
 * @returns Mock ORM instance and captured upsert calls
 */
function buildMockOrm (): { mockOrm: MockOrm; upsertCalls: unknown[] } {
  const upsertCalls: unknown[] = []
  const mockEm: MockEntityManager = {
    fork: () => mockEm,
    upsert: (_entity: unknown, data: unknown) => {
      upsertCalls.push({ data, entity: _entity })
      return Promise.resolve(data)
    },
  }
  const mockOrm: MockOrm = {
    close: () => Promise.resolve(),
    em: mockEm,
    schema: {
      updateSchema: () => Promise.resolve(),
    },
  }
  return { mockOrm, upsertCalls }
}

/**
 * @param id - Performance record identifier
 * @param name - Charging station name
 * @returns Statistics object with sample measurement data
 */
function buildTestStatistics (id: string, name?: string): Statistics {
  const statsData = new Map<string, Record<string, unknown>>()
  statsData.set('Heartbeat', {
    avgTimeMeasurement: 10.5,
    currentTimeMeasurement: 12,
    maxTimeMeasurement: 20,
    measurementTimeSeries: [
      { timestamp: 1000, value: 10 },
      { timestamp: 2000, value: 12 },
    ],
    minTimeMeasurement: 5,
    requestCount: 100,
    responseCount: 99,
    timeMeasurementCount: 100,
    totalTimeMeasurement: 1050,
  })
  return {
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    id,
    name: name ?? `cs-${id}`,
    statisticsData: statsData,
    uri: 'ws://localhost:8080',
  } as unknown as Statistics
}

await describe('MikroOrmStorage', async () => {
  let storage: TestableMikroOrmStorage

  beforeEach(() => {
    storage = new TestableMikroOrmStorage(TEST_STORAGE_URI, TEST_LOG_PREFIX, StorageType.SQLITE)
  })

  afterEach(async () => {
    try {
      await storage.close()
    } catch {
      // Storage may not have been opened
    }
    standardCleanup()
  })

  await describe('close', async () => {
    await it('should clear cached performance statistics', async () => {
      // Arrange
      const { mockOrm } = buildMockOrm()
      storage.setOrm(mockOrm)
      await storage.storePerformanceStatistics(buildTestStatistics('station-1'))
      expect([...storage.getPerformanceStatistics()].length).toBe(1)

      // Act
      await storage.close()

      // Assert
      expect([...storage.getPerformanceStatistics()].length).toBe(0)
    })

    await it('should call orm.close when ORM is initialized', async t => {
      // Arrange
      const { mockOrm } = buildMockOrm()
      const closeMock = t.mock.method(mockOrm, 'close')
      storage.setOrm(mockOrm)

      // Act
      await storage.close()

      // Assert
      expect(closeMock.mock.calls.length).toBe(1)
    })

    await it('should delete orm reference after closing', async () => {
      // Arrange
      const { mockOrm } = buildMockOrm()
      storage.setOrm(mockOrm)

      // Act
      await storage.close()

      // Assert
      expect(storage.getOrm()).toBeUndefined()
    })

    await it('should not fail when closing without prior open', async () => {
      await storage.close()
      await storage.close()
    })

    await it('should log error when orm.close throws', async t => {
      // Arrange
      const errorMock = t.mock.method(logger, 'error')
      const failingOrm: MockOrm = {
        close: () => Promise.reject(new Error('close failed')),
        em: { fork: () => ({}) as MockEntityManager, upsert: () => Promise.resolve({}) },
        schema: { updateSchema: () => Promise.resolve() },
      }
      storage.setOrm(failingOrm)

      // Act
      await storage.close()

      // Assert
      expect(errorMock.mock.calls.length).toBe(1)
    })
  })

  await describe('storePerformanceStatistics', async () => {
    await it('should transform statisticsData map to array with name field', async () => {
      // Arrange
      const { mockOrm, upsertCalls } = buildMockOrm()
      storage.setOrm(mockOrm)
      const stats = buildTestStatistics('station-1')

      // Act
      await storage.storePerformanceStatistics(stats)

      // Assert
      expect(upsertCalls.length).toBe(1)
      const call = upsertCalls[0] as { data: Record<string, unknown>; entity: unknown }
      expect(call.entity).toBe(PerformanceRecord)
      const statsArray = call.data.statisticsData as Record<string, unknown>[]
      expect(Array.isArray(statsArray)).toBe(true)
      expect(statsArray.length).toBe(1)
      expect(statsArray[0].name).toBe('Heartbeat')
      expect(statsArray[0].requestCount).toBe(100)
      expect(statsArray[0].avgTimeMeasurement).toBe(10.5)
    })

    await it('should spread measurementTimeSeries into plain array', async () => {
      // Arrange
      const { mockOrm, upsertCalls } = buildMockOrm()
      storage.setOrm(mockOrm)

      // Act
      await storage.storePerformanceStatistics(buildTestStatistics('station-1'))

      // Assert
      const call = upsertCalls[0] as { data: Record<string, unknown> }
      const statsArray = call.data.statisticsData as Record<string, unknown>[]
      const timeSeries = statsArray[0].measurementTimeSeries as unknown[]
      expect(Array.isArray(timeSeries)).toBe(true)
      expect(timeSeries.length).toBe(2)
    })

    await it('should call upsert with PerformanceRecord entity class', async () => {
      // Arrange
      const { mockOrm, upsertCalls } = buildMockOrm()
      storage.setOrm(mockOrm)

      // Act
      await storage.storePerformanceStatistics(buildTestStatistics('station-1'))

      // Assert
      const call = upsertCalls[0] as { entity: unknown }
      expect(call.entity).toBe(PerformanceRecord)
    })

    await it('should cache statistics in memory after store', async () => {
      // Arrange
      const { mockOrm } = buildMockOrm()
      storage.setOrm(mockOrm)

      // Act
      await storage.storePerformanceStatistics(buildTestStatistics('station-1'))

      // Assert
      const cached = [...storage.getPerformanceStatistics()]
      expect(cached.length).toBe(1)
      expect(cached[0].id).toBe('station-1')
    })

    await it('should handle multiple distinct records', async () => {
      // Arrange
      const { mockOrm, upsertCalls } = buildMockOrm()
      storage.setOrm(mockOrm)

      // Act
      await storage.storePerformanceStatistics(buildTestStatistics('station-1'))
      await storage.storePerformanceStatistics(buildTestStatistics('station-2'))
      await storage.storePerformanceStatistics(buildTestStatistics('station-3'))

      // Assert
      expect(upsertCalls.length).toBe(3)
      const cached = [...storage.getPerformanceStatistics()]
      expect(cached.length).toBe(3)
    })

    await it('should handle statisticsData entry without measurementTimeSeries', async () => {
      // Arrange
      const { mockOrm, upsertCalls } = buildMockOrm()
      storage.setOrm(mockOrm)
      const stats = buildTestStatistics('station-1')
      stats.statisticsData.set('StatusNotification', {
        requestCount: 50,
        responseCount: 50,
      } as unknown as Record<string, unknown>)

      // Act
      await storage.storePerformanceStatistics(stats)

      // Assert
      const call = upsertCalls[0] as { data: Record<string, unknown> }
      const statsArray = call.data.statisticsData as Record<string, unknown>[]
      expect(statsArray.length).toBe(2)
      const statusEntry = statsArray.find(e => e.name === 'StatusNotification')
      expect(statusEntry).toBeDefined()
      expect(statusEntry?.measurementTimeSeries).toBeUndefined()
    })
  })

  await describe('Error Handling', async () => {
    await it('should log error when storing without open', async t => {
      // Arrange
      const errorMock = t.mock.method(logger, 'error')

      // Act
      await storage.storePerformanceStatistics(buildTestStatistics('station-1'))

      // Assert
      expect(errorMock.mock.calls.length).toBe(1)
    })

    await it('should still cache statistics even when store fails', async () => {
      // Act
      await storage.storePerformanceStatistics(buildTestStatistics('station-1'))

      // Assert
      const cached = [...storage.getPerformanceStatistics()]
      expect(cached.length).toBe(1)
      expect(cached[0].id).toBe('station-1')
    })

    await it('should log error when upsert throws', async t => {
      // Arrange
      const errorMock = t.mock.method(logger, 'error')
      const failingEm: MockEntityManager = {
        fork: () => failingEm,
        upsert: () => Promise.reject(new Error('upsert failed')),
      }
      const failingOrm: MockOrm = {
        close: () => Promise.resolve(),
        em: failingEm,
        schema: { updateSchema: () => Promise.resolve() },
      }
      storage.setOrm(failingOrm)

      // Act
      await storage.storePerformanceStatistics(buildTestStatistics('station-1'))

      // Assert
      expect(errorMock.mock.calls.length).toBe(1)
    })
  })
})
