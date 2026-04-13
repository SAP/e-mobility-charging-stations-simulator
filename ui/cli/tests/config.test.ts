import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  DEFAULT_PROTOCOL,
  DEFAULT_SECURE,
  DEFAULT_VERSION,
} from '../src/config/defaults.js'
import { loadConfig } from '../src/config/loader.js'

await describe('CLI config loader', async () => {
  await it('should use defaults when no config provided', async () => {
    const config = await loadConfig()
    assert.strictEqual(config.host, DEFAULT_HOST)
    assert.strictEqual(config.port, DEFAULT_PORT)
    assert.strictEqual(config.protocol, DEFAULT_PROTOCOL)
    assert.strictEqual(config.version, DEFAULT_VERSION)
    assert.strictEqual(config.secure, DEFAULT_SECURE)
  })

  await it('should apply CLI url override with highest priority', async () => {
    const config = await loadConfig({ url: 'ws://simulator.example.com:9090' })
    assert.strictEqual(config.host, 'simulator.example.com')
    assert.strictEqual(config.port, 9090)
    assert.strictEqual(config.secure, false)
  })

  await it('should detect secure connection from wss:// url', async () => {
    const config = await loadConfig({
      url: 'wss://simulator.example.com:443',
    })
    assert.strictEqual(config.secure, true)
    assert.strictEqual(config.host, 'simulator.example.com')
    assert.strictEqual(config.port, 443)
  })
})
