/**
 * @file Tests for UIWebSocketServer
 * @description Unit tests for WebSocket-based UI server and response handling
 */
// Copyright Jerome Benoit. 2024-2025. All Rights Reserved.

import { expect } from '@std/expect'
import { afterEach, describe, it, mock } from 'node:test'

import type { UUIDv4 } from '../../../src/types/index.js'

import { ProcedureName, ResponseStatus } from '../../../src/types/index.js'
import { TEST_UUID } from './UIServerTestConstants.js'
import {
  createMockUIServerConfiguration,
  createMockUIService,
  createMockUIWebSocket,
  MockUIServiceMode,
  TestableUIWebSocketServer,
} from './UIServerTestUtils.js'

await describe('UIWebSocketServer test suite', async () => {
  afterEach(() => {
    mock.restoreAll()
  })
  await it('should delete response handler after successful send', () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)
    const ws = createMockUIWebSocket()

    server.addResponseHandler(TEST_UUID, ws)
    expect(server.hasResponseHandler(TEST_UUID)).toBe(true)

    server.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])

    expect(server.hasResponseHandler(TEST_UUID)).toBe(false)
    expect(ws.sentMessages.length).toBe(1)
  })

  await it('should log error when response handler not found', () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)

    server.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])

    expect(server.hasResponseHandler(TEST_UUID)).toBe(false)
  })

  await it('should delete handler when WebSocket not in OPEN state', () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)
    const ws = createMockUIWebSocket()
    ws.readyState = 0

    server.addResponseHandler(TEST_UUID, ws)
    server.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])

    expect(server.hasResponseHandler(TEST_UUID)).toBe(false)
    expect(ws.sentMessages.length).toBe(0)
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

    expect(server.hasResponseHandler(TEST_UUID)).toBe(false)
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

    expect(server.hasResponseHandler(TEST_UUID)).toBe(true)

    server.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])
    expect(server.hasResponseHandler(TEST_UUID)).toBe(false)
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
    server.sendResponse(response)

    expect(server.hasResponseHandler(TEST_UUID)).toBe(false)
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

    expect(server.getResponseHandlersSize()).toBe(1)
  })

  await it('should clean up response handlers after each response', () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)
    const ws1 = createMockUIWebSocket()
    const ws2 = createMockUIWebSocket()

    server.addResponseHandler('uuid-1' as UUIDv4, ws1)
    server.addResponseHandler('uuid-2' as UUIDv4, ws2)

    expect(server.getResponseHandlersSize()).toBe(2)

    server.sendResponse(['uuid-1' as UUIDv4, { status: ResponseStatus.SUCCESS }])
    expect(server.getResponseHandlersSize()).toBe(1)

    server.sendResponse(['uuid-2' as UUIDv4, { status: ResponseStatus.SUCCESS }])
    expect(server.getResponseHandlersSize()).toBe(0)
  })

  await it('should clear all handlers on server stop', () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)
    const ws = createMockUIWebSocket()

    server.addResponseHandler(TEST_UUID, ws)
    expect(server.getResponseHandlersSize()).toBe(1)

    server.stop()

    expect(server.getResponseHandlersSize()).toBe(0)
  })

  await it('should create server with valid WebSocket configuration', () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)

    expect(server).toBeDefined()
  })

  await it('should create server with custom host and port', () => {
    const config = createMockUIServerConfiguration({
      options: {
        host: 'localhost',
        port: 9090,
      },
    })

    const server = new TestableUIWebSocketServer(config)
    expect(server).toBeDefined()
  })
})
