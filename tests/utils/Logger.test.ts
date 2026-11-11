/**
 * @file Tests for Logger
 * @description Unit tests for the daily rotated log file name pattern.
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { getRotatingLogFileName } from '../../src/utils/index.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

await describe('Logger', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await it('should insert the date placeholder before the .log extension', () => {
    assert.strictEqual(getRotatingLogFileName('logs/combined.log'), 'logs/combined-%DATE%.log')
    assert.strictEqual(getRotatingLogFileName('error.log'), 'error-%DATE%.log')
    assert.strictEqual(
      getRotatingLogFileName('/var/log/combined.log'),
      '/var/log/combined-%DATE%.log'
    )
  })

  await it('should insert the date placeholder before any other file extension', () => {
    assert.strictEqual(getRotatingLogFileName('logs/combined.txt'), 'logs/combined-%DATE%.txt')
    assert.strictEqual(getRotatingLogFileName('logs/combined.json'), 'logs/combined-%DATE%.json')
  })

  await it('should append the date placeholder when the file has no extension', () => {
    assert.strictEqual(getRotatingLogFileName('logs/combined'), 'logs/combined-%DATE%')
  })

  await it('should only change the file name, not the directories', () => {
    assert.strictEqual(
      getRotatingLogFileName('logs/simulator.logs/combined.log'),
      'logs/simulator.logs/combined-%DATE%.log'
    )
    assert.strictEqual(getRotatingLogFileName('my.log.dir/combined'), 'my.log.dir/combined-%DATE%')
  })

  await it('should ignore trailing separators on configured log file paths', () => {
    assert.strictEqual(getRotatingLogFileName('logs/combined.log/'), 'logs/combined-%DATE%.log')
    assert.strictEqual(getRotatingLogFileName('logs/errors.txt/////'), 'logs/errors-%DATE%.txt')
  })

  await it('should keep earlier extensions in the file name', () => {
    assert.strictEqual(
      getRotatingLogFileName('logs/archive.log.txt'),
      'logs/archive.log-%DATE%.txt'
    )
  })

  await it('should treat a dotfile without another dot as a file without an extension', () => {
    assert.strictEqual(getRotatingLogFileName('logs/.log'), 'logs/.log-%DATE%')
  })
})
