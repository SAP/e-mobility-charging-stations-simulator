/**
 * @file Tests for UIWebSocketServer
 * @description Unit tests for WebSocket-based UI server and response handling
 */

import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'

import assert from 'node:assert/strict'
import { afterEach, describe, it, type TestContext } from 'node:test'

import type { UIServiceWorkerBroadcastChannel } from '../../../src/charging-station/broadcast-channel/UIServiceWorkerBroadcastChannel.js'
import type {
  ChargingStationData,
  ProtocolResponse,
  TemplateStatistics,
  UIServerConfiguration,
  UUIDv4,
} from '../../../src/types/index.js'
import type { MockWebSocket } from '../mocks/MockWebSocket.js'

import {
  ApplicationProtocol,
  AuthenticationType,
  ConnectorStatusEnum,
  OCPP16AvailabilityType,
  OCPPVersion,
  ProcedureName,
  ProtocolVersion,
  ResponseStatus,
} from '../../../src/types/index.js'
import { Constants, logger } from '../../../src/utils/index.js'
import {
  createLoggerMocks,
  standardCleanup,
  withMockTimers,
} from '../../helpers/TestLifecycleHelpers.js'
import { TEST_HASH_ID, TEST_UUID, TEST_UUID_2 } from './UIServerTestConstants.js'
import {
  awaitFinish,
  createMockIncomingMessage,
  createMockUIServerConfiguration,
  createMockUIServerConfigurationWithAuth,
  createMockUIService,
  createMockUIWebSocket,
  createProtocolRequest,
  drainResponses,
  emitWorkerResponse,
  extractGaugeValue,
  MockServerResponse,
  MockUIServiceMode,
  MockUpgradeSocket,
  TestableUIWebSocketServer,
} from './UIServerTestUtils.js'

const createWsMetricsConfig = (
  overrides: Partial<UIServerConfiguration> = {}
): UIServerConfiguration =>
  createMockUIServerConfiguration({
    metrics: { enabled: true },
    options: { host: '127.0.0.1', port: 0 },
    type: ApplicationProtocol.WS,
    ...overrides,
  })

const buildWsMetricsRequest = (overrides: Partial<IncomingMessage> = {}): IncomingMessage =>
  createMockIncomingMessage({
    complete: true,
    headers: { host: 'localhost' },
    method: 'GET',
    socket: { encrypted: false, remoteAddress: '127.0.0.1' } as never,
    url: '/metrics',
    ...overrides,
  })

const enrichBootstrapForMetrics = (server: TestableUIWebSocketServer, version = '4.9.0'): void => {
  const bootstrap = server.getBootstrap()
  const templateStats: TemplateStatistics = {
    added: 1,
    configured: 5,
    indexes: new Set([0]),
    provisioned: 2,
    started: 1,
  }
  Reflect.set(bootstrap, 'getState', () => ({
    configuration: undefined,
    started: true,
    templateStatistics: new Map<string, TemplateStatistics>([['test-template', templateStats]]),
    version,
  }))
}

const buildSimpleStation = (hashId: string): ChargingStationData =>
  ({
    connectors: [
      {
        connectorId: 1,
        connectorStatus: {
          availability: OCPP16AvailabilityType.Operative,
          MeterValues: [],
          status: ConnectorStatusEnum.Available,
          transactionStarted: false,
        },
        evseId: 1,
      },
    ],
    evses: [],
    ocppConfiguration: { configurationKey: [] },
    started: true,
    stationInfo: {
      chargePointModel: 'TestModel',
      chargePointVendor: 'TestVendor',
      chargingStationId: hashId,
      hashId,
      maximumAmperage: 32,
      maximumPower: 22000,
      ocppVersion: OCPPVersion.VERSION_16,
      templateIndex: 0,
      templateName: 'test-template',
    },
    supervisionUrl: 'ws://test.example.com/OCPP16',
    timestamp: 1_700_000_000_000,
    wsState: 1,
  }) as unknown as ChargingStationData

const createInFlightServer = (t: TestContext): TestableUIWebSocketServer => {
  const server = new TestableUIWebSocketServer(
    createMockUIServerConfiguration({
      options: { host: '127.0.0.1', port: 0 },
      type: ApplicationProtocol.WS,
    })
  )
  server.testRegisterProtocolVersionUIService(ProtocolVersion['0.0.1'])
  server.addStation(buildSimpleStation(TEST_HASH_ID))
  server.mockListen(t)
  return server
}

const connectClient = (server: TestableUIWebSocketServer): MockWebSocket => {
  const ws = createMockUIWebSocket()
  const wsServer = server.getWebSocketServer() as {
    emit: (event: string, ...args: unknown[]) => boolean
  }
  wsServer.emit('connection', ws, createMockIncomingMessage())
  return ws
}

const sendClientRequest = (
  ws: MockWebSocket,
  uuid: UUIDv4,
  procedureName: ProcedureName = ProcedureName.STOP_CHARGING_STATION
): void => {
  ws.emit('message', Buffer.from(JSON.stringify(createProtocolRequest(uuid, procedureName))))
}

const parseSentResponse = (ws: MockWebSocket, index = 0): ProtocolResponse => {
  if (index >= ws.sentMessages.length) {
    assert.fail(
      `parseSentResponse: no message at index ${index.toString()} (sentMessages.length=${ws.sentMessages.length.toString()})`
    )
  }
  return JSON.parse(ws.sentMessages[index]) as ProtocolResponse
}

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

  await it('should emit the configured HSTS value on a secure (direct TLS) upgrade rejection (issue #1980)', async () => {
    const config = createMockUIServerConfiguration({
      accessPolicy: {
        allowedHosts: ['gateway.example.com'],
        requireTlsForNonLoopback: true,
      },
      options: {
        host: 'localhost',
        port: 0,
      },
      securityHeaders: { strictTransportSecurity: 'max-age=31536000; includeSubDomains' },
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
            host: 'not-allowed.example.com',
            upgrade: 'websocket',
          },
          socket: { encrypted: true, remoteAddress: '203.0.113.10' } as never,
        }),
        socket as unknown as Duplex
      )
    } finally {
      server.stop()
    }

    assert.strictEqual(socket.destroyed, true)
    const response = socket.writes.join('')
    assert.match(response, /403 Forbidden/)
    assert.match(response, /Strict-Transport-Security: max-age=31536000; includeSubDomains/)
  })

  await it('should omit the HSTS header on a non-secure (plaintext) upgrade rejection (issue #1980)', async () => {
    const config = createMockUIServerConfiguration({
      accessPolicy: {
        allowedHosts: ['gateway.example.com'],
        requireTlsForNonLoopback: true,
      },
      options: {
        host: 'localhost',
        port: 0,
      },
      securityHeaders: { strictTransportSecurity: 'max-age=31536000; includeSubDomains' },
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
    assert.doesNotMatch(response, /Strict-Transport-Security/)
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

  await it('should not leak webSocketServer "connection" listeners across start→stop→start cycles', t => {
    const config = createMockUIServerConfiguration({
      options: { host: '127.0.0.1', port: 0 },
      type: ApplicationProtocol.WS,
    })
    const server = new TestableUIWebSocketServer(config)
    server.mockListen(t)
    const wsServer = server.getWebSocketServer() as {
      listenerCount: (event: string) => number
    }
    const baseline = wsServer.listenerCount('connection')
    try {
      for (let cycle = 0; cycle < 3; cycle += 1) {
        server.start()
        assert.strictEqual(
          wsServer.listenerCount('connection'),
          baseline + 1,
          `cycle ${cycle.toString()}: exactly one 'connection' listener after start()`
        )
        server.stop()
        assert.strictEqual(
          wsServer.listenerCount('connection'),
          baseline,
          `cycle ${cycle.toString()}: 'connection' listeners released after stop() (no leak)`
        )
      }
    } finally {
      try {
        server.stop()
      } catch {
        /* already stopped */
      }
    }
  })

  await describe('in-flight request id collision (issue #2029)', async () => {
    await it('should reject a duplicate in-flight request id and keep the first request isolated', async t => {
      const server = createInFlightServer(t)
      await withMockTimers(t, ['setTimeout'], () => {
        try {
          server.start()
          const service = server.getUIService(ProtocolVersion['0.0.1'])
          if (service == null) {
            assert.fail('Expected UI service to be registered')
          }
          const channel = Reflect.get(
            service,
            'uiServiceWorkerBroadcastChannel'
          ) as UIServiceWorkerBroadcastChannel
          const completeExpiredSpy = t.mock.method(channel, 'completeExpiredRequest')

          const ws1 = connectClient(server)
          const ws2 = connectClient(server)

          sendClientRequest(ws1, TEST_UUID)
          assert.strictEqual(server.hasResponseHandler(TEST_UUID), true)
          assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 1)

          sendClientRequest(ws2, TEST_UUID)

          assert.strictEqual(ws2.sentMessages.length, 1)
          const rejection = parseSentResponse(ws2)
          assert.strictEqual(rejection[0], TEST_UUID)
          assert.strictEqual(rejection[1].status, ResponseStatus.FAILURE)
          const { errorMessage } = rejection[1]
          if (typeof errorMessage !== 'string') {
            assert.fail('the rejection payload must carry a string errorMessage')
          }
          assert.match(errorMessage, /in-flight/)

          assert.strictEqual(
            server.hasResponseHandler(TEST_UUID),
            true,
            'the in-flight request handler must survive the duplicate'
          )
          assert.strictEqual(
            service.getBroadcastChannelOutstandingResponseCount(TEST_UUID),
            1,
            'the duplicate must not overwrite the broadcast tracking'
          )
          assert.strictEqual(ws1.sentMessages.length, 0)

          emitWorkerResponse(service, {
            hashId: TEST_HASH_ID,
            status: ResponseStatus.SUCCESS,
          })
          assert.strictEqual(ws1.sentMessages.length, 1, 'the first request receives its own reply')
          const reply = parseSentResponse(ws1)
          assert.strictEqual(reply[0], TEST_UUID)
          assert.strictEqual(reply[1].status, ResponseStatus.SUCCESS)
          assert.strictEqual(server.hasResponseHandler(TEST_UUID), false)
          assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)

          t.mock.timers.tick(Constants.UI_SERVER_BROADCAST_CHANNEL_REQUEST_TIMEOUT_MS)
          assert.strictEqual(
            completeExpiredSpy.mock.calls.length,
            0,
            'no orphaned safety-net timer fires against the wrong context'
          )
        } finally {
          server.stop()
        }
      })
    })

    await it('should not reject concurrent in-flight requests that use distinct ids', async t => {
      const server = createInFlightServer(t)
      await withMockTimers(t, ['setTimeout'], () => {
        try {
          server.start()
          const service = server.getUIService(ProtocolVersion['0.0.1'])
          if (service == null) {
            assert.fail('Expected UI service to be registered')
          }
          const ws = connectClient(server)

          sendClientRequest(ws, TEST_UUID)
          sendClientRequest(ws, TEST_UUID_2)

          assert.strictEqual(server.hasResponseHandler(TEST_UUID), true)
          assert.strictEqual(server.hasResponseHandler(TEST_UUID_2), true)
          assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 1)
          assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID_2), 1)
          assert.strictEqual(ws.sentMessages.length, 0, 'no distinct id is rejected')
        } finally {
          server.stop()
        }
      })
    })

    await it('should accept a sequential reuse of a request id after the prior request completed', async t => {
      const server = createInFlightServer(t)
      await withMockTimers(t, ['setTimeout'], () => {
        try {
          server.start()
          const service = server.getUIService(ProtocolVersion['0.0.1'])
          if (service == null) {
            assert.fail('Expected UI service to be registered')
          }
          const ws = connectClient(server)

          sendClientRequest(ws, TEST_UUID)
          emitWorkerResponse(service, {
            hashId: TEST_HASH_ID,
            status: ResponseStatus.SUCCESS,
          })
          assert.strictEqual(server.hasResponseHandler(TEST_UUID), false)
          assert.strictEqual(ws.sentMessages.length, 1)

          sendClientRequest(ws, TEST_UUID)
          assert.strictEqual(
            server.hasResponseHandler(TEST_UUID),
            true,
            'a completed id can be reused sequentially'
          )
          assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 1)
          assert.strictEqual(ws.sentMessages.length, 1, 'the accepted reuse is not rejected')
        } finally {
          server.stop()
        }
      })
    })
  })

  await describe('metrics endpoint when uiServer.type=ws (issue #1917)', async () => {
    await it('should serve Prometheus exposition on GET /metrics when enabled', async t => {
      const server = new TestableUIWebSocketServer(createWsMetricsConfig())
      enrichBootstrapForMetrics(server)
      server.mockListen(t)
      try {
        server.start()
        const res = new MockServerResponse()
        server.emitRequest(buildWsMetricsRequest(), res)
        await awaitFinish(res)
        assert.strictEqual(res.statusCode, 200)
        assert.match(res.headers['Content-Type'] ?? '', /^text\/plain;\s*version=0\.0\.4/)
        assert.strictEqual(
          extractGaugeValue(res.body ?? '', 'simulator_started'),
          1,
          'simulator_started must be 1 from the enrichBootstrapForMetrics fixture'
        )
        assert.match(res.body ?? '', /^# HELP simulator_started /m)
        assert.match(res.body ?? '', /^# TYPE simulator_started gauge$/m)
      } finally {
        server.stop()
      }
    })

    await it('should emit the configured HSTS value on a secure metrics success response (issue #1980)', async t => {
      const server = new TestableUIWebSocketServer(
        createWsMetricsConfig({
          securityHeaders: { strictTransportSecurity: 'max-age=31536000; includeSubDomains' },
        })
      )
      enrichBootstrapForMetrics(server)
      server.mockListen(t)
      try {
        server.start()
        const res = new MockServerResponse()
        server.emitRequest(
          buildWsMetricsRequest({
            socket: { encrypted: true, remoteAddress: '127.0.0.1' } as never,
          }),
          res
        )
        await awaitFinish(res)
        assert.strictEqual(res.statusCode, 200)
        assert.strictEqual(
          res.headers['Strict-Transport-Security'],
          'max-age=31536000; includeSubDomains'
        )
      } finally {
        server.stop()
      }
    })

    await it('should emit the configured HSTS value on a secure HEAD metrics response (issue #1980)', async t => {
      const server = new TestableUIWebSocketServer(
        createWsMetricsConfig({
          securityHeaders: { strictTransportSecurity: 'max-age=31536000; includeSubDomains' },
        })
      )
      enrichBootstrapForMetrics(server)
      server.mockListen(t)
      try {
        server.start()
        const res = new MockServerResponse()
        server.emitRequest(
          buildWsMetricsRequest({
            method: 'HEAD',
            socket: { encrypted: true, remoteAddress: '127.0.0.1' } as never,
          }),
          res
        )
        await awaitFinish(res)
        assert.strictEqual(res.statusCode, 200)
        assert.strictEqual(
          res.headers['Strict-Transport-Security'],
          'max-age=31536000; includeSubDomains'
        )
      } finally {
        server.stop()
      }
    })

    await it('should omit the HSTS header on a non-secure (plaintext) metrics success response (issue #1980)', async t => {
      const server = new TestableUIWebSocketServer(
        createWsMetricsConfig({
          securityHeaders: { strictTransportSecurity: 'max-age=31536000; includeSubDomains' },
        })
      )
      enrichBootstrapForMetrics(server)
      server.mockListen(t)
      try {
        server.start()
        const res = new MockServerResponse()
        server.emitRequest(buildWsMetricsRequest(), res)
        await awaitFinish(res)
        assert.strictEqual(res.statusCode, 200)
        assert.strictEqual(res.headers['Strict-Transport-Security'], undefined)
      } finally {
        server.stop()
      }
    })

    await it('should emit the configured HSTS value on a secure metrics 500 response (issue #1980)', async t => {
      const server = new TestableUIWebSocketServer(
        createWsMetricsConfig({
          securityHeaders: { strictTransportSecurity: 'max-age=31536000; includeSubDomains' },
        })
      )
      enrichBootstrapForMetrics(server)
      server.mockListen(t)
      try {
        server.start()
        const registry = Reflect.get(server, 'metricsRegistry') as {
          metrics: () => Promise<string>
        }
        t.mock.method(registry, 'metrics', () => Promise.reject(new Error('scrape failure')))
        const res = new MockServerResponse()
        server.emitRequest(
          buildWsMetricsRequest({
            socket: { encrypted: true, remoteAddress: '127.0.0.1' } as never,
          }),
          res
        )
        await awaitFinish(res)
        assert.strictEqual(res.statusCode, 500)
        assert.strictEqual(
          res.headers['Strict-Transport-Security'],
          'max-age=31536000; includeSubDomains'
        )
      } finally {
        server.stop()
      }
    })

    await it('should omit the HSTS header on a non-secure (plaintext) metrics 500 response (issue #1980)', async t => {
      const server = new TestableUIWebSocketServer(
        createWsMetricsConfig({
          securityHeaders: { strictTransportSecurity: 'max-age=31536000; includeSubDomains' },
        })
      )
      enrichBootstrapForMetrics(server)
      server.mockListen(t)
      try {
        server.start()
        const registry = Reflect.get(server, 'metricsRegistry') as {
          metrics: () => Promise<string>
        }
        t.mock.method(registry, 'metrics', () => Promise.reject(new Error('scrape failure')))
        const res = new MockServerResponse()
        server.emitRequest(buildWsMetricsRequest(), res)
        await awaitFinish(res)
        assert.strictEqual(res.statusCode, 500)
        assert.strictEqual(res.headers['Strict-Transport-Security'], undefined)
      } finally {
        server.stop()
      }
    })

    await it('should return 404 on GET /metrics when metrics.enabled=false (default)', t => {
      const server = new TestableUIWebSocketServer(
        createMockUIServerConfiguration({
          options: { host: '127.0.0.1', port: 0 },
          type: ApplicationProtocol.WS,
        })
      )
      enrichBootstrapForMetrics(server)
      server.mockListen(t)
      try {
        server.start()
        const res = new MockServerResponse()
        server.emitRequest(buildWsMetricsRequest(), res)
        assert.strictEqual(res.statusCode, 404)
      } finally {
        server.stop()
      }
    })

    await it('should inherit AccessPolicy denial — 403 on non-loopback without TLS (F5)', t => {
      const server = new TestableUIWebSocketServer(
        createWsMetricsConfig({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: [],
          },
        })
      )
      enrichBootstrapForMetrics(server)
      server.mockListen(t)
      try {
        server.start()
        const res = new MockServerResponse()
        server.emitRequest(
          buildWsMetricsRequest({
            headers: { host: 'gateway.example.com' },
            socket: { encrypted: false, remoteAddress: '203.0.113.10' } as never,
          }),
          res
        )
        assert.strictEqual(res.statusCode, 403)
      } finally {
        server.stop()
      }
    })

    await it('should return 401 without credentials when authentication is enabled', t => {
      const server = new TestableUIWebSocketServer(
        createWsMetricsConfig({
          authentication: {
            enabled: true,
            password: 'pw',
            type: AuthenticationType.BASIC_AUTH,
            username: 'user',
          },
        })
      )
      enrichBootstrapForMetrics(server)
      server.mockListen(t)
      try {
        server.start()
        const res = new MockServerResponse()
        server.emitRequest(buildWsMetricsRequest(), res)
        assert.strictEqual(res.statusCode, 401)
        assert.strictEqual(res.headers['WWW-Authenticate'], 'Basic realm=users')
      } finally {
        server.stop()
      }
    })

    await it('should return 200 with valid Basic Auth credentials', async t => {
      const server = new TestableUIWebSocketServer(
        createWsMetricsConfig({
          authentication: {
            enabled: true,
            password: 'pw',
            type: AuthenticationType.BASIC_AUTH,
            username: 'user',
          },
        })
      )
      enrichBootstrapForMetrics(server)
      server.mockListen(t)
      try {
        server.start()
        const credentials = Buffer.from('user:pw').toString('base64')
        const res = new MockServerResponse()
        server.emitRequest(
          buildWsMetricsRequest({
            headers: { authorization: `Basic ${credentials}`, host: 'localhost' },
          }),
          res
        )
        await awaitFinish(res)
        assert.strictEqual(res.statusCode, 200)
      } finally {
        server.stop()
      }
    })

    await it('should return 429 under rate-limit burst on /metrics and drain all responses', async t => {
      const server = new TestableUIWebSocketServer(createWsMetricsConfig())
      enrichBootstrapForMetrics(server)
      server.mockListen(t)
      try {
        server.start()
        const responses: MockServerResponse[] = []
        for (let i = 0; i < 200; i++) {
          const res = new MockServerResponse()
          server.emitRequest(buildWsMetricsRequest(), res)
          responses.push(res)
        }
        const sync429 = responses.filter(r => r.statusCode === 429).length
        assert.ok(
          sync429 >= 1,
          `Expected at least one synchronous 429 in burst on /metrics; saw ${sync429.toString()}`
        )
        await drainResponses(responses)
        for (const r of responses) {
          assert.strictEqual(r.writableEnded, true)
        }
      } finally {
        server.stop()
      }
    })

    await it('should keep WS upgrade handler functional after a /metrics scrape', async t => {
      const server = new TestableUIWebSocketServer(createWsMetricsConfig())
      enrichBootstrapForMetrics(server)
      server.addStation(buildSimpleStation('station-ws-after-scrape'))
      server.mockListen(t)
      try {
        server.start()
        const metricsRes = new MockServerResponse()
        server.emitRequest(buildWsMetricsRequest(), metricsRes)
        await awaitFinish(metricsRes)
        assert.strictEqual(metricsRes.statusCode, 200)

        const wss = server.getWebSocketServer() as {
          handleUpgrade: (...args: unknown[]) => void
        }
        const handleUpgradeSpy = t.mock.method(
          wss,
          'handleUpgrade',
          (_req: unknown, _socket: unknown, _head: unknown, cb: (ws: unknown) => void) => {
            cb({})
          }
        )

        const socket = new MockUpgradeSocket()
        server.emitUpgrade(
          createMockIncomingMessage({
            headers: {
              connection: 'Upgrade',
              host: 'localhost',
              'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
              'sec-websocket-protocol': 'ui0.0.1',
              'sec-websocket-version': '13',
              upgrade: 'websocket',
            },
            socket: { encrypted: false, remoteAddress: '127.0.0.1' } as never,
          }),
          socket as unknown as Duplex
        )

        assert.strictEqual(
          handleUpgradeSpy.mock.calls.length,
          1,
          'WebSocketServer.handleUpgrade must run after a metrics scrape'
        )
        assert.strictEqual(
          socket.destroyed,
          false,
          'upgrade socket must not be destroyed by an HTTP-rejection write'
        )
      } finally {
        server.stop()
      }
    })

    await it('should return 404 (not 401) on GET /metrics when metrics.enabled=false and authentication.enabled=true', t => {
      const server = new TestableUIWebSocketServer(
        createMockUIServerConfiguration({
          authentication: {
            enabled: true,
            password: 'pw',
            type: AuthenticationType.BASIC_AUTH,
            username: 'user',
          },
          options: { host: '127.0.0.1', port: 0 },
          type: ApplicationProtocol.WS,
        })
      )
      enrichBootstrapForMetrics(server)
      server.mockListen(t)
      try {
        server.start()
        const res = new MockServerResponse()
        server.emitRequest(buildWsMetricsRequest(), res)
        assert.strictEqual(res.statusCode, 404)
        assert.strictEqual(res.headers['WWW-Authenticate'], undefined)
      } finally {
        server.stop()
      }
    })

    await it('should respond 200 with empty body on HEAD /metrics per RFC 9110 §9.3.2', async t => {
      const server = new TestableUIWebSocketServer(createWsMetricsConfig())
      enrichBootstrapForMetrics(server)
      server.mockListen(t)
      try {
        server.start()
        const res = new MockServerResponse()
        server.emitRequest(buildWsMetricsRequest({ method: 'HEAD' }), res)
        await awaitFinish(res)
        assert.strictEqual(res.statusCode, 200)
        assert.match(res.headers['Content-Type'] ?? '', /^text\/plain;\s*version=0\.0\.4/)
        assert.strictEqual(res.body, undefined, 'HEAD response body must be empty')
      } finally {
        server.stop()
      }
    })

    await it('should return 404 on POST /metrics (transport-method parity with HTTP/MCP)', t => {
      const server = new TestableUIWebSocketServer(createWsMetricsConfig())
      enrichBootstrapForMetrics(server)
      server.mockListen(t)
      try {
        server.start()
        const res = new MockServerResponse()
        server.emitRequest(buildWsMetricsRequest({ method: 'POST' }), res)
        assert.strictEqual(res.statusCode, 404)
        assert.strictEqual(res.headers['Content-Type'], 'text/plain')
      } finally {
        server.stop()
      }
    })

    await it('should call req.destroy() AFTER renderDenial on the 404 fallback (parity with MCP)', t => {
      const server = new TestableUIWebSocketServer(createWsMetricsConfig())
      enrichBootstrapForMetrics(server)
      server.mockListen(t)
      try {
        server.start()
        const order: string[] = []
        const req = buildWsMetricsRequest({ complete: false, url: '/unknown' })
        ;(req as IncomingMessage & { destroy: () => IncomingMessage }).destroy = () => {
          order.push('destroy')
          return req
        }
        const res = new MockServerResponse()
        const origEnd = res.end.bind(res)
        ;(res as MockServerResponse & { end: (data?: string) => MockServerResponse }).end = (
          data?: string
        ): MockServerResponse => {
          order.push('end')
          return origEnd(data)
        }
        server.emitRequest(req, res)
        assert.strictEqual(res.statusCode, 404)
        assert.deepStrictEqual(order, ['end', 'destroy'])
      } finally {
        server.stop()
      }
    })

    await it('should emit explicit Content-Length on both HEAD and GET /metrics (RFC 9110 §9.3.2 parity)', async t => {
      const server = new TestableUIWebSocketServer(createWsMetricsConfig())
      enrichBootstrapForMetrics(server)
      server.mockListen(t)
      try {
        server.start()
        const getRes = new MockServerResponse()
        const headRes = new MockServerResponse()
        server.emitRequest(buildWsMetricsRequest(), getRes)
        server.emitRequest(buildWsMetricsRequest({ method: 'HEAD' }), headRes)
        await drainResponses([getRes, headRes])
        const getLen = Number(getRes.headers['Content-Length'])
        const headLen = Number(headRes.headers['Content-Length'])
        assert.strictEqual(
          getLen,
          Buffer.byteLength(getRes.body ?? '', 'utf8'),
          'GET Content-Length must equal body byte length'
        )
        assert.strictEqual(
          headLen,
          getLen,
          'HEAD Content-Length must equal GET length (RFC 9110 §9.3.2)'
        )
        assert.strictEqual(headRes.body, undefined, 'HEAD body must be empty')
      } finally {
        server.stop()
      }
    })

    await it('should treat req.method=undefined as non-metrics (isMetricsRequest enforces GET/HEAD)', t => {
      const server = new TestableUIWebSocketServer(createWsMetricsConfig())
      enrichBootstrapForMetrics(server)
      server.mockListen(t)
      try {
        server.start()
        const req = buildWsMetricsRequest()
        ;(req as { method?: string }).method = undefined
        const res = new MockServerResponse()
        server.emitRequest(req, res)
        assert.notStrictEqual(res.statusCode, 200)
        assert.strictEqual(res.statusCode, 404)
      } finally {
        server.stop()
      }
    })

    await it('should return 404 on /metrics after stop() clears the registry', t => {
      const server = new TestableUIWebSocketServer(createWsMetricsConfig())
      enrichBootstrapForMetrics(server)
      server.mockListen(t)
      try {
        server.start()
        server.stop()
        const res = new MockServerResponse()
        server.emitRequest(buildWsMetricsRequest(), res)
        assert.strictEqual(res.statusCode, 404)
      } finally {
        server.stop()
      }
    })

    await it('should NOT call req.destroy() on the 404 fallback when req.complete === true (HTTP/1.1)', t => {
      const server = new TestableUIWebSocketServer(createWsMetricsConfig())
      enrichBootstrapForMetrics(server)
      server.mockListen(t)
      try {
        server.start()
        let destroyCount = 0
        const req = buildWsMetricsRequest({ complete: true, url: '/unknown' })
        ;(req as IncomingMessage & { destroy: () => IncomingMessage }).destroy = () => {
          destroyCount++
          return req
        }
        const res = new MockServerResponse()
        server.emitRequest(req, res)
        assert.strictEqual(res.statusCode, 404)
        assert.strictEqual(
          destroyCount,
          0,
          'req.destroy() must NOT be called when req.complete === true'
        )
      } finally {
        server.stop()
      }
    })
  })
})
