/**
 * @file Tests for IdTagsCache singleton
 * @description Verifies RFID tag caching with distribution algorithms
 *
 * Covers:
 * - Singleton pattern (getInstance)
 * - getIdTags — lazy loading from file
 * - getIdTag — distribution algorithms (RANDOM, ROUND_ROBIN, CONNECTOR_AFFINITY)
 * - deleteIdTags — cache and index cleanup
 */

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/index.js'

import { getIdTagsFile } from '../../src/charging-station/Helpers.js'
import { IdTagsCache } from '../../src/charging-station/IdTagsCache.js'
import { IdTagDistribution } from '../../src/types/index.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'
import { createMockChargingStation } from './helpers/StationHelpers.js'

const TEST_ID_TAGS = ['TAG-001', 'TAG-002', 'TAG-003']
const TEST_ID_TAGS_FILE = 'test-idtags.json'

interface IdTagsCacheInternal {
  idTagsCaches: Map<string, { idTags: string[]; idTagsFileWatcher: unknown }>
  idTagsCachesAddressableIndexes: Map<string, number>
}

/**
 * Injects id tags directly into the cache's internal Map, bypassing file I/O.
 * @param cache - The IdTagsCache instance
 * @param file - The file path key to use
 * @param idTags - Array of id tags to cache
 */
function populateCache (cache: IdTagsCache, file: string, idTags: string[]): void {
  const internal = cache as unknown as IdTagsCacheInternal
  internal.idTagsCaches.set(file, { idTags, idTagsFileWatcher: undefined })
}

/**
 * Resets the IdTagsCache singleton so subsequent getInstance() creates a fresh cache.
 */
function resetIdTagsCache (): void {
  ;(IdTagsCache as unknown as { instance: null }).instance = null
}

/**
 * Resolves the idTags file path for a mock station, throwing if unresolvable.
 * @param station - The station whose stationInfo is used
 * @returns The resolved file path string
 */
function resolveIdTagsFile (station: ChargingStation): string {
  const stationInfo = station.stationInfo
  if (stationInfo == null) {
    throw new Error('stationInfo is undefined')
  }
  const file = getIdTagsFile(stationInfo)
  if (file == null) {
    throw new Error('idTagsFile resolved to undefined')
  }
  return file
}

await describe('IdTagsCache', async () => {
  afterEach(() => {
    standardCleanup()
    resetIdTagsCache()
  })

  await describe('getInstance', async () => {
    await it('should return the same instance on multiple calls', () => {
      const instance1 = IdTagsCache.getInstance()
      const instance2 = IdTagsCache.getInstance()

      assert.strictEqual(instance1, instance2)
    })

    await it('should create new instance after reset', () => {
      const instance1 = IdTagsCache.getInstance()
      resetIdTagsCache()
      const instance2 = IdTagsCache.getInstance()

      assert.notStrictEqual(instance1, instance2)
    })
  })

  await describe('getIdTags', async () => {
    await it('should return cached id tags when cache is populated', () => {
      const cache = IdTagsCache.getInstance()
      const file = '/test/path/idtags.json'
      populateCache(cache, file, TEST_ID_TAGS)

      const result = cache.getIdTags(file)

      assert.deepStrictEqual(result, TEST_ID_TAGS)
    })

    await it('should load id tags from file when cache is empty', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'idtags-test-'))
      const idTagsFile = join(tmpDir, 'idtags.json')
      writeFileSync(idTagsFile, JSON.stringify(TEST_ID_TAGS))

      try {
        const cache = IdTagsCache.getInstance()
        const result = cache.getIdTags(idTagsFile)

        assert.deepStrictEqual(result, TEST_ID_TAGS)
        cache.deleteIdTags(idTagsFile)
      } finally {
        rmSync(tmpDir, { force: true, recursive: true })
      }
    })

    await it('should return empty array for empty file path', () => {
      const cache = IdTagsCache.getInstance()

      const result = cache.getIdTags('')

      assert.deepStrictEqual(result, [])
      cache.deleteIdTags('')
    })
  })

  await describe('getIdTag — ROUND_ROBIN', async () => {
    await it('should cycle through tags in round robin order', () => {
      const cache = IdTagsCache.getInstance()
      const { station } = createMockChargingStation({
        stationInfo: { idTagsFile: TEST_ID_TAGS_FILE },
      })
      const file = resolveIdTagsFile(station)
      populateCache(cache, file, TEST_ID_TAGS)

      const tag1 = cache.getIdTag(IdTagDistribution.ROUND_ROBIN, station, 1)
      const tag2 = cache.getIdTag(IdTagDistribution.ROUND_ROBIN, station, 1)
      const tag3 = cache.getIdTag(IdTagDistribution.ROUND_ROBIN, station, 1)

      assert.strictEqual(tag1, 'TAG-001')
      assert.strictEqual(tag2, 'TAG-002')
      assert.strictEqual(tag3, 'TAG-003')
    })

    await it('should wrap around when reaching end of tags', () => {
      const cache = IdTagsCache.getInstance()
      const { station } = createMockChargingStation({
        stationInfo: { idTagsFile: TEST_ID_TAGS_FILE },
      })
      const file = resolveIdTagsFile(station)
      populateCache(cache, file, TEST_ID_TAGS)

      cache.getIdTag(IdTagDistribution.ROUND_ROBIN, station, 1)
      cache.getIdTag(IdTagDistribution.ROUND_ROBIN, station, 1)
      cache.getIdTag(IdTagDistribution.ROUND_ROBIN, station, 1)

      const tag4 = cache.getIdTag(IdTagDistribution.ROUND_ROBIN, station, 1)

      assert.strictEqual(tag4, 'TAG-001')
    })
  })

  await describe('getIdTag — RANDOM', async () => {
    await it('should return a valid tag from the list with random distribution', () => {
      const cache = IdTagsCache.getInstance()
      const { station } = createMockChargingStation({
        stationInfo: { idTagsFile: TEST_ID_TAGS_FILE },
      })
      const file = resolveIdTagsFile(station)
      populateCache(cache, file, TEST_ID_TAGS)

      const results = new Set<string>()
      for (let i = 0; i < 20; i++) {
        results.add(cache.getIdTag(IdTagDistribution.RANDOM, station, 1))
      }

      for (const tag of results) {
        assert.ok(TEST_ID_TAGS.includes(tag))
      }
    })
  })

  await describe('getIdTag — CONNECTOR_AFFINITY', async () => {
    await it('should return deterministic tag based on station index and connector id', () => {
      const cache = IdTagsCache.getInstance()
      const { station } = createMockChargingStation({
        index: 1,
        stationInfo: { idTagsFile: TEST_ID_TAGS_FILE },
      })
      const file = resolveIdTagsFile(station)
      populateCache(cache, file, TEST_ID_TAGS)

      // index=1, connectorId=1: (1-1 + (1-1)) % 3 = 0 → TAG-001
      const tag = cache.getIdTag(IdTagDistribution.CONNECTOR_AFFINITY, station, 1)

      assert.strictEqual(tag, 'TAG-001')
    })

    await it('should return different tags for different connectors', () => {
      const cache = IdTagsCache.getInstance()
      const { station } = createMockChargingStation({
        index: 1,
        stationInfo: { idTagsFile: TEST_ID_TAGS_FILE },
      })
      const file = resolveIdTagsFile(station)
      populateCache(cache, file, TEST_ID_TAGS)

      // index=1, connectorId=1: (1-1 + (1-1)) % 3 = 0 → TAG-001
      const tag1 = cache.getIdTag(IdTagDistribution.CONNECTOR_AFFINITY, station, 1)
      // index=1, connectorId=2: (1-1 + (2-1)) % 3 = 1 → TAG-002
      const tag2 = cache.getIdTag(IdTagDistribution.CONNECTOR_AFFINITY, station, 2)

      assert.strictEqual(tag1, 'TAG-001')
      assert.strictEqual(tag2, 'TAG-002')
    })
  })

  await describe('deleteIdTags', async () => {
    await it('should remove cached id tags', () => {
      const cache = IdTagsCache.getInstance()
      const file = '/test/path/idtags.json'
      populateCache(cache, file, TEST_ID_TAGS)

      const result = cache.deleteIdTags(file)

      assert.strictEqual(result, true)
      const internal = cache as unknown as IdTagsCacheInternal
      assert.strictEqual(internal.idTagsCaches.has(file), false)
    })

    await it('should remove addressable indexes on delete', () => {
      const cache = IdTagsCache.getInstance()
      const { station } = createMockChargingStation({
        stationInfo: { idTagsFile: TEST_ID_TAGS_FILE },
      })
      const file = resolveIdTagsFile(station)
      populateCache(cache, file, TEST_ID_TAGS)

      cache.getIdTag(IdTagDistribution.ROUND_ROBIN, station, 1)

      const internal = cache as unknown as IdTagsCacheInternal
      const indexKeysBefore = [...internal.idTagsCachesAddressableIndexes.keys()].filter(key =>
        key.startsWith(file)
      )
      assert.strictEqual(indexKeysBefore.length, 1)

      cache.deleteIdTags(file)

      const indexKeysAfter = [...internal.idTagsCachesAddressableIndexes.keys()].filter(key =>
        key.startsWith(file)
      )
      assert.strictEqual(indexKeysAfter.length, 0)
    })
  })
})
