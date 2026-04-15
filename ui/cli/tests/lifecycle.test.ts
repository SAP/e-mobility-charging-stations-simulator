import assert from 'node:assert'
import { describe, it } from 'node:test'

import { ConnectionError } from '../src/client/errors.js'

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
})
