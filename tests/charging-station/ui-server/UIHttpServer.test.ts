// Copyright Jerome Benoit. 2024-2025. All Rights Reserved.

import { expect } from '@std/expect'
import { describe, it } from 'node:test'
import { gunzipSync } from 'node:zlib'

import type { UUIDv4 } from '../../../src/types/index.js'

import { UIHttpServer } from '../../../src/charging-station/ui-server/UIHttpServer.js'
import { DEFAULT_COMPRESSION_THRESHOLD } from '../../../src/charging-station/ui-server/UIServerSecurity.js'
import { ApplicationProtocol, ResponseStatus } from '../../../src/types/index.js'
import { GZIP_STREAM_FLUSH_DELAY_MS, TEST_UUID } from './UIServerTestConstants.js'
import {
  createMockUIServerConfiguration,
  MockServerResponse,
  waitForStreamFlush,
} from './UIServerTestUtils.js'

class TestableUIHttpServer extends UIHttpServer {
  public addResponseHandler (uuid: UUIDv4, res: MockServerResponse): void {
    this.responseHandlers.set(uuid, res as never)
  }

  public getAcceptsGzip (): Map<UUIDv4, boolean> {
    return Reflect.get(this, 'acceptsGzip') as Map<UUIDv4, boolean>
  }

  public getResponseHandlersSize (): number {
    return this.responseHandlers.size
  }

  public setAcceptsGzip (uuid: UUIDv4, value: boolean): void {
    this.getAcceptsGzip().set(uuid, value)
  }
}

const createHttpServerConfig = () =>
  createMockUIServerConfiguration({ type: ApplicationProtocol.HTTP })

const createLargePayload = (status: ResponseStatus = ResponseStatus.SUCCESS) => ({
  data: 'x'.repeat(DEFAULT_COMPRESSION_THRESHOLD + 100),
  status,
})

await describe('UIHttpServer test suite', async () => {
  await it('Verify sendResponse() deletes handler after sending', () => {
    const server = new TestableUIHttpServer(createHttpServerConfig())
    const res = new MockServerResponse()

    server.addResponseHandler(TEST_UUID, res)
    expect(server.hasResponseHandler(TEST_UUID)).toBe(true)

    server.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])

    expect(server.hasResponseHandler(TEST_UUID)).toBe(false)
    expect(res.ended).toBe(true)
    expect(res.statusCode).toBe(200)
  })

  await it('Verify sendResponse() logs error when handler not found', () => {
    const server = new TestableUIHttpServer(createHttpServerConfig())

    server.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])

    expect(server.hasResponseHandler(TEST_UUID)).toBe(false)
  })

  await it('Verify sendResponse() sets correct status code for failure', () => {
    const server = new TestableUIHttpServer(createHttpServerConfig())
    const res = new MockServerResponse()

    server.addResponseHandler(TEST_UUID, res)
    server.sendResponse([TEST_UUID, { status: ResponseStatus.FAILURE }])

    expect(server.hasResponseHandler(TEST_UUID)).toBe(false)
    expect(res.ended).toBe(true)
    expect(res.statusCode).toBe(400)
  })

  await it('Verify sendResponse() handles send errors gracefully', () => {
    const server = new TestableUIHttpServer(createHttpServerConfig())
    const res = new MockServerResponse()
    res.end = (): never => {
      throw new Error('HTTP response end error')
    }

    server.addResponseHandler(TEST_UUID, res)
    server.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])

    expect(server.hasResponseHandler(TEST_UUID)).toBe(false)
  })

  await it('Verify sendResponse() sets correct Content-Type header', () => {
    const server = new TestableUIHttpServer(createHttpServerConfig())
    const res = new MockServerResponse()

    server.addResponseHandler(TEST_UUID, res)
    server.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])

    expect(res.headers['Content-Type']).toBe('application/json')
  })

  await it('Verify response handlers cleanup', () => {
    const server = new TestableUIHttpServer(createHttpServerConfig())
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
    const server = new TestableUIHttpServer(createHttpServerConfig())
    const res = new MockServerResponse()

    server.addResponseHandler(TEST_UUID, res)
    expect(server.getResponseHandlersSize()).toBe(1)

    server.stop()

    expect(server.getResponseHandlersSize()).toBe(0)
  })

  await it('Verify response payload serialization', () => {
    const server = new TestableUIHttpServer(createHttpServerConfig())
    const res = new MockServerResponse()
    const payload = {
      hashIdsSucceeded: ['station-1', 'station-2'],
      status: ResponseStatus.SUCCESS,
    }

    server.addResponseHandler(TEST_UUID, res)
    server.sendResponse([TEST_UUID, payload])

    expect(res.body).toBeDefined()
    const parsedBody = JSON.parse(res.body ?? '{}') as Record<string, unknown>
    expect(parsedBody.status).toBe('success')
    expect(parsedBody.hashIdsSucceeded).toEqual(['station-1', 'station-2'])
  })

  await it('Verify response with error details', () => {
    const server = new TestableUIHttpServer(createHttpServerConfig())
    const res = new MockServerResponse()
    const payload = {
      errorMessage: 'Test error',
      hashIdsFailed: ['station-1'],
      status: ResponseStatus.FAILURE,
    }

    server.addResponseHandler(TEST_UUID, res)
    server.sendResponse([TEST_UUID, payload])

    expect(res.body).toBeDefined()
    const parsedBody = JSON.parse(res.body ?? '{}') as Record<string, unknown>
    expect(parsedBody.status).toBe('failure')
    expect(parsedBody.errorMessage).toBe('Test error')
    expect(parsedBody.hashIdsFailed).toEqual(['station-1'])
  })

  await it('Verify valid HTTP configuration', () => {
    const server = new UIHttpServer(createHttpServerConfig())

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

  await describe('Gzip compression', async () => {
    await it('Verify no compression when acceptsGzip is false', () => {
      const server = new TestableUIHttpServer(createHttpServerConfig())
      const res = new MockServerResponse()

      server.addResponseHandler(TEST_UUID, res)
      server.setAcceptsGzip(TEST_UUID, false)
      server.sendResponse([TEST_UUID, createLargePayload()])

      expect(res.headers['Content-Encoding']).toBeUndefined()
      expect(res.headers['Content-Type']).toBe('application/json')
    })

    await it('Verify no compression for small responses', () => {
      const server = new TestableUIHttpServer(createHttpServerConfig())
      const res = new MockServerResponse()

      server.addResponseHandler(TEST_UUID, res)
      server.setAcceptsGzip(TEST_UUID, true)
      server.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])

      expect(res.headers['Content-Encoding']).toBeUndefined()
      expect(res.headers['Content-Type']).toBe('application/json')
    })

    await it('Verify no compression at exact threshold boundary', () => {
      const server = new TestableUIHttpServer(createHttpServerConfig())
      const res = new MockServerResponse()
      const basePayload = { data: '', status: ResponseStatus.SUCCESS }
      const baseSize = Buffer.byteLength(JSON.stringify(basePayload))
      const paddingNeeded = DEFAULT_COMPRESSION_THRESHOLD - baseSize
      const boundaryPayload = {
        data: 'x'.repeat(Math.max(0, paddingNeeded)),
        status: ResponseStatus.SUCCESS,
      }

      server.addResponseHandler(TEST_UUID, res)
      server.setAcceptsGzip(TEST_UUID, true)
      server.sendResponse([TEST_UUID, boundaryPayload])

      expect(res.headers['Content-Encoding']).toBeUndefined()
    })

    await it('Verify compression headers for large responses', async () => {
      const server = new TestableUIHttpServer(createHttpServerConfig())
      const res = new MockServerResponse()

      server.addResponseHandler(TEST_UUID, res)
      server.setAcceptsGzip(TEST_UUID, true)
      server.sendResponse([TEST_UUID, createLargePayload()])

      await waitForStreamFlush(GZIP_STREAM_FLUSH_DELAY_MS)

      expect(res.headers['Content-Encoding']).toBe('gzip')
      expect(res.headers['Content-Type']).toBe('application/json')
      expect(res.headers.Vary).toBe('Accept-Encoding')
    })

    await it('Verify compressed response decompresses to original payload', async () => {
      const server = new TestableUIHttpServer(createHttpServerConfig())
      const res = new MockServerResponse()
      const payload = createLargePayload()

      server.addResponseHandler(TEST_UUID, res)
      server.setAcceptsGzip(TEST_UUID, true)
      server.sendResponse([TEST_UUID, payload])

      await waitForStreamFlush(GZIP_STREAM_FLUSH_DELAY_MS)

      expect(res.bodyBuffer).toBeDefined()
      if (res.bodyBuffer == null) {
        throw new Error('Expected bodyBuffer to be defined')
      }
      const decompressed = gunzipSync(res.bodyBuffer).toString('utf8')
      const parsedBody = JSON.parse(decompressed) as Record<string, unknown>
      expect(parsedBody.status).toBe('success')
      expect(parsedBody.data).toBe(payload.data)
    })

    await it('Verify no compression when acceptsGzip context is missing', () => {
      const server = new TestableUIHttpServer(createHttpServerConfig())
      const res = new MockServerResponse()

      server.addResponseHandler(TEST_UUID, res)
      server.sendResponse([TEST_UUID, createLargePayload()])

      expect(res.headers['Content-Encoding']).toBeUndefined()
      expect(res.headers['Content-Type']).toBe('application/json')
    })

    await it('Verify acceptsGzip context cleanup after response', async () => {
      const server = new TestableUIHttpServer(createHttpServerConfig())
      const res = new MockServerResponse()

      server.addResponseHandler(TEST_UUID, res)
      server.setAcceptsGzip(TEST_UUID, true)
      expect(server.getAcceptsGzip().has(TEST_UUID)).toBe(true)

      server.sendResponse([TEST_UUID, createLargePayload()])

      await waitForStreamFlush(GZIP_STREAM_FLUSH_DELAY_MS)

      expect(server.getAcceptsGzip().has(TEST_UUID)).toBe(false)
    })
  })
})
