/**
 * @file Tests for FileUtils
 * @description Unit tests for file watching utility functions
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, type WatchListener, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'

import { FileType } from '../../src/types/index.js'
import { watchJsonFile } from '../../src/utils/FileUtils.js'
import { logger } from '../../src/utils/index.js'
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

    assert.strictEqual(result, undefined)
    assert.strictEqual(infoMock.mock.calls.length, 1)
  })

  await it('should include file type and log prefix in info log message for empty path', t => {
    const infoMock = t.mock.method(logger, 'info')

    watchJsonFile('', FileType.ChargingStationConfiguration, 'CS-001 |', noop)

    assert.strictEqual(infoMock.mock.calls.length, 1)
    const logMessage = infoMock.mock.calls[0].arguments[0] as unknown as string
    assert.ok(logMessage.includes(FileType.ChargingStationConfiguration))
    assert.ok(logMessage.includes('CS-001 |'))
  })

  await it('should handle watch error and return undefined for nonexistent file', t => {
    const { warnMock } = createLoggerMocks(t, logger)

    const result = watchJsonFile(
      '/nonexistent/path/to/file.json',
      FileType.Authorization,
      'test prefix |',
      noop
    )

    assert.strictEqual(result, undefined)
    assert.strictEqual(warnMock.mock.calls.length, 1)
  })

  await it('should return FSWatcher for valid file path', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'fileutils-test-'))
    const tmpFile = join(tmpDir, 'test.json')
    writeFileSync(tmpFile, '{}')

    try {
      const result = watchJsonFile(tmpFile, FileType.Authorization, 'test |', noop)

      assert.notStrictEqual(result, undefined)
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

      assert.notStrictEqual(result, undefined)
      assert.strictEqual(typeof result?.close, 'function')
      result?.close()
      assert.strictEqual(receivedEvent, false)
    } finally {
      rmSync(tmpDir, { recursive: true })
    }
  })
})
