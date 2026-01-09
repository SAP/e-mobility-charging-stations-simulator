// Copyright Jerome Benoit. 2024-2025. All Rights Reserved.

import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import type { UUIDv4 } from '../../../src/types/index.js'

import { UIHttpServer } from '../../../src/charging-station/ui-server/UIHttpServer.js'
import { ApplicationProtocol, ResponseStatus } from '../../../src/types/index.js'
import { TEST_UUID } from './UIServerTestConstants.js'
import { createMockUIServerConfiguration, MockServerResponse } from './UIServerTestUtils.js'

class TestableUIHttpServer extends UIHttpServer {
  public addResponseHandler (uuid: UUIDv4, res: MockServerResponse): void {
    this.responseHandlers.set(uuid, res as never)
  }

  public getResponseHandlersSize (): number {
    return this.responseHandlers.size
  }
}

await describe('UIHttpServer test suite', async () => {
  await it('Verify sendResponse() deletes handler after sending', () => {
    const config = createMockUIServerConfiguration({ type: ApplicationProtocol.HTTP })
    const server = new TestableUIHttpServer(config)
    const res = new MockServerResponse()

    server.addResponseHandler(TEST_UUID, res)
    expect(server.hasResponseHandler(TEST_UUID)).toBe(true)

    server.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])

    expect(server.hasResponseHandler(TEST_UUID)).toBe(false)
    expect(res.ended).toBe(true)
    expect(res.statusCode).toBe(200)
  })

  await it('Verify sendResponse() logs error when handler not found', () => {
    const config = createMockUIServerConfiguration({ type: ApplicationProtocol.HTTP })
    const server = new TestableUIHttpServer(config)

    server.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])

    expect(server.hasResponseHandler(TEST_UUID)).toBe(false)
  })

  await it('Verify sendResponse() sets correct status code for failure', () => {
    const config = createMockUIServerConfiguration({ type: ApplicationProtocol.HTTP })
    const server = new TestableUIHttpServer(config)
    const res = new MockServerResponse()

    server.addResponseHandler(TEST_UUID, res)
    server.sendResponse([TEST_UUID, { status: ResponseStatus.FAILURE }])

    expect(server.hasResponseHandler(TEST_UUID)).toBe(false)
    expect(res.ended).toBe(true)
    expect(res.statusCode).toBe(400)
  })

  await it('Verify sendResponse() handles send errors gracefully', () => {
    const config = createMockUIServerConfiguration({ type: ApplicationProtocol.HTTP })
    const server = new TestableUIHttpServer(config)
    const res = new MockServerResponse()
    res.end = (): never => {
      throw new Error('HTTP response end error')
    }

    server.addResponseHandler(TEST_UUID, res)
    server.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])

    expect(server.hasResponseHandler(TEST_UUID)).toBe(false)
  })

  await it('Verify sendResponse() sets correct Content-Type header', () => {
    const config = createMockUIServerConfiguration({ type: ApplicationProtocol.HTTP })
    const server = new TestableUIHttpServer(config)
    const res = new MockServerResponse()

    server.addResponseHandler(TEST_UUID, res)
    server.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])

    expect(res.headers['Content-Type']).toBe('application/json')
  })

  await it('Verify response handlers cleanup', () => {
    const config = createMockUIServerConfiguration({ type: ApplicationProtocol.HTTP })
    const server = new TestableUIHttpServer(config)
    const res1 = new MockServerResponse()
    const res2 = new MockServerResponse()

    server.addResponseHandler('uuid-1' as UUIDv4, res1)
    server.addResponseHandler('uuid-2' as UUIDv4, res2)
    expect(server.getResponseHandlersSize()).toBe(2)

    server.sendResponse(['uuid-1' as UUIDv4, { status: ResponseStatus.SUCCESS }])
    expect(server.getResponseHandlersSize()).toBe(1)

    server.sendResponse(['uuid-2' as UUIDv4, { status: ResponseStatus.SUCCESS }])
    expect(server.getResponseHandlersSize()).toBe(0)
  })

  await it('Verify handlers cleared on server stop', () => {
    const config = createMockUIServerConfiguration({ type: ApplicationProtocol.HTTP })
    const server = new TestableUIHttpServer(config)
    const res = new MockServerResponse()

    server.addResponseHandler(TEST_UUID, res)
    expect(server.getResponseHandlersSize()).toBe(1)

    server.stop()

    expect(server.getResponseHandlersSize()).toBe(0)
  })

  await it('Verify response payload serialization', () => {
    const config = createMockUIServerConfiguration({ type: ApplicationProtocol.HTTP })
    const server = new TestableUIHttpServer(config)
    const res = new MockServerResponse()
    const payload = {
      hashIdsSucceeded: ['station-1', 'station-2'],
      status: ResponseStatus.SUCCESS,
    }

    server.addResponseHandler(TEST_UUID, res)
    server.sendResponse([TEST_UUID, payload])

    expect(res.body).toBeDefined()
    const parsedBody = res.getResponsePayload()
    expect(parsedBody?.[1].status).toBe('success')
    expect((parsedBody?.[1] as Record<string, unknown>).hashIdsSucceeded).toEqual([
      'station-1',
      'station-2',
    ])
  })

  await it('Verify response with error details', () => {
    const config = createMockUIServerConfiguration({ type: ApplicationProtocol.HTTP })
    const server = new TestableUIHttpServer(config)
    const res = new MockServerResponse()
    const payload = {
      errorMessage: 'Test error',
      hashIdsFailed: ['station-1'],
      status: ResponseStatus.FAILURE,
    }

    server.addResponseHandler(TEST_UUID, res)
    server.sendResponse([TEST_UUID, payload])

    expect(res.body).toBeDefined()
    const parsedBody = res.getResponsePayload()
    expect(parsedBody?.[1].status).toBe('failure')
    expect((parsedBody?.[1] as Record<string, unknown>).errorMessage).toBe('Test error')
    expect((parsedBody?.[1] as Record<string, unknown>).hashIdsFailed).toEqual(['station-1'])
  })

  await it('Verify valid HTTP configuration', () => {
    const config = createMockUIServerConfiguration({ type: ApplicationProtocol.HTTP })
    const server = new UIHttpServer(config)

    expect(server).toBeDefined()
  })

  await it('Verify HTTP server with custom config', () => {
    const config = createMockUIServerConfiguration({
      options: {
        host: 'localhost',
        port: 9090,
      },
      type: ApplicationProtocol.HTTP,
    })

    const server = new UIHttpServer(config)
    expect(server).toBeDefined()
  })
})
