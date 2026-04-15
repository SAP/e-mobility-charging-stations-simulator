import assert from 'node:assert'
import { describe, it } from 'node:test'

import { configurationSchema, uiServerConfigSchema } from '../src/config/schema.js'

await describe('config schema validation', async () => {
  await it('should validate a minimal valid config', () => {
    const result = uiServerConfigSchema.safeParse({
      host: 'localhost',
      port: 8080,
      protocol: 'ui',
      version: '0.0.1',
    })
    assert.strictEqual(result.success, true)
  })

  await it('should reject config with empty protocol', () => {
    const result = uiServerConfigSchema.safeParse({
      host: 'localhost',
      port: 8080,
      protocol: '',
      version: '0.0.1',
    })
    assert.strictEqual(result.success, false)
  })

  await it('should reject missing required host field', () => {
    const result = uiServerConfigSchema.safeParse({
      port: 8080,
      protocol: 'ui',
      version: '0.0.1',
    })
    assert.strictEqual(result.success, false)
  })

  await it('should reject invalid port number', () => {
    const result = uiServerConfigSchema.safeParse({
      host: 'localhost',
      port: 99999,
    })
    assert.strictEqual(result.success, false)
  })

  await it('should reject empty host string', () => {
    const result = uiServerConfigSchema.safeParse({
      host: '',
      port: 8080,
      protocol: 'ui',
      version: '0.0.1',
    })
    assert.strictEqual(result.success, false)
  })

  await it('should validate full config with authentication', () => {
    const result = uiServerConfigSchema.safeParse({
      authentication: {
        enabled: true,
        password: 'admin',
        type: 'protocol-basic-auth',
        username: 'admin',
      },
      host: 'simulator.example.com',
      name: 'My Simulator',
      port: 8080,
      protocol: 'ui',
      secure: true,
      version: '0.0.1',
    })
    assert.strictEqual(result.success, true)
  })

  await it('should validate configuration with array of servers', () => {
    const result = configurationSchema.safeParse({
      uiServer: [
        { host: 'server1.example.com', port: 8080, protocol: 'ui', version: '0.0.1' },
        { host: 'server2.example.com', port: 8080, protocol: 'ui', version: '0.0.1' },
      ],
    })
    assert.strictEqual(result.success, true)
  })

  await it('should validate configuration with single server', () => {
    const result = configurationSchema.safeParse({
      uiServer: { host: 'localhost', port: 8080, protocol: 'ui', version: '0.0.1' },
    })
    assert.strictEqual(result.success, true)
  })

  await it('should reject auth config when enabled with protocol-basic-auth but missing credentials', () => {
    const result = uiServerConfigSchema.safeParse({
      authentication: {
        enabled: true,
        type: 'protocol-basic-auth',
      },
      host: 'localhost',
      port: 8080,
      protocol: 'ui',
      version: '0.0.1',
    })
    assert.strictEqual(result.success, false)
  })

  await it('should reject auth config when enabled with protocol-basic-auth but empty username', () => {
    const result = uiServerConfigSchema.safeParse({
      authentication: {
        enabled: true,
        password: 'admin',
        type: 'protocol-basic-auth',
        username: '',
      },
      host: 'localhost',
      port: 8080,
      protocol: 'ui',
      version: '0.0.1',
    })
    assert.strictEqual(result.success, false)
  })

  await it('should accept auth config when enabled with protocol-basic-auth and credentials present', () => {
    const result = uiServerConfigSchema.safeParse({
      authentication: {
        enabled: true,
        password: 'admin',
        type: 'protocol-basic-auth',
        username: 'admin',
      },
      host: 'localhost',
      port: 8080,
      protocol: 'ui',
      version: '0.0.1',
    })
    assert.strictEqual(result.success, true)
  })

  await it('should accept auth config when disabled with protocol-basic-auth and no credentials', () => {
    const result = uiServerConfigSchema.safeParse({
      authentication: {
        enabled: false,
        type: 'protocol-basic-auth',
      },
      host: 'localhost',
      port: 8080,
      protocol: 'ui',
      version: '0.0.1',
    })
    assert.strictEqual(result.success, true)
  })
})
