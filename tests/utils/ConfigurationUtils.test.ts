/**
 * @file Tests for ConfigurationUtils
 * @description Unit tests for configuration utility functions
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { StorageType } from '../../src/types/index.js'
import {
  buildPerformanceUriFilePath,
  checkWorkerElementsPerWorker,
  getDefaultPerformanceStorageUri,
  logPrefix,
} from '../../src/utils/ConfigurationUtils.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

await describe('ConfigurationUtils', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await it('should return log prefix with simulator configuration', () => {
    assert.ok(logPrefix().includes(' Simulator configuration |'))
  })

  await it('should build file URI path for performance storage', () => {
    const result = buildPerformanceUriFilePath('test.json')
    assert.ok(result.includes('test.json'))
    assert.match(result, /^file:\/\/.*test\.json$/)
  })

  await it('should return appropriate URI for storage types', () => {
    // Test JSON_FILE storage type
    const jsonUri = getDefaultPerformanceStorageUri(StorageType.JSON_FILE)
    assert.match(jsonUri, /^file:\/\/.*\.json$/)
    assert.ok(jsonUri.includes('performanceRecords.json'))

    // Test SQLITE storage type
    const sqliteUri = getDefaultPerformanceStorageUri(StorageType.SQLITE)
    assert.match(sqliteUri, /^file:\/\/.*\.db$/)
    assert.ok(sqliteUri.includes('charging-stations-simulator.db'))

    // Test unsupported storage type
    assert.throws(() => {
      getDefaultPerformanceStorageUri('unsupported' as StorageType)
    }, Error)
  })

  await it('should validate worker elements per worker configuration', () => {
    // These calls should not throw exceptions
    assert.doesNotThrow(() => {
      checkWorkerElementsPerWorker(undefined)
    })
    assert.doesNotThrow(() => {
      checkWorkerElementsPerWorker('auto')
    })
    assert.doesNotThrow(() => {
      checkWorkerElementsPerWorker('all')
    })
    assert.doesNotThrow(() => {
      checkWorkerElementsPerWorker(4)
    })

    // These calls should throw exceptions
    assert.throws(() => {
      checkWorkerElementsPerWorker(0)
    }, RangeError)
    assert.throws(() => {
      checkWorkerElementsPerWorker(-1)
    }, RangeError)
    assert.throws(() => {
      checkWorkerElementsPerWorker(1.5)
    }, SyntaxError)
  })
})
