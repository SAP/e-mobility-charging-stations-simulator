/**
 * @file Tests for Logger
 * @description Unit tests for the daily rotated log file name pattern.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { getRotatingLogFileName } from '../../src/utils/Logger.js'

await describe('Logger', async () => {
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
})
