/**
 * @file Tests for UIWebSocketServer
 * @description Unit tests for WebSocket-based UI server and response handling
 */

import type { Duplex } from 'node:stream'

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import type { UUIDv4 } from '../../../src/types/index.js'

import { ProcedureName, ResponseStatus } from '../../../src/types/index.js'
import { logger } from '../../../src/utils/Logger.js'
import { createLoggerMocks, standardCleanup } from '../../helpers/TestLifecycleHelpers.js'
import { TEST_UUID } from './UIServerTestConstants.js'
import {
  createMockIncomingMessage,
  createMockUIServerConfiguration,
  createMockUIServerConfigurationWithAuth,
  createMockUIService,
  createMockUIWebSocket,
  MockUIServiceMode,
  MockUpgradeSocket,
  TestableUIWebSocketServer,
} from './UIServerTestUtils.js'

await describe('UIWebSocketServer', async () => {
  afterEach(() => {
    standardCleanup()
  })
  await it('should delete response handler after successful send', () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)
    const ws = createMockUIWebSocket()

    server.addResponseHandler(TEST_UUID, ws)
    assert.strictEqual(server.hasResponseHandler(TEST_UUID), true)

    server.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])

    assert.strictEqual(server.hasResponseHandler(TEST_UUID), false)
    assert.strictEqual(ws.sentMessages.length, 1)
  })

  await it('should log error when response handler not found', () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)

    server.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])

    assert.strictEqual(server.hasResponseHandler(TEST_UUID), false)
  })

  await it('should delete handler when WebSocket not in OPEN state', () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)
    const ws = createMockUIWebSocket()
    ws.readyState = 0

    server.addResponseHandler(TEST_UUID, ws)
    server.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])

    assert.strictEqual(server.hasResponseHandler(TEST_UUID), false)
    assert.strictEqual(ws.sentMessages.length, 0)
  })

  await it('should handle send errors gracefully without throwing', () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)
    const ws = createMockUIWebSocket()
    ws.readyState = 1
    ws.send = (): void => {
      throw new Error('WebSocket send error')
    }

    server.addResponseHandler(TEST_UUID, ws)
    server.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])

    assert.strictEqual(server.hasResponseHandler(TEST_UUID), false)
  })

  await it('should preserve broadcast handler until explicit deletion (issue #1642)', async () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)
    const mockService = createMockUIService(MockUIServiceMode.BROADCAST)
    const ws = createMockUIWebSocket()

    server.registerMockUIService('0.0.1', mockService)
    server.addResponseHandler(TEST_UUID, ws)

    await mockService.requestHandler().then((protocolResponse?: unknown) => {
      if (protocolResponse != null) {
        server.sendResponse(protocolResponse as never)
      }
      return undefined
    })

    assert.strictEqual(server.hasResponseHandler(TEST_UUID), true)

    server.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])
    assert.strictEqual(server.hasResponseHandler(TEST_UUID), false)
  })

  await it('should delete non-broadcast handler immediately after response', async () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)
    const mockService = createMockUIService(MockUIServiceMode.NON_BROADCAST)
    const ws = createMockUIWebSocket()

    server.registerMockUIService('0.0.1', mockService)
    server.addResponseHandler(TEST_UUID, ws)

    const response = await mockService.requestHandler([
      TEST_UUID,
      ProcedureName.LIST_CHARGING_STATIONS,
      {},
    ])
    if (response != null) {
      server.sendResponse(response)
    }

    assert.strictEqual(server.hasResponseHandler(TEST_UUID), false)
  })

  await it('should preserve handler when service throws error', async () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)
    const mockService = createMockUIService(MockUIServiceMode.ERROR)
    const ws = createMockUIWebSocket()

    server.registerMockUIService('0.0.1', mockService)
    server.addResponseHandler(TEST_UUID, ws)

    try {
      await mockService.requestHandler()
    } catch {
      // Expected error
    }

    assert.strictEqual(server.getResponseHandlersSize(), 1)
  })

  await it('should clean up response handlers after each response', () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)
    const ws1 = createMockUIWebSocket()
    const ws2 = createMockUIWebSocket()

    server.addResponseHandler('uuid-1' as UUIDv4, ws1)
    server.addResponseHandler('uuid-2' as UUIDv4, ws2)

    assert.strictEqual(server.getResponseHandlersSize(), 2)

    server.sendResponse(['uuid-1' as UUIDv4, { status: ResponseStatus.SUCCESS }])
    assert.strictEqual(server.getResponseHandlersSize(), 1)

    server.sendResponse(['uuid-2' as UUIDv4, { status: ResponseStatus.SUCCESS }])
    assert.strictEqual(server.getResponseHandlersSize(), 0)
  })

  await it('should clear all handlers on server stop', () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)
    const ws = createMockUIWebSocket()

    server.addResponseHandler(TEST_UUID, ws)
    assert.strictEqual(server.getResponseHandlersSize(), 1)

    server.stop()

    assert.strictEqual(server.getResponseHandlersSize(), 0)
  })

  await it('should create server with valid WebSocket configuration', () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)

    assert.notStrictEqual(server, undefined)
  })

  await it('should create server with custom host and port', () => {
    const config = createMockUIServerConfiguration({
      options: {
        host: 'localhost',
        port: 9090,
      },
    })

    const server = new TestableUIWebSocketServer(config)
    assert.notStrictEqual(server, undefined)
  })

  await it('should reject non-loopback plaintext upgrades before WebSocket handling', async () => {
    const config = createMockUIServerConfiguration({
      accessPolicy: {
        allowedHosts: ['gateway.example.com'],
        requireTlsForNonLoopback: true,
      },
      options: {
        host: 'localhost',
        port: 0,
      },
    })
    const server = new TestableUIWebSocketServer(config)
    const socket = new MockUpgradeSocket()

    try {
      server.start()
      await server.waitUntilListening()
      server.emitUpgrade(
        createMockIncomingMessage({
          headers: {
            connection: 'Upgrade',
            host: 'gateway.example.com',
            upgrade: 'websocket',
          },
          socket: { encrypted: false, remoteAddress: '203.0.113.10' } as never,
        }),
        socket as unknown as Duplex
      )
    } finally {
      server.stop()
    }

    assert.strictEqual(socket.destroyed, true)
    const response = socket.writes.join('')
    assert.match(response, /403 Forbidden/)
    assert.match(response, /Connection: close/)
    assert.match(response, /Content-Length: 0/)
  })

  await it('should include the Retry-After header on rate-limited upgrades', async () => {
    const config = createMockUIServerConfiguration({
      accessPolicy: {
        allowedHosts: [],
        allowedOrigins: [],
        allowLoopbackProxy: false,
        requireTlsForNonLoopback: true,
        trustedProxies: [],
      },
      options: {
        host: 'localhost',
        port: 0,
      },
    })
    const server = new TestableUIWebSocketServer(config)
    Reflect.set(server, 'rateLimiter', (_ip: string) => false)
    const socket = new MockUpgradeSocket()

    try {
      server.start()
      await server.waitUntilListening()
      server.emitUpgrade(
        createMockIncomingMessage({
          headers: {
            connection: 'Upgrade',
            host: 'localhost',
            upgrade: 'websocket',
          },
          socket: { encrypted: false, remoteAddress: '127.0.0.1' } as never,
        }),
        socket as unknown as Duplex
      )
    } finally {
      server.stop()
    }

    const response = socket.writes.join('')
    assert.strictEqual(socket.destroyed, true)
    assert.match(response, /429 Too Many Requests/)
    assert.match(response, /Retry-After: 60/)
    assert.match(response, /Connection: close/)
    assert.match(response, /Content-Length: 0/)
  })

  await it('should advertise WWW-Authenticate on auth-denied upgrades', async () => {
    const config = createMockUIServerConfigurationWithAuth({
      options: {
        host: 'localhost',
        port: 0,
      },
    })
    const server = new TestableUIWebSocketServer(config)
    const socket = new MockUpgradeSocket()

    try {
      server.start()
      await server.waitUntilListening()
      server.emitUpgrade(
        createMockIncomingMessage({
          headers: {
            connection: 'Upgrade',
            host: 'localhost',
            upgrade: 'websocket',
          },
          socket: { encrypted: false, remoteAddress: '127.0.0.1' } as never,
        }),
        socket as unknown as Duplex
      )
    } finally {
      server.stop()
    }

    const response = socket.writes.join('')
    assert.strictEqual(socket.destroyed, true)
    assert.match(response, /401 Unauthorized/)
    assert.match(response, /WWW-Authenticate: Basic realm=users/)
    assert.match(response, /Connection: close/)
    assert.match(response, /Content-Length: 0/)
  })

  await it('should attach an error listener before writing upgrade rejection', async t => {
    const { errorMock } = createLoggerMocks(t, logger)
    const config = createMockUIServerConfiguration({
      options: { host: 'localhost', port: 0 },
    })
    const server = new TestableUIWebSocketServer(config)
    const socket = new MockUpgradeSocket()

    try {
      server.start()
      await server.waitUntilListening()
      server.emitUpgrade(
        createMockIncomingMessage({
          headers: { connection: 'keep-alive', host: 'localhost', upgrade: 'http/1.1' },
          socket: { encrypted: false, remoteAddress: '127.0.0.1' } as never,
        }),
        socket as unknown as Duplex
      )

      assert.doesNotThrow(() => socket.emit('error', new Error('connection reset')))
      assert.ok(errorMock.mock.calls.length >= 1)
    } finally {
      server.stop()
    }
  })
})
