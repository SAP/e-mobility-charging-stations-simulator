/**
 * @file Unit tests for CLI lifecycle and error types
 * @description Tests for connection lifecycle management and error handling
 */

import assert from 'node:assert'
import { describe, it } from 'node:test'

import { ConnectionError } from '../src/client/errors.js'
import { executeCommand } from '../src/client/lifecycle.js'

await describe('lifecycle', async () => {
  await it('should create ConnectionError with url', () => {
    const err = new ConnectionError('ws://localhost:8080')
    assert.strictEqual(err.name, 'ConnectionError')
    assert.strictEqual(err.url, 'ws://localhost:8080')
    assert.ok(err.message.includes('ws://localhost:8080'))
  })

  await it('should create ConnectionError with cause', () => {
    const cause = new Error('ECONNREFUSED')
    const err = new ConnectionError('ws://localhost:8080', cause)
    assert.strictEqual(err.cause, cause)
  })

  await it('should export executeCommand function', () => {
    assert.strictEqual(typeof executeCommand, 'function')
  })
})
