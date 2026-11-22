/**
 * @file Tests for Logger
 * @description Unit tests for the daily rotated log file name pattern and for the
 * delegation of the exported logger proxy to the live winston logger.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { afterEach, describe, it } from 'node:test'
import { promisify } from 'node:util'

import { CURRENT_CONFIGURATION_SCHEMA_VERSION } from '../../src/utils/ConfigurationMigrations.js'
import { getRotatingLogFileName } from '../../src/utils/Logger.js'
import { cleanupTempDirs, createTempDir, writeTempFile } from '../helpers/TempFiles.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

await describe('Logger', async () => {
  afterEach(() => {
    standardCleanup()
    cleanupTempDirs()
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

  await it('should preserve logger behavior with a configured transport', async () => {
    // Set the configuration before importing the logger in a fresh process.
    const assetsDir = createTempDir('logger-test-')
    writeTempFile(
      assetsDir,
      'config.json',
      JSON.stringify({
        $schemaVersion: CURRENT_CONFIGURATION_SCHEMA_VERSION,
        log: {
          console: true,
          errorFile: '',
          file: '',
          format: 'simple',
          level: 'warn',
        },
        stationTemplateUrls: [{ file: 'fixture.station-template.json', numberOfStations: 1 }],
      })
    )
    const loggerUrl = new URL('../../src/utils/Logger.js', import.meta.url).href
    const fixturePath = writeTempFile(
      assetsDir,
      'logger.mjs',
      `
import assert from 'node:assert/strict'
import { once } from 'node:events'

import { logger } from ${JSON.stringify(loggerUrl)}

const { error: prototypeError, isInfoEnabled } = Object.getPrototypeOf(logger)
assert.equal(isInfoEnabled(), false, 'prototype lookup must apply the configured warn level')
const firstLogger = prototypeError('prototype-first')
assert.equal(firstLogger.level, 'warn', 'the first detached prototype call must use configuration')
assert.equal(firstLogger, logger)

const [transport] = logger.transports
assert.ok(transport, 'the proxy must expose the configured transport')
assert.equal(logger.level, 'warn')
logger.silent = false

const child = logger.child({ childId: 'test-child' })
const sibling = logger.child({})
child.silent = true
child.level = 'debug'
assert.equal(logger.silent, false, 'setting child.silent must not change the root')
assert.equal(sibling.silent, false, 'setting child.silent must not change siblings')
assert.equal(logger.level, 'warn', 'changing a child level must not change the root')
assert.equal(child.level, 'debug')

child.silent = false
const childLogged = once(transport, 'logged')
child.error('child-record')
const [childRecord] = await childLogged
assert.equal(childRecord.childId, 'test-child')

const marker = 'logger-proxy-delegation-marker'
const logged = once(transport, 'logged')
const { error } = logger
const writer = error(marker)
const [record] = await logged
assert.equal(record.message, marker)
assert.equal(record.childId, undefined)

writer.remove(transport)
assert.equal(logger.listenerCount('data'), 0, 'removing a transport must detach its listener')
assert.equal(writer, logger)

logger.add(transport)
logger.silent = true
logger.on('drain', function removeTransport () {
  logger.off('drain', removeTransport)
  this.remove(transport)
})
const drained = once(logger, 'drain')
const queued = { level: 'warn', message: 'queued-record', [Symbol.for('level')]: 'warn' }
logger.cork()
for (let i = 1; i < logger.writableHighWaterMark; i++) {
  logger.write(queued)
}
assert.equal(logger.write(queued), false, 'corked writes must reach the high-water mark')
logger.uncork()
await drained
assert.equal(logger.transports.length, 0)
assert.equal(logger.listenerCount('data'), 0, 'removing a transport from drain must detach its pipe')

const key = Symbol('metadata')
Object.defineProperty(logger, key, { configurable: false, value: 'metadata' })
assert.equal(Object.getOwnPropertyDescriptor(logger, key).configurable, false)
assert.equal(logger[key], 'metadata')
Object.preventExtensions(logger)
assert.ok(Reflect.ownKeys(logger).includes(key))

// Configuration keeps a watcher open; all assertions have completed.
process.exit(0)
`
    )

    await promisify(execFile)(process.execPath, ['--import', 'tsx', fixturePath], {
      env: { ...process.env, EVSE_ASSETS_DIR: assetsDir, NODE_ENV: 'test' },
      timeout: 30_000,
    })
  })
})
