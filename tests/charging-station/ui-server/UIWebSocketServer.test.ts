/**
 * @file Tests for UIWebSocketServer
 * @description Unit tests for WebSocket-based UI server and response handling
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import type { UUIDv4 } from '../../../src/types/index.js'

import { ProcedureName, ResponseStatus } from '../../../src/types/index.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'
import { TEST_UUID } from './UIServerTestConstants.js'
import {
  createMockUIServerConfiguration,
  createMockUIService,
  createMockUIWebSocket,
  MockUIServiceMode,
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
})
