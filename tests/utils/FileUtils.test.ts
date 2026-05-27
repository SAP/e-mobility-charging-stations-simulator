/**
 * @file Tests for FileUtils
 * @description Unit tests for file watching and atomic file write utility functions.
 */
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  type WatchListener,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { FileType } from '../../src/types/index.js'
import { atomicWriteFile, atomicWriteFileSync, watchJsonFile } from '../../src/utils/index.js'
import { logger } from '../../src/utils/index.js'
import { createLoggerMocks, standardCleanup } from '../helpers/TestLifecycleHelpers.js'

const LOG_PREFIX = 'FileUtils-test |'

const noop: WatchListener<string> = () => {
  /* intentionally empty */
}

const listTmpArtifacts = (dir: string, baseName: string): string[] =>
  readdirSync(dir).filter(name => name.startsWith(`${baseName}.`) && name.endsWith('.tmp'))

await describe('FileUtils', async () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'fileutils-test-'))
  })

  afterEach(() => {
    standardCleanup()
    rmSync(tmpDir, { force: true, recursive: true })
  })

  await describe('watchJsonFile', async () => {
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
      const target = join(tmpDir, 'test.json')
      writeFileSync(target, '{}')

      const result = watchJsonFile(target, FileType.Authorization, 'test |', noop)

      assert.notStrictEqual(result, undefined)
      result?.close()
    })

    await it('should call watch with file and listener arguments', () => {
      const target = join(tmpDir, 'test.json')
      writeFileSync(target, '{}')

      let receivedEvent = false
      const listener: WatchListener<string> = () => {
        receivedEvent = true
      }

      const result = watchJsonFile(target, FileType.Authorization, 'test |', listener)

      assert.notStrictEqual(result, undefined)
      assert.strictEqual(typeof result?.close, 'function')
      result?.close()
      assert.strictEqual(receivedEvent, false)
    })
  })

  await describe('atomicWriteFileSync', async () => {
    await it('should write string content atomically and leave no temp file behind', () => {
      const target = join(tmpDir, 'output.json')

      atomicWriteFileSync(target, '{"ok":true}', FileType.SimulatorState, LOG_PREFIX)

      assert.strictEqual(readFileSync(target, 'utf8'), '{"ok":true}')
      assert.deepStrictEqual(listTmpArtifacts(tmpDir, 'output.json'), [])
    })

    await it('should write Uint8Array content atomically', () => {
      const target = join(tmpDir, 'binary.bin')
      const data = new Uint8Array([0x00, 0x01, 0x02, 0x03])

      atomicWriteFileSync(target, data, FileType.PerformanceRecords, LOG_PREFIX)

      assert.deepStrictEqual(new Uint8Array(readFileSync(target)), data)
    })

    await it('should overwrite an existing file atomically', () => {
      const target = join(tmpDir, 'existing.json')
      writeFileSync(target, 'old content', 'utf8')

      atomicWriteFileSync(target, 'new content', FileType.SimulatorState, LOG_PREFIX)

      assert.strictEqual(readFileSync(target, 'utf8'), 'new content')
    })

    await it('should create missing parent directories when ensureDir is enabled (default)', () => {
      const target = join(tmpDir, 'nested', 'deep', 'output.json')

      atomicWriteFileSync(target, '{}', FileType.SimulatorState, LOG_PREFIX)

      assert.strictEqual(existsSync(target), true)
      assert.strictEqual(readFileSync(target, 'utf8'), '{}')
    })

    await it('should fail and clean up the temp file when ensureDir is disabled and the parent does not exist', t => {
      const { errorMock } = createLoggerMocks(t, logger)
      const parent = join(tmpDir, 'missing-parent')
      const target = join(parent, 'output.json')

      assert.throws(
        () => {
          atomicWriteFileSync(target, '{}', FileType.SimulatorState, LOG_PREFIX, {
            ensureDir: false,
          })
        },
        { code: 'ENOENT' }
      )

      assert.strictEqual(existsSync(target), false)
      assert.strictEqual(existsSync(parent), false)
      assert.strictEqual(errorMock.mock.calls.length, 1)
    })

    await it('should not throw when errorParams.throwError is false', t => {
      const { errorMock, warnMock } = createLoggerMocks(t, logger)
      const target = join(tmpDir, 'missing-parent', 'output.json')

      assert.doesNotThrow(() => {
        atomicWriteFileSync(target, '{}', FileType.SimulatorState, LOG_PREFIX, {
          ensureDir: false,
          errorParams: { throwError: false },
        })
      })

      assert.strictEqual(existsSync(target), false)
      assert.strictEqual(warnMock.mock.calls.length, 1)
      assert.strictEqual(errorMock.mock.calls.length, 0)
    })

    await it('should support a custom encoding', () => {
      const target = join(tmpDir, 'latin1.txt')

      atomicWriteFileSync(target, 'café', FileType.Configuration, LOG_PREFIX, {
        encoding: 'latin1',
      })

      assert.strictEqual(readFileSync(target, 'latin1'), 'café')
    })
  })

  await describe('atomicWriteFile', async () => {
    await it('should write string content atomically and leave no temp file behind', async () => {
      const target = join(tmpDir, 'output.json')

      await atomicWriteFile(target, '{"ok":true}', FileType.SimulatorState, LOG_PREFIX)

      assert.strictEqual(readFileSync(target, 'utf8'), '{"ok":true}')
      assert.deepStrictEqual(listTmpArtifacts(tmpDir, 'output.json'), [])
    })

    await it('should overwrite an existing file atomically', async () => {
      const target = join(tmpDir, 'existing.json')
      writeFileSync(target, 'old content', 'utf8')

      await atomicWriteFile(target, 'new content', FileType.SimulatorState, LOG_PREFIX)

      assert.strictEqual(readFileSync(target, 'utf8'), 'new content')
    })

    await it('should create missing parent directories when ensureDir is enabled (default)', async () => {
      const target = join(tmpDir, 'nested', 'deep', 'output.json')

      await atomicWriteFile(target, '{}', FileType.SimulatorState, LOG_PREFIX)

      assert.strictEqual(existsSync(target), true)
      assert.strictEqual(readFileSync(target, 'utf8'), '{}')
    })

    await it('should fail and clean up the temp file when ensureDir is disabled and the parent does not exist', async t => {
      const { errorMock } = createLoggerMocks(t, logger)
      const parent = join(tmpDir, 'missing-parent')
      const target = join(parent, 'output.json')

      await assert.rejects(
        atomicWriteFile(target, '{}', FileType.SimulatorState, LOG_PREFIX, {
          ensureDir: false,
        }),
        { code: 'ENOENT' }
      )

      assert.strictEqual(existsSync(target), false)
      assert.strictEqual(existsSync(parent), false)
      assert.strictEqual(errorMock.mock.calls.length, 1)
    })

    await it('should not throw when errorParams.throwError is false', async t => {
      const { errorMock, warnMock } = createLoggerMocks(t, logger)
      const target = join(tmpDir, 'missing-parent', 'output.json')

      await assert.doesNotReject(
        atomicWriteFile(target, '{}', FileType.SimulatorState, LOG_PREFIX, {
          ensureDir: false,
          errorParams: { throwError: false },
        })
      )

      assert.strictEqual(existsSync(target), false)
      assert.strictEqual(warnMock.mock.calls.length, 1)
      assert.strictEqual(errorMock.mock.calls.length, 0)
    })

    await it('should support concurrent writes to distinct paths without temp-name collisions', async () => {
      const targets = Array.from({ length: 8 }, (_, i) =>
        join(tmpDir, `concurrent-${i.toString()}.txt`)
      )

      await Promise.all(
        targets.map(async (target, i) =>
          atomicWriteFile(target, `payload-${i.toString()}`, FileType.SimulatorState, LOG_PREFIX)
        )
      )

      for (const [i, target] of targets.entries()) {
        assert.strictEqual(readFileSync(target, 'utf8'), `payload-${i.toString()}`)
      }
      assert.deepStrictEqual(
        readdirSync(tmpDir).filter(name => name.endsWith('.tmp')),
        []
      )
    })

    await it('should leave the destination intact and clean up the temp file when rename fails', async () => {
      const target = join(tmpDir, 'preserved-dir')
      mkdirSync(target)
      mkdirSync(join(target, 'child'))

      await assert.rejects(
        atomicWriteFile(target, 'NEW', FileType.SimulatorState, LOG_PREFIX),
        (err: NodeJS.ErrnoException) =>
          err.code === 'EISDIR' || err.code === 'ENOTEMPTY' || err.code === 'EPERM'
      )

      assert.ok(statSync(target).isDirectory(), 'target directory must remain intact')
      assert.deepStrictEqual(
        readdirSync(tmpDir).filter(name => name.endsWith('.tmp')),
        [],
        'temp file should be cleaned up after rename failure'
      )
    })
  })
})
