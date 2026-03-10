/**
 * @file Tests for MikroOrmStorage
 * @description Unit and integration tests for MikroORM-based performance storage
 */
import { MikroORM } from '@mikro-orm/better-sqlite'
import assert from 'node:assert/strict'
import { existsSync, rmSync } from 'node:fs'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { MikroOrmStorage } from '../../../src/performance/storage/MikroOrmStorage.js'
import { StorageType } from '../../../src/types/index.js'
import { PerformanceRecord } from '../../../src/types/orm/entities/PerformanceRecord.js'
import { Constants } from '../../../src/utils/index.js'
import { logger } from '../../../src/utils/Logger.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'
import { buildTestStatistics } from './StorageTestHelpers.js'

const TEST_LOG_PREFIX = '[MikroOrmStorage Test]'
const TEST_STORAGE_URI = 'file:performance/e-mobility-charging-stations-simulator.db'
const TEST_DB_PATH = `${Constants.DEFAULT_PERFORMANCE_DIRECTORY}/${Constants.DEFAULT_PERFORMANCE_RECORDS_DB_NAME}.db`

let sqliteAvailable = false
try {
  const orm = await MikroORM.init({
    dbName: ':memory:',
    discovery: { warnWhenNoEntities: false },
    entities: [],
  })
  await orm.close()
  sqliteAvailable = true
} catch {
  // better-sqlite3 native binding not available (CI --ignore-scripts)
}

const SKIP_SQLITE = !sqliteAvailable ? 'better-sqlite3 native binding not available' : undefined

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
    if (existsSync(TEST_DB_PATH)) {
      rmSync(TEST_DB_PATH)
    }
    standardCleanup()
  })

  await describe('close', async () => {
    await it('should clear cached performance statistics', async () => {
      // Arrange
      const { mockOrm } = buildMockOrm()
      storage.setOrm(mockOrm)
      await storage.storePerformanceStatistics(buildTestStatistics('station-1'))
      assert.strictEqual([...storage.getPerformanceStatistics()].length, 1)

      // Act
      await storage.close()

      // Assert
      assert.strictEqual([...storage.getPerformanceStatistics()].length, 0)
    })

    await it('should call orm.close when ORM is initialized', async t => {
      // Arrange
      const { mockOrm } = buildMockOrm()
      const closeMock = t.mock.method(mockOrm, 'close')
      storage.setOrm(mockOrm)

      // Act
      await storage.close()

      // Assert
      assert.strictEqual(closeMock.mock.calls.length, 1)
    })

    await it('should delete orm reference after closing', async () => {
      // Arrange
      const { mockOrm } = buildMockOrm()
      storage.setOrm(mockOrm)

      // Act
      await storage.close()

      // Assert
      assert.strictEqual(storage.getOrm(), undefined)
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
      assert.strictEqual(errorMock.mock.calls.length, 1)
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
      assert.strictEqual(upsertCalls.length, 1)
      const call = upsertCalls[0] as { data: Record<string, unknown>; entity: unknown }
      assert.strictEqual(call.entity, PerformanceRecord)
      const statsArray = call.data.statisticsData as Record<string, unknown>[]
      assert.ok(Array.isArray(statsArray))
      assert.strictEqual(statsArray.length, 1)
      assert.strictEqual(statsArray[0].name, 'Heartbeat')
      assert.strictEqual(statsArray[0].requestCount, 100)
      assert.strictEqual(statsArray[0].avgTimeMeasurement, 10.5)
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
      assert.ok(Array.isArray(timeSeries))
      assert.strictEqual(timeSeries.length, 2)
    })

    await it('should call upsert with PerformanceRecord entity class', async () => {
      // Arrange
      const { mockOrm, upsertCalls } = buildMockOrm()
      storage.setOrm(mockOrm)

      // Act
      await storage.storePerformanceStatistics(buildTestStatistics('station-1'))

      // Assert
      const call = upsertCalls[0] as { entity: unknown }
      assert.strictEqual(call.entity, PerformanceRecord)
    })

    await it('should cache statistics in memory after store', async () => {
      // Arrange
      const { mockOrm } = buildMockOrm()
      storage.setOrm(mockOrm)

      // Act
      await storage.storePerformanceStatistics(buildTestStatistics('station-1'))

      // Assert
      const cached = [...storage.getPerformanceStatistics()]
      assert.strictEqual(cached.length, 1)
      assert.strictEqual(cached[0].id, 'station-1')
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
      assert.strictEqual(upsertCalls.length, 3)
      const cached = [...storage.getPerformanceStatistics()]
      assert.strictEqual(cached.length, 3)
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
      assert.strictEqual(statsArray.length, 2)
      const statusEntry = statsArray.find(e => e.name === 'StatusNotification')
      assert.notStrictEqual(statusEntry, undefined)
      assert.strictEqual(statusEntry?.measurementTimeSeries, undefined)
    })
  })

  await describe('Error Handling', async () => {
    await it('should log error when storing without open', async t => {
      // Arrange
      const errorMock = t.mock.method(logger, 'error')

      // Act
      await storage.storePerformanceStatistics(buildTestStatistics('station-1'))

      // Assert
      assert.strictEqual(errorMock.mock.calls.length, 1)
    })

    await it('should still cache statistics even when store fails', async () => {
      // Act
      await storage.storePerformanceStatistics(buildTestStatistics('station-1'))

      // Assert
      const cached = [...storage.getPerformanceStatistics()]
      assert.strictEqual(cached.length, 1)
      assert.strictEqual(cached[0].id, 'station-1')
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
      assert.strictEqual(errorMock.mock.calls.length, 1)
    })
  })

  await describe('Integration (SQLite)', async () => {
    await it('should open database and create schema', { skip: SKIP_SQLITE }, async () => {
      await storage.open()

      assert.ok(existsSync(TEST_DB_PATH))
    })

    await it('should persist record to SQLite database', { skip: SKIP_SQLITE }, async () => {
      // Arrange
      await storage.open()

      // Act
      await storage.storePerformanceStatistics(buildTestStatistics('station-1'))

      // Assert
      const verifyOrm = await MikroORM.init({
        dbName: TEST_DB_PATH,
        entities: [PerformanceRecord],
      })
      try {
        const record = await verifyOrm.em.fork().findOne(PerformanceRecord, { id: 'station-1' })
        assert.notStrictEqual(record, undefined)
        assert.strictEqual(record?.name, 'cs-station-1')
        assert.strictEqual(record.uri, 'ws://localhost:8080')
      } finally {
        await verifyOrm.close()
      }
    })

    await it('should upsert existing record with same id', { skip: SKIP_SQLITE }, async () => {
      // Arrange
      await storage.open()
      await storage.storePerformanceStatistics(buildTestStatistics('station-1', 'original'))

      // Act
      await storage.storePerformanceStatistics(buildTestStatistics('station-1', 'updated'))

      // Assert
      const verifyOrm = await MikroORM.init({
        dbName: TEST_DB_PATH,
        entities: [PerformanceRecord],
      })
      try {
        const records = await verifyOrm.em.fork().findAll(PerformanceRecord)
        assert.strictEqual(records.length, 1)
        assert.strictEqual(records[0].name, 'updated')
      } finally {
        await verifyOrm.close()
      }
    })

    await it(
      'should serialize statisticsData as JSON array with name field',
      { skip: SKIP_SQLITE },
      async () => {
        // Arrange
        await storage.open()

        // Act
        await storage.storePerformanceStatistics(buildTestStatistics('station-1'))

        // Assert
        const verifyOrm = await MikroORM.init({
          dbName: TEST_DB_PATH,
          entities: [PerformanceRecord],
        })
        try {
          const record = await verifyOrm.em.fork().findOne(PerformanceRecord, { id: 'station-1' })
          if (record == null) {
            assert.fail('Expected record to be defined')
          }
          assert.ok(Array.isArray(record.statisticsData))
          assert.strictEqual(record.statisticsData.length, 1)
          const entry = record.statisticsData[0]
          assert.notStrictEqual(entry, undefined)
          assert.strictEqual(entry.name, 'Heartbeat')
          assert.strictEqual(entry.requestCount, 100)
        } finally {
          await verifyOrm.close()
        }
      }
    )

    await it('should persist data across close and reopen', { skip: SKIP_SQLITE }, async () => {
      // Arrange
      await storage.open()
      await storage.storePerformanceStatistics(buildTestStatistics('station-1'))
      await storage.close()

      // Act
      const freshStorage = new TestableMikroOrmStorage(
        TEST_STORAGE_URI,
        TEST_LOG_PREFIX,
        StorageType.SQLITE
      )
      await freshStorage.open()

      // Assert
      const verifyOrm = await MikroORM.init({
        dbName: TEST_DB_PATH,
        entities: [PerformanceRecord],
      })
      try {
        const record = await verifyOrm.em.fork().findOne(PerformanceRecord, { id: 'station-1' })
        assert.notStrictEqual(record, undefined)
        assert.strictEqual(record?.name, 'cs-station-1')
      } finally {
        await verifyOrm.close()
        await freshStorage.close()
      }
    })

    await it('should store multiple distinct records', { skip: SKIP_SQLITE }, async () => {
      // Arrange
      await storage.open()

      // Act
      await storage.storePerformanceStatistics(buildTestStatistics('station-1'))
      await storage.storePerformanceStatistics(buildTestStatistics('station-2'))
      await storage.storePerformanceStatistics(buildTestStatistics('station-3'))

      // Assert
      const verifyOrm = await MikroORM.init({
        dbName: TEST_DB_PATH,
        entities: [PerformanceRecord],
      })
      try {
        const records = await verifyOrm.em.fork().findAll(PerformanceRecord)
        assert.strictEqual(records.length, 3)
        const ids = records.map(r => r.id).sort()
        assert.deepStrictEqual(ids, ['station-1', 'station-2', 'station-3'])
      } finally {
        await verifyOrm.close()
      }
    })
  })
})
