/** @file Unit tests for CLI lifecycle and error types */

import assert from 'node:assert'
import { describe, it } from 'node:test'
import { Protocol, ProtocolVersion } from 'ui-common'

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

  await it('should create ConnectionError without cause suffix when cause message is empty', () => {
    const err = new ConnectionError('ws://localhost:8080', new Error(''))
    assert.strictEqual(err.message, 'Failed to connect to ws://localhost:8080')
  })

  await it('should create ConnectionError without cause suffix when cause is not an Error', () => {
    const err = new ConnectionError('ws://localhost:8080', 'string cause')
    assert.strictEqual(err.message, 'Failed to connect to ws://localhost:8080')
    assert.strictEqual(err.cause, 'string cause')
  })

  await it('should export executeCommand function', () => {
    assert.strictEqual(typeof executeCommand, 'function')
  })

  await it('should reject executeCommand with NaN timeout', async () => {
    await assert.rejects(
      executeCommand({
        config: {
          host: 'localhost',
          port: 8080,
          protocol: Protocol.UI,
          version: ProtocolVersion['0.0.1'],
        },
        formatter: { error: () => undefined, output: () => undefined },
        payload: {},
        procedureName: 'listChargingStations' as never,
        timeoutMs: Number.NaN,
      }),
      (error: Error) => {
        assert.ok(error.message.includes('Invalid timeout'))
        assert.ok(error.message.includes('NaN'))
        return true
      }
    )
  })
})
