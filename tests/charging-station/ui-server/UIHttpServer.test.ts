/**
 * @file Tests for UIHttpServer
 * @description Unit tests for HTTP-based UI server and response handling
 */

import type { IncomingMessage } from 'node:http'

import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { gunzipSync, type Gzip } from 'node:zlib'

import type { AbstractUIService } from '../../../src/charging-station/ui-server/ui-services/AbstractUIService.js'
import type { ResponsePayload, UIServerConfiguration, UUIDv4 } from '../../../src/types/index.js'

import { UIHttpServer } from '../../../src/charging-station/ui-server/UIHttpServer.js'
import { DEFAULT_COMPRESSION_THRESHOLD_BYTES } from '../../../src/charging-station/ui-server/UIServerSecurity.js'
import {
  ApplicationProtocol,
  ProcedureName,
  ProtocolVersion,
  ResponseStatus,
} from '../../../src/types/index.js'
import { Constants, logger } from '../../../src/utils/index.js'
import {
  createLoggerMocks,
  flushMicrotasks,
  standardCleanup,
  withMockTimers,
} from '../../helpers/TestLifecycleHelpers.js'
import { TEST_HASH_ID, TEST_HASH_ID_2, TEST_UUID } from './UIServerTestConstants.js'
import {
  awaitFinish,
  createMockBootstrap,
  createMockChargingStationData,
  createMockIncomingMessage,
  createMockUIServerConfiguration,
  emitWorkerResponse,
  MockServerResponse,
} from './UIServerTestUtils.js'

// eslint-disable-next-line @typescript-eslint/no-deprecated
class TestableUIHttpServer extends UIHttpServer {
  public lastGzipStream?: Gzip

  public constructor (config: UIServerConfiguration) {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    super(config, createMockBootstrap())
  }

  public addResponseHandler (uuid: UUIDv4, res: MockServerResponse): void {
    this.responseHandlers.set(uuid, res as never)
  }

  public addStation (hashId: string): void {
    this.setChargingStationData(hashId, createMockChargingStationData(hashId))
  }

  public emitRequest (req: IncomingMessage, res: MockServerResponse): void {
    const httpServer = Reflect.get(this, 'httpServer') as {
      emit: (eventName: string, req: IncomingMessage, res: MockServerResponse) => boolean
    }
    httpServer.emit('request', req, res)
  }

  public getAcceptsGzip (): Map<UUIDv4, boolean> {
    return Reflect.get(this, 'acceptsGzip')
  }

  public getResponseHandlersSize (): number {
    return this.responseHandlers.size
  }

  public getResponseHandlerUuids (): UUIDv4[] {
    return [...this.responseHandlers.keys()]
  }

  public getUIService (version: ProtocolVersion): AbstractUIService | undefined {
    return this.uiServices.get(version)
  }

  public mockListen (): void {
    const httpServer = Reflect.get(this, 'httpServer') as {
      listen: (...args: unknown[]) => unknown
    }
    httpServer.listen = () => httpServer
  }

  public setAcceptsGzip (uuid: UUIDv4, value: boolean): void {
    this.getAcceptsGzip().set(uuid, value)
  }

  protected override createGzipStream (): Gzip {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    this.lastGzipStream = super.createGzipStream()
    return this.lastGzipStream
  }
}

const createHttpServerConfig = () =>
  createMockUIServerConfiguration({ type: ApplicationProtocol.HTTP })

const createLargePayload = (status: ResponseStatus = ResponseStatus.SUCCESS) => ({
  data: 'x'.repeat(DEFAULT_COMPRESSION_THRESHOLD_BYTES + 100),
  status,
})

const buildProcedureRequest = (
  procedureName: string,
  payload: object,
  headers: Record<string, string> = {}
): IncomingMessage => {
  const req = Readable.from([Buffer.from(JSON.stringify(payload))]) as unknown as IncomingMessage
  Object.assign(req, {
    complete: true,
    headers: { host: 'localhost', ...headers },
    headersDistinct: {},
    method: 'POST',
    rawHeaders: [],
    socket: { encrypted: false, remoteAddress: '127.0.0.1' },
    url: `/ui/${ProtocolVersion['0.0.1']}/${procedureName}`,
  })
  return req
}

const createBroadcastServer = (): TestableUIHttpServer => {
  const server = new TestableUIHttpServer(
    createMockUIServerConfiguration({
      options: { host: '127.0.0.1', port: 0 },
      type: ApplicationProtocol.HTTP,
    })
  )
  server.mockListen()
  server.start()
  return server
}

// The HTTP handler resolves undefined for a broadcast and dispatches the
// fan-out asynchronously; poll until the safety-net tracking is armed.
const waitForOutstanding = async (
  service: AbstractUIService,
  uuid: UUIDv4,
  expected: number
): Promise<void> => {
  for (let i = 0; i < 200; i++) {
    if (service.getBroadcastChannelOutstandingResponseCount(uuid) === expected) {
      return
    }
    await new Promise<void>(resolve => {
      setImmediate(resolve)
    })
  }
  throw new Error(
    `waitForOutstanding: expected ${expected.toString()} outstanding response(s) for ${uuid}`
  )
}

const parseHttpResponsePayload = (res: MockServerResponse): ResponsePayload =>
  JSON.parse(res.body ?? '{}') as ResponsePayload

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
      gatedServer.start()
      gatedServer.emitRequest(req, res)
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
      gatedServer.start()
      gatedServer.emitRequest(denyingReq, res)
    } finally {
      httpServer.removeAllListeners()
      gatedServer.stop()
    }

    assert.strictEqual(res.statusCode, 403)
    assert.strictEqual(rateLimiterCalls.length, 1)
    assert.strictEqual(rateLimiterCalls[0], '203.0.113.10')
  })

  await describe('deferred broadcast aggregation (issue #2028)', async () => {
    await it('should not report success for a fan-out with a failing target, returning the aggregated payload', async () => {
      const broadcastServer = createBroadcastServer()
      try {
        broadcastServer.addStation(TEST_HASH_ID)
        broadcastServer.addStation(TEST_HASH_ID_2)
        const res = new MockServerResponse()

        broadcastServer.emitRequest(
          buildProcedureRequest(ProcedureName.STOP_CHARGING_STATION, {
            hashIds: [TEST_HASH_ID, TEST_HASH_ID_2],
          }),
          res
        )

        assert.strictEqual(broadcastServer.getResponseHandlerUuids().length, 1)
        const uuid = broadcastServer.getResponseHandlerUuids()[0]
        const service = broadcastServer.getUIService(ProtocolVersion['0.0.1'])
        if (service == null) {
          assert.fail('Expected UI service to be registered')
        }
        await waitForOutstanding(service, uuid, 2)
        assert.strictEqual(res.ended, false)

        emitWorkerResponse(service, { hashId: TEST_HASH_ID, status: ResponseStatus.SUCCESS }, uuid)
        emitWorkerResponse(
          service,
          { hashId: TEST_HASH_ID_2, status: ResponseStatus.FAILURE },
          uuid
        )

        assert.strictEqual(res.ended, true)
        assert.strictEqual(res.statusCode, 400)
        const payload = parseHttpResponsePayload(res)
        assert.strictEqual(payload.status, ResponseStatus.FAILURE)
        assert.deepStrictEqual(payload.hashIdsSucceeded, [TEST_HASH_ID])
        assert.deepStrictEqual(payload.hashIdsFailed, [TEST_HASH_ID_2])
        assert.strictEqual(broadcastServer.getResponseHandlersSize(), 0)
      } finally {
        broadcastServer.stop()
      }
    })

    await it('should defer a fan-out until every target succeeds, returning the aggregated succeeded hashIds', async () => {
      const broadcastServer = createBroadcastServer()
      try {
        broadcastServer.addStation(TEST_HASH_ID)
        broadcastServer.addStation(TEST_HASH_ID_2)
        const res = new MockServerResponse()

        broadcastServer.emitRequest(
          buildProcedureRequest(ProcedureName.STOP_CHARGING_STATION, {
            hashIds: [TEST_HASH_ID, TEST_HASH_ID_2],
          }),
          res
        )

        assert.strictEqual(broadcastServer.getResponseHandlerUuids().length, 1)
        const uuid = broadcastServer.getResponseHandlerUuids()[0]
        const service = broadcastServer.getUIService(ProtocolVersion['0.0.1'])
        if (service == null) {
          assert.fail('Expected UI service to be registered')
        }
        await waitForOutstanding(service, uuid, 2)
        assert.strictEqual(res.ended, false)

        emitWorkerResponse(service, { hashId: TEST_HASH_ID, status: ResponseStatus.SUCCESS }, uuid)
        assert.strictEqual(res.ended, false)
        emitWorkerResponse(
          service,
          { hashId: TEST_HASH_ID_2, status: ResponseStatus.SUCCESS },
          uuid
        )

        assert.strictEqual(res.ended, true)
        assert.strictEqual(res.statusCode, 200)
        const payload = parseHttpResponsePayload(res)
        assert.strictEqual(payload.status, ResponseStatus.SUCCESS)
        assert.deepStrictEqual(payload.hashIdsSucceeded, [TEST_HASH_ID, TEST_HASH_ID_2])
        assert.strictEqual(payload.hashIdsFailed, undefined)
        assert.strictEqual(broadcastServer.getResponseHandlersSize(), 0)
      } finally {
        broadcastServer.stop()
      }
    })

    await it('should gzip a deferred aggregated failure payload above the compression threshold', async () => {
      const broadcastServer = createBroadcastServer()
      try {
        broadcastServer.addStation(TEST_HASH_ID)
        const res = new MockServerResponse()

        broadcastServer.emitRequest(
          buildProcedureRequest(
            ProcedureName.STOP_CHARGING_STATION,
            { hashIds: [TEST_HASH_ID] },
            { 'accept-encoding': 'gzip' }
          ),
          res
        )

        const uuid = broadcastServer.getResponseHandlerUuids()[0]
        const service = broadcastServer.getUIService(ProtocolVersion['0.0.1'])
        if (service == null) {
          assert.fail('Expected UI service to be registered')
        }
        await waitForOutstanding(service, uuid, 1)
        assert.strictEqual(res.ended, false)
        assert.strictEqual(broadcastServer.getAcceptsGzip().get(uuid), true)

        const errorMessage = 'e'.repeat(DEFAULT_COMPRESSION_THRESHOLD_BYTES + 100)
        emitWorkerResponse(
          service,
          { errorMessage, hashId: TEST_HASH_ID, status: ResponseStatus.FAILURE },
          uuid
        )

        await awaitFinish(res)

        assert.strictEqual(res.statusCode, 400)
        assert.strictEqual(res.headers['Content-Encoding'], 'gzip')
        assert.strictEqual(res.headers['Content-Type'], 'application/json')
        assert.strictEqual(res.headers.Vary, 'Accept-Encoding')
        if (res.bodyBuffer == null) {
          throw new Error('Expected bodyBuffer to be defined')
        }
        const decompressed = gunzipSync(res.bodyBuffer).toString('utf8')
        const payload = JSON.parse(decompressed) as ResponsePayload
        assert.strictEqual(payload.status, ResponseStatus.FAILURE)
        assert.deepStrictEqual(payload.hashIdsFailed, [TEST_HASH_ID])
        assert.strictEqual(payload.responsesFailed?.[0]?.errorMessage, errorMessage)
        assert.strictEqual(broadcastServer.getResponseHandlersSize(), 0)
      } finally {
        broadcastServer.stop()
      }
    })

    await it('should return a bounded failure when the aggregation never arrives', async t => {
      await withMockTimers(t, ['setTimeout'], async () => {
        const broadcastServer = createBroadcastServer()
        try {
          broadcastServer.addStation(TEST_HASH_ID)
          const res = new MockServerResponse()

          broadcastServer.emitRequest(
            buildProcedureRequest(ProcedureName.STOP_CHARGING_STATION, { hashIds: [TEST_HASH_ID] }),
            res
          )

          const uuid = broadcastServer.getResponseHandlerUuids()[0]
          const service = broadcastServer.getUIService(ProtocolVersion['0.0.1'])
          if (service == null) {
            assert.fail('Expected UI service to be registered')
          }
          await waitForOutstanding(service, uuid, 1)
          assert.strictEqual(res.ended, false)

          t.mock.timers.tick(Constants.UI_SERVER_BROADCAST_CHANNEL_REQUEST_TIMEOUT_MS)

          assert.strictEqual(res.ended, true)
          assert.strictEqual(res.statusCode, 400)
          const payload = parseHttpResponsePayload(res)
          assert.strictEqual(payload.status, ResponseStatus.FAILURE)
          assert.strictEqual(broadcastServer.getResponseHandlersSize(), 0)
        } finally {
          broadcastServer.stop()
        }
      })
    })

    await it('should respond immediately to a synchronous non-broadcast procedure', async () => {
      const broadcastServer = createBroadcastServer()
      try {
        const res = new MockServerResponse()

        broadcastServer.emitRequest(
          buildProcedureRequest(ProcedureName.LIST_CHARGING_STATIONS, {}),
          res
        )
        await awaitFinish(res)

        assert.strictEqual(res.statusCode, 200)
        const payload = parseHttpResponsePayload(res)
        assert.strictEqual(payload.status, ResponseStatus.SUCCESS)
        assert.strictEqual(broadcastServer.getResponseHandlersSize(), 0)
      } finally {
        broadcastServer.stop()
      }
    })

    await it('should clean up the deferred handler entry when the client disconnects', async () => {
      const broadcastServer = createBroadcastServer()
      try {
        broadcastServer.addStation(TEST_HASH_ID)
        const res = new MockServerResponse()

        broadcastServer.emitRequest(
          buildProcedureRequest(ProcedureName.STOP_CHARGING_STATION, { hashIds: [TEST_HASH_ID] }),
          res
        )

        const uuid = broadcastServer.getResponseHandlerUuids()[0]
        const service = broadcastServer.getUIService(ProtocolVersion['0.0.1'])
        if (service == null) {
          assert.fail('Expected UI service to be registered')
        }
        await waitForOutstanding(service, uuid, 1)
        assert.strictEqual(broadcastServer.getResponseHandlersSize(), 1)
        assert.strictEqual(broadcastServer.getAcceptsGzip().has(uuid), true)

        res.emit('close')

        assert.strictEqual(broadcastServer.getResponseHandlersSize(), 0)
        assert.strictEqual(broadcastServer.getAcceptsGzip().has(uuid), false)
      } finally {
        broadcastServer.stop()
      }
    })
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

      await awaitFinish(res)

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

      await awaitFinish(res)

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

      await awaitFinish(res)

      assert.strictEqual(gzipServer.getAcceptsGzip().has(TEST_UUID), false)
    })

    await it('should destroy the response and log once when gzip compression fails', async t => {
      const res = new MockServerResponse()
      const { errorMock } = createLoggerMocks(t, logger)

      gzipServer.addResponseHandler(TEST_UUID, res)
      gzipServer.setAcceptsGzip(TEST_UUID, true)
      gzipServer.sendResponse([TEST_UUID, createLargePayload()])

      const gzip = gzipServer.lastGzipStream
      if (gzip == null) {
        throw new Error('Expected the gzip stream to be captured')
      }
      // A genuine mid-compression failure discards the queued end(body) flush,
      // so the body is never written and only the error handler acts on res.
      gzip.destroy(new Error('gzip compression failure'))
      await flushMicrotasks()

      assert.strictEqual(res.destroyed, true)
      assert.strictEqual(res.ended, false)
      assert.strictEqual(errorMock.mock.calls.length, 1)
    })
  })
})
