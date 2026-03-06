/**
 * @file Tests for FileUtils
 * @description Unit tests for file watching utility functions
 */
import { expect } from '@std/expect'
import { mkdtempSync, rmSync, type WatchListener, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'

import { FileType } from '../../src/types/index.js'
import { watchJsonFile } from '../../src/utils/FileUtils.js'
import { logger } from '../../src/utils/Logger.js'
import { createLoggerMocks, standardCleanup } from '../helpers/TestLifecycleHelpers.js'

const noop: WatchListener<string> = () => {
  /* intentionally empty */
}

await describe('FileUtils', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await it('should return undefined and log info for empty file path', t => {
    const infoMock = t.mock.method(logger, 'info')

    const result = watchJsonFile('', FileType.Authorization, 'test prefix |', noop)

    expect(result).toBeUndefined()
    expect(infoMock.mock.calls.length).toBe(1)
  })

  await it('should include file type and log prefix in info log message for empty path', t => {
    const infoMock = t.mock.method(logger, 'info')

    watchJsonFile('', FileType.ChargingStationConfiguration, 'CS-001 |', noop)

    expect(infoMock.mock.calls.length).toBe(1)
    const logMessage = infoMock.mock.calls[0].arguments[0] as unknown as string
    expect(logMessage.includes(FileType.ChargingStationConfiguration)).toBe(true)
    expect(logMessage.includes('CS-001 |')).toBe(true)
  })

  await it('should handle watch error and return undefined for nonexistent file', t => {
    const { warnMock } = createLoggerMocks(t, logger)

    const result = watchJsonFile(
      '/nonexistent/path/to/file.json',
      FileType.Authorization,
      'test prefix |',
      noop
    )

    expect(result).toBeUndefined()
    expect(warnMock.mock.calls.length).toBe(1)
  })

  await it('should return FSWatcher for valid file path', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'fileutils-test-'))
    const tmpFile = join(tmpDir, 'test.json')
    writeFileSync(tmpFile, '{}')

    try {
      const result = watchJsonFile(tmpFile, FileType.Authorization, 'test |', noop)

      expect(result).toBeDefined()
      result?.close()
    } finally {
      rmSync(tmpDir, { recursive: true })
    }
  })

  await it('should call watch with file and listener arguments', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'fileutils-test-'))
    const tmpFile = join(tmpDir, 'test.json')
    writeFileSync(tmpFile, '{}')

    try {
      let receivedEvent = false
      const listener: WatchListener<string> = () => {
        receivedEvent = true
      }

      const result = watchJsonFile(tmpFile, FileType.Authorization, 'test |', listener)

      expect(result).toBeDefined()
      expect(typeof result?.close).toBe('function')
      result?.close()
      expect(receivedEvent).toBe(false)
    } finally {
      rmSync(tmpDir, { recursive: true })
    }
  })
})
