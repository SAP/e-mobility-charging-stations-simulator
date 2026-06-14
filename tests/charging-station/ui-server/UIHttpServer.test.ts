/**
 * @file Tests for UIHttpServer
 * @description Unit tests for HTTP-based UI server and response handling
 */

import type { IncomingMessage } from 'node:http'

import assert from 'node:assert/strict'
import { once } from 'node:events'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { gunzipSync } from 'node:zlib'

import type { UIServerConfiguration, UUIDv4 } from '../../../src/types/index.js'

import { UIHttpServer } from '../../../src/charging-station/ui-server/UIHttpServer.js'
import { DEFAULT_COMPRESSION_THRESHOLD_BYTES } from '../../../src/charging-station/ui-server/UIServerSecurity.js'
import { ApplicationProtocol, ResponseStatus } from '../../../src/types/index.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'
import { TEST_UUID } from './UIServerTestConstants.js'
import {
  createMockBootstrap,
  createMockIncomingMessage,
  createMockUIServerConfiguration,
  MockServerResponse,
} from './UIServerTestUtils.js'

// eslint-disable-next-line @typescript-eslint/no-deprecated
class TestableUIHttpServer extends UIHttpServer {
  public constructor (config: UIServerConfiguration) {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    super(config, createMockBootstrap())
  }

  public addResponseHandler (uuid: UUIDv4, res: MockServerResponse): void {
    this.responseHandlers.set(uuid, res as never)
  }

  public getAcceptsGzip (): Map<UUIDv4, boolean> {
    return Reflect.get(this, 'acceptsGzip')
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
  data: 'x'.repeat(DEFAULT_COMPRESSION_THRESHOLD_BYTES + 100),
  status,
})

await describe('UIHttpServer', async () => {
  let server: TestableUIHttpServer

  beforeEach(() => {
    server = new TestableUIHttpServer(createHttpServerConfig())
  })

  afterEach(() => {
    standardCleanup()
  })

  await it('should delete response handler after successful send', () => {
    const res = new MockServerResponse()

    server.addResponseHandler(TEST_UUID, res)
    assert.strictEqual(server.hasResponseHandler(TEST_UUID), true)

    server.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])

    assert.strictEqual(server.hasResponseHandler(TEST_UUID), false)
    assert.strictEqual(res.ended, true)
    assert.strictEqual(res.statusCode, 200)
  })

  await it('should log error when response handler not found', () => {
    server.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])

    assert.strictEqual(server.hasResponseHandler(TEST_UUID), false)
  })

  await it('should set status code 400 for failure responses', () => {
    const res = new MockServerResponse()

    server.addResponseHandler(TEST_UUID, res)
    server.sendResponse([TEST_UUID, { status: ResponseStatus.FAILURE }])

    assert.strictEqual(server.hasResponseHandler(TEST_UUID), false)
    assert.strictEqual(res.ended, true)
    assert.strictEqual(res.statusCode, 400)
  })

  await it('should handle send errors gracefully without throwing', () => {
    const res = new MockServerResponse()
    res.end = (): never => {
      throw new Error('HTTP response end error')
    }

    server.addResponseHandler(TEST_UUID, res)
    server.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])

    assert.strictEqual(server.hasResponseHandler(TEST_UUID), false)
  })

  await it('should set application/json Content-Type header', () => {
    const res = new MockServerResponse()

    server.addResponseHandler(TEST_UUID, res)
    server.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])

    assert.strictEqual(res.headers['Content-Type'], 'application/json')
  })

  await it('should clean up response handlers after each response', () => {
    const res1 = new MockServerResponse()
    const res2 = new MockServerResponse()

    server.addResponseHandler('uuid-1' as UUIDv4, res1)
    server.addResponseHandler('uuid-2' as UUIDv4, res2)
    assert.strictEqual(server.getResponseHandlersSize(), 2)

    server.sendResponse(['uuid-1' as UUIDv4, { status: ResponseStatus.SUCCESS }])
    assert.strictEqual(server.getResponseHandlersSize(), 1)

    server.sendResponse(['uuid-2' as UUIDv4, { status: ResponseStatus.SUCCESS }])
    assert.strictEqual(server.getResponseHandlersSize(), 0)
  })

  await it('should clear all handlers on server stop', () => {
    const res = new MockServerResponse()

    server.addResponseHandler(TEST_UUID, res)
    assert.strictEqual(server.getResponseHandlersSize(), 1)

    server.stop()

    assert.strictEqual(server.getResponseHandlersSize(), 0)
  })

  await it('should serialize response payload to JSON correctly', () => {
    const res = new MockServerResponse()
    const payload = {
      hashIdsSucceeded: ['station-1', 'station-2'],
      status: ResponseStatus.SUCCESS,
    }

    server.addResponseHandler(TEST_UUID, res)
    server.sendResponse([TEST_UUID, payload])

    assert.notStrictEqual(res.body, undefined)
    const parsedBody = JSON.parse(res.body ?? '{}') as Record<string, unknown>
    assert.strictEqual(parsedBody.status, 'success')
    assert.deepStrictEqual(parsedBody.hashIdsSucceeded, ['station-1', 'station-2'])
  })

  await it('should include error details in failure response', () => {
    const res = new MockServerResponse()
    const payload = {
      errorMessage: 'Test error',
      hashIdsFailed: ['station-1'],
      status: ResponseStatus.FAILURE,
    }

    server.addResponseHandler(TEST_UUID, res)
    server.sendResponse([TEST_UUID, payload])

    assert.notStrictEqual(res.body, undefined)
    const parsedBody = JSON.parse(res.body ?? '{}') as Record<string, unknown>
    assert.strictEqual(parsedBody.status, 'failure')
    assert.strictEqual(parsedBody.errorMessage, 'Test error')
    assert.deepStrictEqual(parsedBody.hashIdsFailed, ['station-1'])
  })

  await it('should create server with valid HTTP configuration', () => {
    assert.notStrictEqual(server, undefined)
  })

  await it('should create server with custom host and port', () => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const serverCustom = new UIHttpServer(
      createMockUIServerConfiguration({
        options: {
          host: 'localhost',
          port: 9090,
        },
        type: ApplicationProtocol.HTTP,
      }),
      createMockBootstrap()
    )

    assert.notStrictEqual(serverCustom, undefined)
  })

  await it('should reject non-loopback plaintext requests before routing', t => {
    const gatedServer = new TestableUIHttpServer(
      createMockUIServerConfiguration({
        accessPolicy: {
          allowedHosts: ['gateway.example.com'],
          requireTlsForNonLoopback: true,
        },
        options: { host: 'localhost', port: 0 },
        type: ApplicationProtocol.HTTP,
      })
    )
    const httpServer = Reflect.get(gatedServer, 'httpServer') as {
      emit: (eventName: string, req: IncomingMessage, res: MockServerResponse) => boolean
      listen: (...args: unknown[]) => unknown
      removeAllListeners: () => void
    }
    t.mock.method(httpServer, 'listen', () => httpServer)
    const req = createMockIncomingMessage({
      complete: true,
      headers: { host: 'gateway.example.com' },
      socket: { encrypted: false, remoteAddress: '203.0.113.10' } as never,
      url: '/ui/ui0.0.1/listChargingStations',
    })
    const res = new MockServerResponse()

    try {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      gatedServer.start()
      httpServer.emit('request', req, res)
    } finally {
      httpServer.removeAllListeners()
      gatedServer.stop()
    }

    assert.strictEqual(res.statusCode, 403)
    assert.strictEqual(res.body, '403 Forbidden')
    assert.strictEqual(res.headers.Connection, 'close')
  })

  await it('should account denied requests against the rate limiter', t => {
    const gatedServer = new TestableUIHttpServer(
      createMockUIServerConfiguration({
        accessPolicy: {
          allowedHosts: ['gateway.example.com'],
          requireTlsForNonLoopback: true,
        },
        options: { host: 'localhost', port: 0 },
        type: ApplicationProtocol.HTTP,
      })
    )
    const httpServer = Reflect.get(gatedServer, 'httpServer') as {
      emit: (eventName: string, req: IncomingMessage, res: MockServerResponse) => boolean
      listen: (...args: unknown[]) => unknown
      removeAllListeners: () => void
    }
    t.mock.method(httpServer, 'listen', () => httpServer)
    const rateLimiterCalls: string[] = []
    const originalLimiter = Reflect.get(gatedServer, 'rateLimiter') as (ip: string) => boolean
    Reflect.set(gatedServer, 'rateLimiter', (ip: string) => {
      rateLimiterCalls.push(ip)
      return originalLimiter(ip)
    })
    const denyingReq = createMockIncomingMessage({
      complete: true,
      headers: { host: 'gateway.example.com' },
      socket: { encrypted: false, remoteAddress: '203.0.113.10' } as never,
      url: '/ui/ui0.0.1/listChargingStations',
    })
    const res = new MockServerResponse()

    try {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      gatedServer.start()
      httpServer.emit('request', denyingReq, res)
    } finally {
      httpServer.removeAllListeners()
      gatedServer.stop()
    }

    assert.strictEqual(res.statusCode, 403)
    assert.strictEqual(rateLimiterCalls.length, 1)
    assert.strictEqual(rateLimiterCalls[0], '203.0.113.10')
  })

  await describe('Gzip compression', async () => {
    let gzipServer: TestableUIHttpServer

    beforeEach(() => {
      gzipServer = new TestableUIHttpServer(createHttpServerConfig())
    })

    await it('should skip compression when acceptsGzip is false', () => {
      const res = new MockServerResponse()

      gzipServer.addResponseHandler(TEST_UUID, res)
      gzipServer.setAcceptsGzip(TEST_UUID, false)
      gzipServer.sendResponse([TEST_UUID, createLargePayload()])

      assert.strictEqual(res.headers['Content-Encoding'], undefined)
      assert.strictEqual(res.headers['Content-Type'], 'application/json')
    })

    await it('should skip compression for small response payloads', () => {
      const res = new MockServerResponse()

      gzipServer.addResponseHandler(TEST_UUID, res)
      gzipServer.setAcceptsGzip(TEST_UUID, true)
      gzipServer.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])

      assert.strictEqual(res.headers['Content-Encoding'], undefined)
      assert.strictEqual(res.headers['Content-Type'], 'application/json')
    })

    await it('should skip compression when payload below threshold', () => {
      const res = new MockServerResponse()
      const smallPayload = {
        data: 'x'.repeat(100),
        status: ResponseStatus.SUCCESS,
      }

      gzipServer.addResponseHandler(TEST_UUID, res)
      gzipServer.setAcceptsGzip(TEST_UUID, true)
      gzipServer.sendResponse([TEST_UUID, smallPayload])

      assert.strictEqual(res.headers['Content-Encoding'], undefined)
    })

    await it('should set gzip Content-Encoding header for large responses', async () => {
      const res = new MockServerResponse()

      gzipServer.addResponseHandler(TEST_UUID, res)
      gzipServer.setAcceptsGzip(TEST_UUID, true)
      gzipServer.sendResponse([TEST_UUID, createLargePayload()])

      await once(res, 'finish')

      assert.strictEqual(res.headers['Content-Encoding'], 'gzip')
      assert.strictEqual(res.headers['Content-Type'], 'application/json')
      assert.strictEqual(res.headers.Vary, 'Accept-Encoding')
    })

    await it('should decompress gzip response to original payload', async () => {
      const res = new MockServerResponse()
      const payload = createLargePayload()

      gzipServer.addResponseHandler(TEST_UUID, res)
      gzipServer.setAcceptsGzip(TEST_UUID, true)
      gzipServer.sendResponse([TEST_UUID, payload])

      await once(res, 'finish')

      assert.notStrictEqual(res.bodyBuffer, undefined)
      if (res.bodyBuffer == null) {
        throw new Error('Expected bodyBuffer to be defined')
      }
      const decompressed = gunzipSync(res.bodyBuffer).toString('utf8')
      const parsedBody = JSON.parse(decompressed) as Record<string, unknown>
      assert.strictEqual(parsedBody.status, 'success')
      assert.strictEqual(parsedBody.data, payload.data)
    })

    await it('should skip compression when acceptsGzip context missing', () => {
      const res = new MockServerResponse()

      gzipServer.addResponseHandler(TEST_UUID, res)
      gzipServer.sendResponse([TEST_UUID, createLargePayload()])

      assert.strictEqual(res.headers['Content-Encoding'], undefined)
      assert.strictEqual(res.headers['Content-Type'], 'application/json')
    })

    await it('should cleanup acceptsGzip context after response sent', async () => {
      const res = new MockServerResponse()

      gzipServer.addResponseHandler(TEST_UUID, res)
      gzipServer.setAcceptsGzip(TEST_UUID, true)
      assert.strictEqual(gzipServer.getAcceptsGzip().has(TEST_UUID), true)

      gzipServer.sendResponse([TEST_UUID, createLargePayload()])

      await once(res, 'finish')

      assert.strictEqual(gzipServer.getAcceptsGzip().has(TEST_UUID), false)
    })
  })
})
