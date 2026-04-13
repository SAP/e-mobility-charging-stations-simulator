import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  AuthenticationError,
  ConnectionError,
  ServerError,
  TimeoutError,
} from '../src/client/errors.js'

await describe('CLI error types', async () => {
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

  await it('should create TimeoutError with procedure name', () => {
    const err = new TimeoutError('simulatorState', 60000)
    assert.strictEqual(err.name, 'TimeoutError')
    assert.strictEqual(err.procedureName, 'simulatorState')
    assert.strictEqual(err.timeoutMs, 60000)
  })

  await it('should create ServerError with payload', () => {
    const payload = { status: 'failure' }
    const err = new ServerError(payload)
    assert.strictEqual(err.name, 'ServerError')
    assert.deepStrictEqual(err.payload, payload)
  })

  await it('should create AuthenticationError', () => {
    const err = new AuthenticationError('ws://localhost:8080')
    assert.strictEqual(err.name, 'AuthenticationError')
    assert.ok(err.message.includes('ws://localhost:8080'))
  })
})
