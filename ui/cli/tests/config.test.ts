import assert from 'node:assert'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { DEFAULT_HOST, DEFAULT_PORT, DEFAULT_PROTOCOL, DEFAULT_PROTOCOL_VERSION, DEFAULT_SECURE } from 'ui-common'

import { loadConfig } from '../src/config/loader.js'

let tempDir: string
let originalXdgConfigHome: string | undefined

await describe('CLI config loader', async () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'evse-cli-test-'))
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME
    process.env.XDG_CONFIG_HOME = tempDir
  })

  afterEach(async () => {
    if (originalXdgConfigHome != null) {
      process.env.XDG_CONFIG_HOME = originalXdgConfigHome
    } else {
      delete process.env.XDG_CONFIG_HOME
    }
    await rm(tempDir, { force: true, recursive: true })
  })

  await it('should use defaults when no config file exists', async () => {
    const config = await loadConfig()
    assert.strictEqual(config.host, DEFAULT_HOST)
    assert.strictEqual(config.port, DEFAULT_PORT)
    assert.strictEqual(config.protocol, DEFAULT_PROTOCOL)
    assert.strictEqual(config.version, DEFAULT_PROTOCOL_VERSION)
    assert.strictEqual(config.secure, DEFAULT_SECURE)
  })

  await it('should load config from XDG default path', async () => {
    const configDir = join(tempDir, 'evse-cli')
    await mkdir(configDir, { recursive: true })
    await writeFile(
      join(configDir, 'config.json'),
      JSON.stringify({
        uiServer: {
          host: 'xdg-host.example.com',
          port: 7777,
          protocol: 'ui',
          version: '0.0.1',
        },
      })
    )
    const config = await loadConfig()
    assert.strictEqual(config.host, 'xdg-host.example.com')
    assert.strictEqual(config.port, 7777)
  })

  await it('should load config from explicit path', async () => {
    const configFile = join(tempDir, 'config.json')
    await writeFile(
      configFile,
      JSON.stringify({
        uiServer: {
          host: 'remote-server.example.com',
          port: 9090,
          protocol: 'ui',
          version: '0.0.1',
        },
      })
    )
    const config = await loadConfig({ configPath: configFile })
    assert.strictEqual(config.host, 'remote-server.example.com')
    assert.strictEqual(config.port, 9090)
  })

  await it('should throw on explicit path that does not exist', async () => {
    await assert.rejects(async () => loadConfig({ configPath: '/nonexistent/config.json' }), {
      message: /Failed to load configuration file/,
    })
  })

  await it('should throw on malformed JSON in config file', async () => {
    const configFile = join(tempDir, 'bad.json')
    await writeFile(configFile, '{invalid json')
    await assert.rejects(async () => loadConfig({ configPath: configFile }), {
      message: /Failed to load configuration file/,
    })
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

  await it('should merge config file with CLI overrides', async () => {
    const configFile = join(tempDir, 'config.json')
    await writeFile(
      configFile,
      JSON.stringify({
        uiServer: {
          host: 'file-host.example.com',
          port: 7070,
          protocol: 'ui',
          version: '0.0.1',
        },
      })
    )
    const config = await loadConfig({
      configPath: configFile,
      url: 'ws://override-host:8888',
    })
    assert.strictEqual(config.host, 'override-host')
    assert.strictEqual(config.port, 8888)
    assert.strictEqual(config.protocol, 'ui')
  })
})
