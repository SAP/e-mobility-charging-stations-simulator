/**
 * @file Tests for UIHttpServer
 * @description Unit tests for HTTP-based UI server and response handling
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { gunzipSync } from 'node:zlib'

import type { UUIDv4 } from '../../../src/types/index.js'

import { UIHttpServer } from '../../../src/charging-station/ui-server/UIHttpServer.js'
import { DEFAULT_COMPRESSION_THRESHOLD } from '../../../src/charging-station/ui-server/UIServerSecurity.js'
import { ApplicationProtocol, ResponseStatus } from '../../../src/types/index.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'
import { GZIP_STREAM_FLUSH_DELAY_MS, TEST_UUID } from './UIServerTestConstants.js'
import {
  createMockUIServerConfiguration,
  MockServerResponse,
  waitForStreamFlush,
} from './UIServerTestUtils.js'

// eslint-disable-next-line @typescript-eslint/no-deprecated
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
      })
    )

    assert.notStrictEqual(serverCustom, undefined)
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

      await waitForStreamFlush(GZIP_STREAM_FLUSH_DELAY_MS)

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

      await waitForStreamFlush(GZIP_STREAM_FLUSH_DELAY_MS)

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

      await waitForStreamFlush(GZIP_STREAM_FLUSH_DELAY_MS)

      assert.strictEqual(gzipServer.getAcceptsGzip().has(TEST_UUID), false)
    })
  })
})
