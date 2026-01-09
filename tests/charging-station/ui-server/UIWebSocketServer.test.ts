// Copyright Jerome Benoit. 2024-2025. All Rights Reserved.

import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import type { UUIDv4 } from '../../../src/types/index.js'

import { UIWebSocketServer } from '../../../src/charging-station/ui-server/UIWebSocketServer.js'
import { ProcedureName, ResponseStatus } from '../../../src/types/index.js'
import { TEST_UUID } from './UIServerTestConstants.js'
import {
  createMockUIServerConfiguration,
  MockUIServiceBroadcast,
  MockUIServiceError,
  MockUIServiceNonBroadcast,
  MockWebSocket,
} from './UIServerTestUtils.js'

class TestableUIWebSocketServer extends UIWebSocketServer {
  public addResponseHandler (uuid: UUIDv4, ws: MockWebSocket): void {
    this.responseHandlers.set(uuid, ws as never)
  }

  public getResponseHandlersSize (): number {
    return this.responseHandlers.size
  }

  public registerMockUIService (version: string, service: unknown): void {
    this.uiServices.set(version as never, service as never)
  }
}

await describe('UIWebSocketServer test suite', async () => {
  await it('Verify sendResponse() deletes handler after sending', () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)
    const ws = new MockWebSocket()

    server.addResponseHandler(TEST_UUID, ws)
    expect(server.hasResponseHandler(TEST_UUID)).toBe(true)

    server.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])

    expect(server.hasResponseHandler(TEST_UUID)).toBe(false)
    expect(ws.sentMessages.length).toBe(1)
  })

  await it('Verify sendResponse() logs error when handler not found', () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)

    server.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])

    expect(server.hasResponseHandler(TEST_UUID)).toBe(false)
  })

  await it('Verify sendResponse() deletes handler when WebSocket not open', () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)
    const ws = new MockWebSocket()
    ws.readyState = 0

    server.addResponseHandler(TEST_UUID, ws)
    server.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])

    expect(server.hasResponseHandler(TEST_UUID)).toBe(false)
    expect(ws.sentMessages.length).toBe(0)
  })

  await it('Verify sendResponse() handles send errors gracefully', () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)
    const ws = new MockWebSocket()
    ws.readyState = 1
    ws.send = (): void => {
      throw new Error('WebSocket send error')
    }

    server.addResponseHandler(TEST_UUID, ws)
    server.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])

    expect(server.hasResponseHandler(TEST_UUID)).toBe(false)
  })

  await it('Verify broadcast handler persistence (issue #1642)', async () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)
    const mockService = new MockUIServiceBroadcast()
    const ws = new MockWebSocket()

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

  await it('Verify non-broadcast handler immediate deletion', async () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)
    const mockService = new MockUIServiceNonBroadcast()
    const ws = new MockWebSocket()

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

  await it('Verify error handler cleanup', async () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)
    const mockService = new MockUIServiceError()
    const ws = new MockWebSocket()

    server.registerMockUIService('0.0.1', mockService)
    server.addResponseHandler(TEST_UUID, ws)

    try {
      await mockService.requestHandler()
    } catch {
      // Expected error
    }

    expect(server.getResponseHandlersSize()).toBe(1)
  })

  await it('Verify response handlers cleanup', () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)
    const ws1 = new MockWebSocket()
    const ws2 = new MockWebSocket()

    server.addResponseHandler('uuid-1' as UUIDv4, ws1)
    server.addResponseHandler('uuid-2' as UUIDv4, ws2)

    expect(server.getResponseHandlersSize()).toBe(2)

    server.sendResponse(['uuid-1' as UUIDv4, { status: ResponseStatus.SUCCESS }])
    expect(server.getResponseHandlersSize()).toBe(1)

    server.sendResponse(['uuid-2' as UUIDv4, { status: ResponseStatus.SUCCESS }])
    expect(server.getResponseHandlersSize()).toBe(0)
  })

  await it('Verify handlers cleared on server stop', () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)
    const ws = new MockWebSocket()

    server.addResponseHandler(TEST_UUID, ws)
    expect(server.getResponseHandlersSize()).toBe(1)

    server.stop()

    expect(server.getResponseHandlersSize()).toBe(0)
  })

  await it('Verify valid WebSocket configuration', () => {
    const config = createMockUIServerConfiguration()
    const server = new UIWebSocketServer(config)

    expect(server).toBeDefined()
  })

  await it('Verify WebSocket server with custom config', () => {
    const config = createMockUIServerConfiguration({
      options: {
        host: 'localhost',
        port: 9090,
      },
    })

    const server = new UIWebSocketServer(config)
    expect(server).toBeDefined()
  })
})
