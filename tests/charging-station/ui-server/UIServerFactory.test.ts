/**
 * @file Tests for UIServerFactory
 * @description Unit tests for UI server factory and protocol-specific server creation
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { UIHttpServer } from '../../../src/charging-station/ui-server/UIHttpServer.js'
import { UIMCPServer } from '../../../src/charging-station/ui-server/UIMCPServer.js'
import { UIServerFactory } from '../../../src/charging-station/ui-server/UIServerFactory.js'
import { UIWebSocketServer } from '../../../src/charging-station/ui-server/UIWebSocketServer.js'
import { ApplicationProtocol, ApplicationProtocolVersion } from '../../../src/types/index.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'
import { createMockBootstrap, createMockUIServerConfiguration } from './UIServerTestUtils.js'

await describe('UIServerFactory', async () => {
  let mockBootstrap: ReturnType<typeof createMockBootstrap>

  beforeEach(() => {
    mockBootstrap = createMockBootstrap()
  })

  afterEach(() => {
    standardCleanup()
  })

  await it('should create UIHttpServer for HTTP protocol', () => {
    const config = createMockUIServerConfiguration({ type: ApplicationProtocol.HTTP })
    const server = UIServerFactory.getUIServerImplementation(config, mockBootstrap)
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    assert.ok(server instanceof UIHttpServer)
    server.stop()
  })

  await it('should create UIWebSocketServer for WS protocol', () => {
    const config = createMockUIServerConfiguration({ type: ApplicationProtocol.WS })
    const server = UIServerFactory.getUIServerImplementation(config, mockBootstrap)
    assert.ok(server instanceof UIWebSocketServer)
    server.stop()
  })

  await it('should create UIMCPServer for MCP protocol', () => {
    const config = createMockUIServerConfiguration({ type: ApplicationProtocol.MCP })
    const server = UIServerFactory.getUIServerImplementation(config, mockBootstrap)
    assert.ok(server instanceof UIMCPServer)
    server.stop()
  })

  await it('should fall back to VERSION_11 for MCP with VERSION_20', () => {
    const config = createMockUIServerConfiguration({
      type: ApplicationProtocol.MCP,
      version: ApplicationProtocolVersion.VERSION_20,
    })
    const server = UIServerFactory.getUIServerImplementation(config, mockBootstrap)
    assert.strictEqual(config.version, ApplicationProtocolVersion.VERSION_11)
    server.stop()
  })

  await it('should fall back to VERSION_11 for WS with VERSION_20', () => {
    const config = createMockUIServerConfiguration({
      type: ApplicationProtocol.WS,
      version: ApplicationProtocolVersion.VERSION_20,
    })
    const server = UIServerFactory.getUIServerImplementation(config, mockBootstrap)
    assert.strictEqual(config.version, ApplicationProtocolVersion.VERSION_11)
    server.stop()
  })
})
