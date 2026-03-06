/**
 * @file Tests for MongoDBStorage
 * @description Unit tests for MongoDB-based performance storage
 */
import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { MongoDBStorage } from '../../../src/performance/storage/MongoDBStorage.js'
import { Constants } from '../../../src/utils/index.js'
import { logger } from '../../../src/utils/Logger.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'
import { buildTestStatistics } from './StorageTestHelpers.js'

const TEST_LOG_PREFIX = '[MongoDBStorage Test]'
const TEST_STORAGE_URI = 'mongodb://localhost:27017/e-mobility-test'

interface MockCollection {
  replaceOne: (
    filter: Record<string, unknown>,
    replacement: unknown,
    options: Record<string, unknown>
  ) => Promise<unknown>
}

interface MockDb {
  collection: (name: string) => MockCollection
}

interface MockMongoClient {
  close: () => Promise<void>
  connect: () => Promise<void>
  db: (name: string) => MockDb
}

class TestableMongoDBStorage extends MongoDBStorage {
  public getClient (): unknown {
    return Reflect.get(this, 'client')
  }

  public getOpened (): boolean {
    return Reflect.get(this, 'opened') as boolean
  }

  public setClient (client: MockMongoClient): void {
    Reflect.set(this, 'client', client)
  }

  public setOpened (opened: boolean): void {
    Reflect.set(this, 'opened', opened)
  }
}

/**
 * @returns Mock MongoDB client and captured call logs
 */
function buildMockMongoClient (): {
  collectionCalls: { collectionName: string }[]
  mockClient: MockMongoClient
  replaceOneCalls: {
    filter: Record<string, unknown>
    options: Record<string, unknown>
    replacement: unknown
  }[]
} {
  const replaceOneCalls: {
    filter: Record<string, unknown>
    options: Record<string, unknown>
    replacement: unknown
  }[] = []
  const collectionCalls: { collectionName: string }[] = []
  const mockCollection: MockCollection = {
    replaceOne: (
      filter: Record<string, unknown>,
      replacement: unknown,
      options: Record<string, unknown>
    ) => {
      replaceOneCalls.push({ filter, options, replacement })
      return Promise.resolve({ acknowledged: true, modifiedCount: 1 })
    },
  }
  const mockDb: MockDb = {
    collection: (name: string) => {
      collectionCalls.push({ collectionName: name })
      return mockCollection
    },
  }
  const mockClient: MockMongoClient = {
    close: () => Promise.resolve(),
    connect: () => Promise.resolve(),
    db: (_name: string) => mockDb,
  }
  return { collectionCalls, mockClient, replaceOneCalls }
}

await describe('MongoDBStorage', async () => {
  let storage: TestableMongoDBStorage

  beforeEach(() => {
    storage = new TestableMongoDBStorage(TEST_STORAGE_URI, TEST_LOG_PREFIX)
  })

  afterEach(async () => {
    try {
      await storage.close()
    } catch {
      // Storage may not have been opened
    }
    standardCleanup()
  })

  await describe('constructor', async () => {
    await it('should extract database name from URI path', () => {
      const dbName = Reflect.get(storage, 'dbName') as string
      expect(dbName).toBe('e-mobility-test')
    })

    await it('should initialize with opened set to false', () => {
      expect(storage.getOpened()).toBe(false)
    })
  })

  await describe('close', async () => {
    await it('should clear cached performance statistics', async () => {
      // Arrange
      const { mockClient } = buildMockMongoClient()
      storage.setClient(mockClient)
      storage.setOpened(true)
      await storage.storePerformanceStatistics(buildTestStatistics('station-1'))
      expect([...storage.getPerformanceStatistics()].length).toBe(1)

      // Act
      await storage.close()

      // Assert
      expect([...storage.getPerformanceStatistics()].length).toBe(0)
    })

    await it('should call client.close when opened', async t => {
      // Arrange
      const { mockClient } = buildMockMongoClient()
      const closeMock = t.mock.method(mockClient, 'close')
      storage.setClient(mockClient)
      storage.setOpened(true)

      // Act
      await storage.close()

      // Assert
      expect(closeMock.mock.calls.length).toBe(1)
    })

    await it('should set opened to false after closing', async () => {
      // Arrange
      const { mockClient } = buildMockMongoClient()
      storage.setClient(mockClient)
      storage.setOpened(true)

      // Act
      await storage.close()

      // Assert
      expect(storage.getOpened()).toBe(false)
    })

    await it('should not call client.close when not opened', async t => {
      // Arrange
      const { mockClient } = buildMockMongoClient()
      const closeMock = t.mock.method(mockClient, 'close')
      storage.setClient(mockClient)

      // Act
      await storage.close()

      // Assert
      expect(closeMock.mock.calls.length).toBe(0)
    })

    await it('should log error when client.close throws', async t => {
      // Arrange
      const errorMock = t.mock.method(logger, 'error')
      const failingClient: MockMongoClient = {
        close: () => Promise.reject(new Error('close failed')),
        connect: () => Promise.resolve(),
        db: () => ({}) as MockDb,
      }
      storage.setClient(failingClient)
      storage.setOpened(true)

      // Act
      await storage.close()

      // Assert
      expect(errorMock.mock.calls.length).toBe(1)
    })
  })

  await describe('open', async () => {
    await it('should call client.connect', async t => {
      // Arrange
      const { mockClient } = buildMockMongoClient()
      const connectMock = t.mock.method(mockClient, 'connect')
      storage.setClient(mockClient)

      // Act
      await storage.open()

      // Assert
      expect(connectMock.mock.calls.length).toBe(1)
      expect(storage.getOpened()).toBe(true)
    })

    await it('should not connect when already opened', async t => {
      // Arrange
      const { mockClient } = buildMockMongoClient()
      const connectMock = t.mock.method(mockClient, 'connect')
      storage.setClient(mockClient)
      storage.setOpened(true)

      // Act
      await storage.open()

      // Assert
      expect(connectMock.mock.calls.length).toBe(0)
    })

    await it('should log error when connect throws', async t => {
      // Arrange
      const errorMock = t.mock.method(logger, 'error')
      const failingClient: MockMongoClient = {
        close: () => Promise.resolve(),
        connect: () => Promise.reject(new Error('connect failed')),
        db: () => ({}) as MockDb,
      }
      storage.setClient(failingClient)

      // Act
      await storage.open()

      // Assert
      expect(errorMock.mock.calls.length).toBe(1)
    })
  })

  await describe('storePerformanceStatistics', async () => {
    await it('should serialize statisticsData map to array with name field', async () => {
      // Arrange
      const { mockClient, replaceOneCalls } = buildMockMongoClient()
      storage.setClient(mockClient)
      storage.setOpened(true)
      const stats = buildTestStatistics('station-1')

      // Act
      await storage.storePerformanceStatistics(stats)

      // Assert
      expect(replaceOneCalls.length).toBe(1)
      const replacement = replaceOneCalls[0].replacement as Record<string, unknown>
      const statsArray = replacement.statisticsData as Record<string, unknown>[]
      expect(Array.isArray(statsArray)).toBe(true)
      expect(statsArray.length).toBe(1)
      expect(statsArray[0].name).toBe('Heartbeat')
      expect(statsArray[0].requestCount).toBe(100)
      expect(statsArray[0].avgTimeMeasurement).toBe(10.5)
    })

    await it('should spread measurementTimeSeries into plain array', async () => {
      // Arrange
      const { mockClient, replaceOneCalls } = buildMockMongoClient()
      storage.setClient(mockClient)
      storage.setOpened(true)

      // Act
      await storage.storePerformanceStatistics(buildTestStatistics('station-1'))

      // Assert
      const replacement = replaceOneCalls[0].replacement as Record<string, unknown>
      const statsArray = replacement.statisticsData as Record<string, unknown>[]
      const timeSeries = statsArray[0].measurementTimeSeries as unknown[]
      expect(Array.isArray(timeSeries)).toBe(true)
      expect(timeSeries.length).toBe(2)
    })

    await it('should call replaceOne with upsert and correct filter', async () => {
      // Arrange
      const { mockClient, replaceOneCalls } = buildMockMongoClient()
      storage.setClient(mockClient)
      storage.setOpened(true)

      // Act
      await storage.storePerformanceStatistics(buildTestStatistics('station-1'))

      // Assert
      expect(replaceOneCalls.length).toBe(1)
      expect(replaceOneCalls[0].filter).toStrictEqual({ id: 'station-1' })
      expect(replaceOneCalls[0].options).toStrictEqual({ upsert: true })
    })

    await it('should use correct collection name', async () => {
      // Arrange
      const { collectionCalls, mockClient } = buildMockMongoClient()
      storage.setClient(mockClient)
      storage.setOpened(true)

      // Act
      await storage.storePerformanceStatistics(buildTestStatistics('station-1'))

      // Assert
      expect(collectionCalls.length).toBe(1)
      expect(collectionCalls[0].collectionName).toBe(Constants.PERFORMANCE_RECORDS_TABLE)
    })

    await it('should cache statistics in memory after store', async () => {
      // Arrange
      const { mockClient } = buildMockMongoClient()
      storage.setClient(mockClient)
      storage.setOpened(true)

      // Act
      await storage.storePerformanceStatistics(buildTestStatistics('station-1'))

      // Assert
      const cached = [...storage.getPerformanceStatistics()]
      expect(cached.length).toBe(1)
      expect(cached[0].id).toBe('station-1')
    })

    await it('should handle multiple distinct records', async () => {
      // Arrange
      const { mockClient, replaceOneCalls } = buildMockMongoClient()
      storage.setClient(mockClient)
      storage.setOpened(true)

      // Act
      await storage.storePerformanceStatistics(buildTestStatistics('station-1'))
      await storage.storePerformanceStatistics(buildTestStatistics('station-2'))
      await storage.storePerformanceStatistics(buildTestStatistics('station-3'))

      // Assert
      expect(replaceOneCalls.length).toBe(3)
      const cached = [...storage.getPerformanceStatistics()]
      expect(cached.length).toBe(3)
    })

    await it('should handle statisticsData entry without measurementTimeSeries', async () => {
      // Arrange
      const { mockClient, replaceOneCalls } = buildMockMongoClient()
      storage.setClient(mockClient)
      storage.setOpened(true)
      const stats = buildTestStatistics('station-1')
      stats.statisticsData.set('StatusNotification', {
        requestCount: 50,
        responseCount: 50,
      } as unknown as Record<string, unknown>)

      // Act
      await storage.storePerformanceStatistics(stats)

      // Assert
      const replacement = replaceOneCalls[0].replacement as Record<string, unknown>
      const statsArray = replacement.statisticsData as Record<string, unknown>[]
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

    await it('should log error when replaceOne throws', async t => {
      // Arrange
      const errorMock = t.mock.method(logger, 'error')
      const failingCollection: MockCollection = {
        replaceOne: () => Promise.reject(new Error('replaceOne failed')),
      }
      const failingClient: MockMongoClient = {
        close: () => Promise.resolve(),
        connect: () => Promise.resolve(),
        db: () => ({ collection: () => failingCollection }) as unknown as MockDb,
      }
      storage.setClient(failingClient)
      storage.setOpened(true)

      // Act
      await storage.storePerformanceStatistics(buildTestStatistics('station-1'))

      // Assert
      expect(errorMock.mock.calls.length).toBe(1)
    })
  })
})
