/**
 * @file Tests for the Prometheus /metrics endpoint on UIHttpServer (issue #851)
 * @description End-to-end behavior, security inheritance (access policy,
 *   rate limit, authentication), PII reject-list, exposition-format escaping
 *   and the cardinality soft-cap warning.
 */

import type { IncomingMessage } from 'node:http'
import type { mock } from 'node:test'

import assert from 'node:assert/strict'
import { once } from 'node:events'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type {
  ChargingStationData,
  TemplateStatistics,
  UIServerConfiguration,
} from '../../../src/types/index.js'

import { AbstractUIServer } from '../../../src/charging-station/ui-server/AbstractUIServer.js'
import {
  METRICS_SOFT_SAMPLE_CAP,
  UIHttpServer,
} from '../../../src/charging-station/ui-server/UIHttpServer.js'
import { UIWebSocketServer } from '../../../src/charging-station/ui-server/UIWebSocketServer.js'
import {
  ApplicationProtocol,
  AuthenticationType,
  ConnectorStatusEnum,
  OCPP16AvailabilityType,
  OCPPVersion,
} from '../../../src/types/index.js'
import { logger } from '../../../src/utils/index.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'
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

  public addStation (data: ChargingStationData): void {
    this.setChargingStationData(data.stationInfo.hashId, data)
  }

  public emitRequest (req: IncomingMessage, res: MockServerResponse): void {
    const httpServer = Reflect.get(this, 'httpServer') as {
      emit: (eventName: string, req: IncomingMessage, res: MockServerResponse) => boolean
      listen: (...args: unknown[]) => unknown
      removeAllListeners: () => void
    }
    httpServer.emit('request', req, res)
  }

  public getMetricsRegistry (): unknown {
    return Reflect.get(this, 'metricsRegistry')
  }

  public mockListen (t: { mock: { method: typeof mock.method } }): void {
    const httpServer = Reflect.get(this, 'httpServer') as object
    t.mock.method(httpServer as never, 'listen' as never, ((): unknown => httpServer) as never)
  }
}

const createMetricsConfig = (
  overrides: Partial<UIServerConfiguration> = {}
): UIServerConfiguration =>
  createMockUIServerConfiguration({
    metrics: { enabled: true },
    options: { host: '127.0.0.1', port: 0 },
    type: ApplicationProtocol.HTTP,
    ...overrides,
  })

const buildStationData = (
  hashId: string,
  overrides: Partial<ChargingStationData> = {}
): ChargingStationData =>
  ({
    connectors: [
      {
        connectorId: 1,
        connectorStatus: {
          availability: OCPP16AvailabilityType.Operative,
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
    ...overrides,
  }) as ChargingStationData

const enrichBootstrap = (server: TestableUIHttpServer, version = '4.9.0'): void => {
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

const buildMetricsRequest = (overrides: Partial<IncomingMessage> = {}): IncomingMessage =>
  createMockIncomingMessage({
    complete: true,
    headers: { host: 'localhost' },
    method: 'GET',
    socket: { encrypted: false, remoteAddress: '127.0.0.1' } as never,
    url: '/metrics',
    ...overrides,
  })

await describe('UIHttpServer /metrics endpoint (issue #851)', async () => {
  let server: TestableUIHttpServer

  beforeEach(() => {
    server = new TestableUIHttpServer(createMetricsConfig())
    enrichBootstrap(server)
  })

  afterEach(() => {
    server.stop()
    standardCleanup()
  })

  await it('T1: serves Prometheus exposition on GET /metrics when enabled', async t => {
    server.mockListen(t)
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    server.start()
    const res = new MockServerResponse()
    server.emitRequest(buildMetricsRequest(), res)
    await once(res, 'finish')
    assert.strictEqual(res.statusCode, 200)
    assert.match(res.headers['Content-Type'] ?? '', /^text\/plain;\s*version=0\.0\.4/)
    assert.match(res.body ?? '', /^# HELP /m)
    assert.match(res.body ?? '', /^# TYPE /m)
  })

  await it('T2: falls through to 400 on GET /metrics when metrics block is absent', t => {
    const plainServer = new TestableUIHttpServer(
      createMockUIServerConfiguration({ type: ApplicationProtocol.HTTP })
    )
    enrichBootstrap(plainServer)
    plainServer.mockListen(t)
    try {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      plainServer.start()
      const res = new MockServerResponse()
      plainServer.emitRequest(buildMetricsRequest(), res)
      assert.strictEqual(res.statusCode, 400)
    } finally {
      plainServer.stop()
    }
  })

  await it('T3: falls through to 400 on GET /metrics when metrics.enabled is false', t => {
    const offServer = new TestableUIHttpServer(
      createMockUIServerConfiguration({
        metrics: { enabled: false },
        type: ApplicationProtocol.HTTP,
      })
    )
    enrichBootstrap(offServer)
    offServer.mockListen(t)
    try {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      offServer.start()
      const res = new MockServerResponse()
      offServer.emitRequest(buildMetricsRequest(), res)
      assert.strictEqual(res.statusCode, 400)
    } finally {
      offServer.stop()
    }
  })

  await it('T4: serves global gauges from Bootstrap.getState().templateStatistics', async t => {
    server.mockListen(t)
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    server.start()
    const res = new MockServerResponse()
    server.emitRequest(buildMetricsRequest(), res)
    await once(res, 'finish')
    const body = res.body ?? ''
    assert.match(body, /^simulator_charging_stations_configured_total\s+5$/m)
    assert.match(body, /^simulator_charging_stations_provisioned_total\s+2$/m)
    assert.match(body, /^simulator_charging_stations_added_total\s+1$/m)
    assert.match(body, /^simulator_charging_stations_started_total\s+1$/m)
    assert.match(body, /^simulator_charging_station_templates_total\s+1$/m)
  })

  await it('T5: serves per-station gauges from chargingStations Map', async t => {
    server.addStation(buildStationData('station-T5'))
    server.mockListen(t)
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    server.start()
    const res = new MockServerResponse()
    server.emitRequest(buildMetricsRequest(), res)
    await once(res, 'finish')
    const body = res.body ?? ''
    assert.match(body, /simulator_station_started\{[^}]*hash_id="station-T5"[^}]*\}\s+1/)
    assert.match(body, /simulator_station_ws_state\{[^}]*hash_id="station-T5"[^}]*\}\s+1/)
    assert.match(body, /simulator_station_connectors_total\{[^}]*hash_id="station-T5"[^}]*\}\s+1/)
  })

  await it('T6: serves per-connector status_info one-hot', async t => {
    server.addStation(buildStationData('station-T6'))
    server.mockListen(t)
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    server.start()
    const res = new MockServerResponse()
    server.emitRequest(buildMetricsRequest(), res)
    await once(res, 'finish')
    const body = res.body ?? ''
    const line = body
      .split('\n')
      .find(l => l.startsWith('simulator_connector_status_info{') && l.endsWith(' 1'))
    assert.ok(line != null, 'simulator_connector_status_info value line not found')
    assert.match(line, /hash_id="station-T6"/)
    assert.match(line, /connector_id="1"/)
    assert.match(line, /status="Available"/)
  })

  await it('T7: rejects POST /metrics with non-200 (existing 400 path)', t => {
    server.mockListen(t)
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    server.start()
    const res = new MockServerResponse()
    server.emitRequest(buildMetricsRequest({ method: 'POST' }), res)
    assert.notStrictEqual(res.statusCode, 200)
  })

  await it('T8: inherits AccessPolicy denial — 403 on non-loopback without TLS', t => {
    const gatedServer = new TestableUIHttpServer(
      createMetricsConfig({
        accessPolicy: {
          allowedHosts: ['gateway.example.com'],
          allowedOrigins: [],
          allowLoopbackProxy: false,
          requireTlsForNonLoopback: true,
          trustedProxies: [],
        },
      })
    )
    enrichBootstrap(gatedServer)
    gatedServer.mockListen(t)
    try {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      gatedServer.start()
      const res = new MockServerResponse()
      gatedServer.emitRequest(
        buildMetricsRequest({
          headers: { host: 'gateway.example.com' },
          socket: { encrypted: false, remoteAddress: '203.0.113.10' } as never,
        }),
        res
      )
      assert.strictEqual(res.statusCode, 403)
    } finally {
      gatedServer.stop()
    }
  })

  await it('T9: inherits rate-limit — eventual 429 on burst', t => {
    const gatedServer = new TestableUIHttpServer(
      createMetricsConfig({
        accessPolicy: {
          allowedHosts: ['gateway.example.com'],
          allowedOrigins: [],
          allowLoopbackProxy: false,
          requireTlsForNonLoopback: true,
          trustedProxies: [],
        },
      })
    )
    enrichBootstrap(gatedServer)
    gatedServer.mockListen(t)
    try {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      gatedServer.start()
      const statuses: (number | undefined)[] = []
      for (let i = 0; i < 200; i++) {
        const res = new MockServerResponse()
        gatedServer.emitRequest(
          buildMetricsRequest({
            headers: { host: 'gateway.example.com' },
            socket: { encrypted: false, remoteAddress: '203.0.113.42' } as never,
          }),
          res
        )
        statuses.push(res.statusCode)
      }
      assert.ok(
        statuses.some(s => s === 429),
        `Expected at least one 429 in burst; saw ${JSON.stringify(statuses.slice(0, 5))}…`
      )
    } finally {
      gatedServer.stop()
    }
  })

  await it('T10: inherits BASIC_AUTH — 401 on missing credentials', t => {
    const authServer = new TestableUIHttpServer(
      createMetricsConfig({
        authentication: {
          enabled: true,
          password: 'pw',
          type: AuthenticationType.BASIC_AUTH,
          username: 'user',
        },
      })
    )
    enrichBootstrap(authServer)
    authServer.mockListen(t)
    try {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      authServer.start()
      const res = new MockServerResponse()
      authServer.emitRequest(buildMetricsRequest(), res)
      assert.strictEqual(res.statusCode, 401)
      assert.strictEqual(res.headers['WWW-Authenticate'], 'Basic realm=users')
    } finally {
      authServer.stop()
    }
  })

  await it('T11: inherits BASIC_AUTH — 200 on valid credentials', async t => {
    const authServer = new TestableUIHttpServer(
      createMetricsConfig({
        authentication: {
          enabled: true,
          password: 'pw',
          type: AuthenticationType.BASIC_AUTH,
          username: 'user',
        },
      })
    )
    enrichBootstrap(authServer)
    authServer.mockListen(t)
    try {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      authServer.start()
      const credentials = Buffer.from('user:pw').toString('base64')
      const res = new MockServerResponse()
      authServer.emitRequest(
        buildMetricsRequest({
          headers: { authorization: `Basic ${credentials}`, host: 'localhost' },
        }),
        res
      )
      await once(res, 'finish')
      assert.strictEqual(res.statusCode, 200)
    } finally {
      authServer.stop()
    }
  })

  await it('T12: does not leak PII (idTag, serial, supervisionUrl) in body', async t => {
    server.addStation(
      buildStationData('station-T12', {
        connectors: [
          {
            connectorId: 1,
            connectorStatus: {
              authorizeIdTag: 'SECRET-IDTAG-12345',
              availability: OCPP16AvailabilityType.Operative,
              localAuthorizeIdTag: 'SECRET-LOCAL-IDTAG',
              MeterValues: [],
              status: ConnectorStatusEnum.Available,
              transactionIdTag: 'SECRET-TX-IDTAG',
            },
            evseId: 1,
          },
        ],
        stationInfo: {
          baseName: 'test',
          chargeBoxSerialNumber: 'SECRET-SERIAL-1',
          chargePointModel: 'TestModel',
          chargePointSerialNumber: 'SECRET-CP-SERIAL',
          chargePointVendor: 'TestVendor',
          chargingStationId: 'station-T12',
          hashId: 'station-T12',
          iccid: 'SECRET-ICCID',
          imsi: 'SECRET-IMSI',
          meterSerialNumber: 'SECRET-METER',
          ocppVersion: OCPPVersion.VERSION_16,
          templateIndex: 0,
          templateName: 'test-template',
        },
        supervisionUrl: 'ws://user:password@evil.example.com/OCPP',
      })
    )
    server.mockListen(t)
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    server.start()
    const res = new MockServerResponse()
    server.emitRequest(buildMetricsRequest(), res)
    await once(res, 'finish')
    const body = res.body ?? ''
    for (const secret of [
      'SECRET-IDTAG-12345',
      'SECRET-LOCAL-IDTAG',
      'SECRET-TX-IDTAG',
      'SECRET-SERIAL-1',
      'SECRET-CP-SERIAL',
      'SECRET-METER',
      'SECRET-ICCID',
      'SECRET-IMSI',
      'user:password',
      'evil.example.com',
    ]) {
      assert.ok(!body.includes(secret), `Body must not contain '${secret}'`)
    }
    assert.ok(!body.includes('://'), 'Body must not contain any URL scheme')
  })

  await it('T13: escapes adversarial label values (no injected # HELP)', async t => {
    server.addStation(
      buildStationData('station-T13', {
        stationInfo: {
          baseName: 'test',
          chargePointModel: 'TestModel',
          chargePointVendor: 'TestVendor',
          chargingStationId:
            'evil"\n# HELP fake_metric injected\n# TYPE fake_metric gauge\nfake_metric 999\n',
          hashId: 'station-T13',
          ocppVersion: OCPPVersion.VERSION_16,
          templateIndex: 0,
          templateName: 'test-template',
        },
      })
    )
    server.mockListen(t)
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    server.start()
    const res = new MockServerResponse()
    server.emitRequest(buildMetricsRequest(), res)
    await once(res, 'finish')
    const body = res.body ?? ''
    assert.ok(
      !/^fake_metric\b/m.test(body),
      'Adversarial label injection produced a fake metric line'
    )
    assert.ok(
      !/^# HELP fake_metric/m.test(body),
      'Adversarial label injection produced a fake HELP line'
    )
  })

  await it('T14: does not register a UUID in responseHandlers', t => {
    server.mockListen(t)
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    server.start()
    const res = new MockServerResponse()
    server.emitRequest(buildMetricsRequest(), res)
    const responseHandlers = Reflect.get(server, 'responseHandlers') as Map<string, unknown>
    assert.strictEqual(responseHandlers.size, 0)
  })

  await it('T15: clears registry on stop()', t => {
    server.mockListen(t)
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    server.start()
    assert.notStrictEqual(server.getMetricsRegistry(), undefined)
    server.stop()
    assert.strictEqual(server.getMetricsRegistry(), undefined)
  })

  await it('T16: soft-warn fires when sample count > METRICS_SOFT_SAMPLE_CAP', async t => {
    // Each station emits ≈ 14 samples on the per-station gauges (no connectors yet)
    // plus 1 sample on info, that is ~15 per station. To cross 5 000 we add 400+ stations.
    const stationCount = Math.max(400, Math.ceil(METRICS_SOFT_SAMPLE_CAP / 15) + 50)
    for (let i = 0; i < stationCount; i++) {
      server.addStation(buildStationData(`station-T16-${i.toString()}`))
    }
    const warnSpy = t.mock.method(logger, 'warn', () => undefined)
    server.mockListen(t)
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    server.start()
    const res = new MockServerResponse()
    server.emitRequest(buildMetricsRequest(), res)
    await once(res, 'finish')
    assert.strictEqual(res.statusCode, 200)
    const matchingCalls = warnSpy.mock.calls.filter(call => {
      const message: unknown = call.arguments[0]
      return typeof message === 'string' && message.includes('soft cap')
    })
    assert.ok(
      matchingCalls.length >= 1,
      `Expected at least one logger.warn 'soft cap' call after ${stationCount.toString()} stations; got ${warnSpy.mock.calls.length.toString()} warn calls total`
    )
  })

  await it('should omit simulator_station_ws_state line when wsState is undefined', async t => {
    server.addStation(buildStationData('station-Mws', { wsState: undefined }))
    server.mockListen(t)
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    server.start()
    const res = new MockServerResponse()
    server.emitRequest(buildMetricsRequest(), res)
    await once(res, 'finish')
    const body = res.body ?? ''
    assert.ok(
      !/simulator_station_ws_state\{[^}]*hash_id="station-Mws"[^}]*\}/.test(body),
      'simulator_station_ws_state line must be absent when wsState is undefined'
    )
    assert.match(body, /simulator_station_started\{[^}]*hash_id="station-Mws"[^}]*\}\s+1/)
  })

  await it('should serve per-connector metrics in EVSE-mode (OCPP 2.0.x) station', async t => {
    server.addStation(
      buildStationData('station-Mevse', {
        connectors: [],
        evses: [
          {
            evseId: 1,
            evseStatus: {
              availability: OCPP16AvailabilityType.Operative,
              connectors: new Map([
                [
                  1,
                  {
                    availability: OCPP16AvailabilityType.Operative,
                    MeterValues: [],
                    status: ConnectorStatusEnum.Available,
                  },
                ],
              ]),
              MeterValues: [],
            },
          },
        ] as ChargingStationData['evses'],
      })
    )
    server.mockListen(t)
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    server.start()
    const res = new MockServerResponse()
    server.emitRequest(buildMetricsRequest(), res)
    await once(res, 'finish')
    const body = res.body ?? ''
    assert.match(
      body,
      /simulator_station_connectors_total\{[^}]*hash_id="station-Mevse"[^}]*\}\s+1/
    )
    const statusLine = body
      .split('\n')
      .find(
        l =>
          l.startsWith('simulator_connector_status_info{') &&
          l.includes('hash_id="station-Mevse"') &&
          l.endsWith(' 1')
      )
    assert.ok(statusLine != null, 'simulator_connector_status_info value line not found')
    assert.match(statusLine, /connector_id="1"/)
    assert.match(statusLine, /status="Available"/)
  })

  await it('T17: warnIfMisconfigured fires when metrics.enabled=true && type=ws', t => {
    const warnSpy = t.mock.method(logger, 'warn', () => undefined)
    const wsServer = new UIWebSocketServer(
      createMockUIServerConfiguration({
        metrics: { enabled: true },
        options: { host: 'localhost', port: 0 },
        type: ApplicationProtocol.WS,
      }),
      createMockBootstrap()
    )
    try {
      const matchingCalls = warnSpy.mock.calls.filter(call => {
        const message: unknown = call.arguments[0]
        return (
          typeof message === 'string' && message.includes('metrics') && message.includes('http')
        )
      })
      assert.ok(
        matchingCalls.length >= 1,
        `Expected logger.warn about metrics.enabled on non-HTTP transport; saw ${warnSpy.mock.calls.length.toString()} total`
      )
    } finally {
      wsServer.stop()
      // satisfy AbstractUIServer reference (no-op outside this scope)
      void AbstractUIServer
    }
  })
})
