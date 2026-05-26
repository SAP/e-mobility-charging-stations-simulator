/**
 * @file Tests for JsonFileStorage
 * @description Unit tests for the JSON file performance storage backend.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { pathToFileURL } from 'node:url'

import { JsonFileStorage } from '../../../src/performance/storage/JsonFileStorage.js'
import { logger } from '../../../src/utils/index.js'
import { createLoggerMocks, standardCleanup } from '../../helpers/TestLifecycleHelpers.js'
import { buildTestStatistics } from './StorageTestHelpers.js'

const LOG_PREFIX = 'JsonFileStorage-test |'

const buildStorageUri = (filePath: string): string => pathToFileURL(filePath).toString()

await describe('JsonFileStorage', async () => {
  let tmpDir: string
  let dbPath: string
  let storage: JsonFileStorage

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'json-file-storage-test-'))
    dbPath = join(tmpDir, 'perf.json')
    storage = new JsonFileStorage(buildStorageUri(dbPath), LOG_PREFIX)
    storage.open()
  })

  afterEach(() => {
    storage.close()
    standardCleanup()
    rmSync(tmpDir, { force: true, recursive: true })
  })

  await it('should write performance statistics atomically and leave no temp artifact behind', async () => {
    const stats = buildTestStatistics('cs-1')

    await storage.storePerformanceStatistics(stats)

    assert.strictEqual(existsSync(dbPath), true)
    const written = JSON.parse(readFileSync(dbPath, 'utf8')) as { id: string }[]
    assert.strictEqual(Array.isArray(written), true)
    assert.strictEqual(written.length, 1)
    assert.strictEqual(written[0].id, 'cs-1')
    assert.deepStrictEqual(
      readdirSync(tmpDir).filter(name => name.endsWith('.tmp')),
      []
    )
  })

  await it('should overwrite the records file with the latest snapshot on each store call', async () => {
    await storage.storePerformanceStatistics(buildTestStatistics('cs-1'))
    await storage.storePerformanceStatistics(buildTestStatistics('cs-2'))

    const written = JSON.parse(readFileSync(dbPath, 'utf8')) as { id: string }[]
    const ids = written.map(entry => entry.id).sort()
    assert.deepStrictEqual(ids, ['cs-1', 'cs-2'])
  })

  await it('should serialize the statisticsData Map via MapStringifyFormat.object', async () => {
    const stats = buildTestStatistics('cs-1', 'station-with-map')

    await storage.storePerformanceStatistics(stats)

    const written = JSON.parse(readFileSync(dbPath, 'utf8')) as {
      statisticsData: Record<string, { requestCount: number }>
    }[]
    assert.ok(typeof written[0].statisticsData === 'object', 'statisticsData must be an object')
    assert.strictEqual(written[0].statisticsData.Heartbeat.requestCount, 100)
  })

  await it('should log a warning and not throw when the storage directory is removed at runtime', async t => {
    const { warnMock } = createLoggerMocks(t, logger)
    rmSync(tmpDir, { force: true, recursive: true })

    await assert.doesNotReject(storage.storePerformanceStatistics(buildTestStatistics('cs-1')))

    assert.strictEqual(existsSync(dbPath), false)
    assert.strictEqual(warnMock.mock.calls.length, 1)
  })

  await it('should reflect every parallel writer in the final snapshot when serialized via AsyncLock', async () => {
    const stations = Array.from({ length: 4 }, (_, i) => buildTestStatistics(`cs-${i.toString()}`))

    await Promise.all(stations.map(async stats => storage.storePerformanceStatistics(stats)))

    const written = JSON.parse(readFileSync(dbPath, 'utf8')) as { id: string }[]
    const ids = written.map(entry => entry.id).sort()
    assert.deepStrictEqual(ids, ['cs-0', 'cs-1', 'cs-2', 'cs-3'])
    assert.deepStrictEqual(
      readdirSync(tmpDir).filter(name => name.endsWith('.tmp')),
      []
    )
  })
})
