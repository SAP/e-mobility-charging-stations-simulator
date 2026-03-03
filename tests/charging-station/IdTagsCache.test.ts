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

import { expect } from '@std/expect'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/ChargingStation.js'

import { getIdTagsFile } from '../../src/charging-station/Helpers.js'
import { IdTagsCache } from '../../src/charging-station/IdTagsCache.js'
import { IdTagDistribution } from '../../src/types/index.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'
import { createMockChargingStation } from './ChargingStationTestUtils.js'

const TEST_ID_TAGS = ['TAG-001', 'TAG-002', 'TAG-003']
const TEST_ID_TAGS_FILE = 'test-idtags.json'

interface IdTagsCacheInternal {
  idTagsCaches: Map<string, { idTags: string[]; idTagsFileWatcher: unknown }>
  idTagsCachesAddressableIndexes: Map<string, number>
}

/**
 *
 * @param cache
 * @param file
 * @param idTags
 */
function populateCache (cache: IdTagsCache, file: string, idTags: string[]): void {
  const internal = cache as unknown as IdTagsCacheInternal
  internal.idTagsCaches.set(file, { idTags, idTagsFileWatcher: undefined })
}

/**
 *
 */
function resetIdTagsCache (): void {
  ;(IdTagsCache as unknown as { instance: null }).instance = null
}

/**
 *
 * @param station
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

      expect(instance1).toBe(instance2)
    })

    await it('should create new instance after reset', () => {
      const instance1 = IdTagsCache.getInstance()
      resetIdTagsCache()
      const instance2 = IdTagsCache.getInstance()

      expect(instance1 === instance2).toBe(false)
    })
  })

  await describe('getIdTags', async () => {
    await it('should return cached id tags when cache is populated', () => {
      const cache = IdTagsCache.getInstance()
      const file = '/test/path/idtags.json'
      populateCache(cache, file, TEST_ID_TAGS)

      const result = cache.getIdTags(file)

      expect(result).toStrictEqual(TEST_ID_TAGS)
    })

    await it('should load id tags from file when cache is empty', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'idtags-test-'))
      const idTagsFile = join(tmpDir, 'idtags.json')
      writeFileSync(idTagsFile, JSON.stringify(TEST_ID_TAGS))

      try {
        const cache = IdTagsCache.getInstance()
        const result = cache.getIdTags(idTagsFile)

        expect(result).toStrictEqual(TEST_ID_TAGS)
        cache.deleteIdTags(idTagsFile)
      } finally {
        rmSync(tmpDir, { force: true, recursive: true })
      }
    })

    await it('should return empty array for empty file path', () => {
      const cache = IdTagsCache.getInstance()

      const result = cache.getIdTags('')

      expect(result).toStrictEqual([])
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

      expect(tag1).toBe('TAG-001')
      expect(tag2).toBe('TAG-002')
      expect(tag3).toBe('TAG-003')
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

      expect(tag4).toBe('TAG-001')
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
        expect(TEST_ID_TAGS.includes(tag)).toBe(true)
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

      expect(tag).toBe('TAG-001')
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

      expect(tag1).toBe('TAG-001')
      expect(tag2).toBe('TAG-002')
    })
  })

  await describe('deleteIdTags', async () => {
    await it('should remove cached id tags', () => {
      const cache = IdTagsCache.getInstance()
      const file = '/test/path/idtags.json'
      populateCache(cache, file, TEST_ID_TAGS)

      const result = cache.deleteIdTags(file)

      expect(result).toBe(true)
      const internal = cache as unknown as IdTagsCacheInternal
      expect(internal.idTagsCaches.has(file)).toBe(false)
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
      expect(indexKeysBefore.length).toBe(1)

      cache.deleteIdTags(file)

      const indexKeysAfter = [...internal.idTagsCachesAddressableIndexes.keys()].filter(key =>
        key.startsWith(file)
      )
      expect(indexKeysAfter.length).toBe(0)
    })
  })
})
