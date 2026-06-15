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

  await it('should reject config with protocol not in Protocol enum', () => {
    const result = uiServerConfigSchema.safeParse({
      host: 'localhost',
      port: 8080,
      protocol: 'ws',
      version: '0.0.1',
    })
    assert.strictEqual(result.success, false)
  })

  await it('should reject config with version not in ProtocolVersion enum', () => {
    const result = uiServerConfigSchema.safeParse({
      host: 'localhost',
      port: 8080,
      protocol: 'ui',
      version: '2.0',
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
    const paths = result.error.issues.map(i => i.path.join('.'))
    assert.ok(
      paths.includes('authentication.username'),
      `Expected error path 'authentication.username' in ${JSON.stringify(paths)}`
    )
    assert.ok(
      paths.includes('authentication.password'),
      `Expected error path 'authentication.password' in ${JSON.stringify(paths)}`
    )
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
    const paths = result.error.issues.map(i => i.path.join('.'))
    assert.ok(
      paths.includes('authentication.username'),
      `Expected error path 'authentication.username' in ${JSON.stringify(paths)}`
    )
  })

  await it('should reject auth config when enabled with protocol-basic-auth but empty password', () => {
    const result = uiServerConfigSchema.safeParse({
      authentication: {
        enabled: true,
        password: '',
        type: 'protocol-basic-auth',
        username: 'admin',
      },
      host: 'localhost',
      port: 8080,
      protocol: 'ui',
      version: '0.0.1',
    })
    assert.strictEqual(result.success, false)
    const paths = result.error.issues.map(i => i.path.join('.'))
    assert.ok(
      paths.includes('authentication.password'),
      `Expected error path 'authentication.password' in ${JSON.stringify(paths)}`
    )
  })

  await it("should reject auth config when username contains ':' (RFC 7617)", () => {
    const result = uiServerConfigSchema.safeParse({
      authentication: {
        enabled: true,
        password: 'admin',
        type: 'protocol-basic-auth',
        username: 'a:b',
      },
      host: 'localhost',
      port: 8080,
      protocol: 'ui',
      version: '0.0.1',
    })
    assert.strictEqual(result.success, false)
    const usernameIssues = result.error.issues.filter(
      i => i.path.join('.') === 'authentication.username'
    )
    assert.ok(usernameIssues.length > 0)
    assert.ok(
      usernameIssues.some(i => i.message.includes('RFC 7617')),
      `Expected an issue mentioning 'RFC 7617' in ${JSON.stringify(usernameIssues)}`
    )
  })

  await it('should reject auth config when enabled with password but no username', () => {
    const result = uiServerConfigSchema.safeParse({
      authentication: {
        enabled: true,
        password: 'admin',
        type: 'protocol-basic-auth',
      },
      host: 'localhost',
      port: 8080,
      protocol: 'ui',
      version: '0.0.1',
    })
    assert.strictEqual(result.success, false)
    const paths = result.error.issues.map(i => i.path.join('.'))
    assert.ok(
      paths.includes('authentication.username'),
      `Expected error path 'authentication.username' in ${JSON.stringify(paths)}`
    )
  })

  await it('should reject auth config when enabled with username but no password', () => {
    const result = uiServerConfigSchema.safeParse({
      authentication: {
        enabled: true,
        type: 'protocol-basic-auth',
        username: 'admin',
      },
      host: 'localhost',
      port: 8080,
      protocol: 'ui',
      version: '0.0.1',
    })
    assert.strictEqual(result.success, false)
    const paths = result.error.issues.map(i => i.path.join('.'))
    assert.ok(
      paths.includes('authentication.password'),
      `Expected error path 'authentication.password' in ${JSON.stringify(paths)}`
    )
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
