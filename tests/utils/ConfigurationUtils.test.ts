/**
 * @file Tests for ConfigurationUtils
 * @description Unit tests for configuration utility functions
 */
import { expect } from '@std/expect'
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
    expect(logPrefix()).toContain(' Simulator configuration |')
  })

  await it('should build file URI path for performance storage', () => {
    const result = buildPerformanceUriFilePath('test.json')
    expect(result).toContain('test.json')
    expect(result).toMatch(/^file:\/\/.*test\.json$/)
  })

  await it('should return appropriate URI for storage types', () => {
    // Test JSON_FILE storage type
    const jsonUri = getDefaultPerformanceStorageUri(StorageType.JSON_FILE)
    expect(jsonUri).toMatch(/^file:\/\/.*\.json$/)
    expect(jsonUri).toContain('performanceRecords.json')

    // Test SQLITE storage type
    const sqliteUri = getDefaultPerformanceStorageUri(StorageType.SQLITE)
    expect(sqliteUri).toMatch(/^file:\/\/.*\.db$/)
    expect(sqliteUri).toContain('charging-stations-simulator.db')

    // Test unsupported storage type
    expect(() => {
      getDefaultPerformanceStorageUri('unsupported' as StorageType)
    }).toThrow(Error)
  })

  await it('should validate worker elements per worker configuration', () => {
    // These calls should not throw exceptions
    expect(() => {
      checkWorkerElementsPerWorker(undefined)
    }).not.toThrow()
    expect(() => {
      checkWorkerElementsPerWorker('auto')
    }).not.toThrow()
    expect(() => {
      checkWorkerElementsPerWorker('all')
    }).not.toThrow()
    expect(() => {
      checkWorkerElementsPerWorker(4)
    }).not.toThrow()

    // These calls should throw exceptions
    expect(() => {
      checkWorkerElementsPerWorker(0)
    }).toThrow(RangeError)
    expect(() => {
      checkWorkerElementsPerWorker(-1)
    }).toThrow(RangeError)
    expect(() => {
      checkWorkerElementsPerWorker(1.5)
    }).toThrow(SyntaxError)
  })
})
