import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import { FileType, StorageType } from '../../src/types/index.js'
import {
  buildPerformanceUriFilePath,
  checkWorkerElementsPerWorker,
  getDefaultPerformanceStorageUri,
  handleFileException,
  logPrefix,
} from '../../src/utils/ConfigurationUtils.js'

await describe('ConfigurationUtils test suite', async () => {
  await it('Verify logPrefix()', () => {
    expect(logPrefix()).toContain(' Simulator configuration |')
  })

  await it('Verify buildPerformanceUriFilePath()', () => {
    const result = buildPerformanceUriFilePath('test.json')
    expect(result).toContain('test.json')
    expect(result).toMatch(/^file:\/\/.*test\.json$/)
  })

  await it('Verify getDefaultPerformanceStorageUri()', () => {
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

  await it('Verify handleFileException()', t => {
    const mockConsoleError = t.mock.method(console, 'error')
    const error = new Error() as NodeJS.ErrnoException
    error.code = 'ENOENT'
    expect(() => {
      handleFileException('path/to/module.js', FileType.Authorization, error, 'log prefix |')
    }).toThrow(error)
    expect(mockConsoleError.mock.calls.length).toBe(1)
  })

  await it('Verify checkWorkerElementsPerWorker()', () => {
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
