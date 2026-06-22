/**
 * @file Tests for the Prometheus /metrics endpoint on UIHttpServer (issue #851)
 * @description End-to-end behavior, security inheritance, PII reject-list, exposition-format escaping and the cardinality soft cap warning.
 */

import type { IncomingMessage, Server } from 'node:http'
import type { mock } from 'node:test'
import type { Registry } from 'prom-client'

import assert from 'node:assert/strict'
import { once } from 'node:events'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type {
  ChargingStationData,
  TemplateStatistics,
  UIServerConfiguration,
} from '../../../src/types/index.js'

import {
  AbstractUIServer,
  isMetricsAllowedLabelName,
  METRICS_ALLOWED_LABEL_NAMES,
  METRICS_SOFT_CAP_WARN_PREFIX,
  METRICS_SOFT_SAMPLE_CAP,
} from '../../../src/charging-station/ui-server/AbstractUIServer.js'
import { UIHttpServer } from '../../../src/charging-station/ui-server/UIHttpServer.js'
import { UIWebSocketServer } from '../../../src/charging-station/ui-server/UIWebSocketServer.js'
import { BaseError } from '../../../src/exception/index.js'
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

  public override getMetricsRegistry (): Registry | undefined {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return super.getMetricsRegistry()
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

const populateLiveState = (
  server: TestableUIHttpServer
): { uiSvc: { stop: () => void; stopCalled: number } } => {
  const uiSvc = {
    stop (): void {
      this.stopCalled++
    },
    stopCalled: 0,
  }
  ;(Reflect.get(server, 'uiServices') as Map<unknown, unknown>).set('1.1', uiSvc)
  ;(Reflect.get(server, 'responseHandlers') as Map<unknown, unknown>).set('uuid-probe', {})
  ;(Reflect.get(server, 'chargingStations') as Map<string, unknown>).set('h-probe', {
    hashId: 'h-probe',
  })
  ;(Reflect.get(server, 'chargingStationTemplates') as Set<string>).add('tpl-probe')
  return { uiSvc }
}

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

  await it('should serve Prometheus exposition on GET /metrics when enabled', async t => {
    server.mockListen(t)

    server.start()
    const res = new MockServerResponse()
    server.emitRequest(buildMetricsRequest(), res)
    await once(res, 'finish')
    assert.strictEqual(res.statusCode, 200)
    assert.match(res.headers['Content-Type'] ?? '', /^text\/plain;\s*version=0\.0\.4/)
    assert.match(res.body ?? '', /^# HELP /m)
    assert.match(res.body ?? '', /^# TYPE /m)
  })

  await it('should fall through to 400 on GET /metrics when metrics block is absent', t => {
    const plainServer = new TestableUIHttpServer(
      createMockUIServerConfiguration({ type: ApplicationProtocol.HTTP })
    )
    enrichBootstrap(plainServer)
    plainServer.mockListen(t)
    try {
      plainServer.start()
      const res = new MockServerResponse()
      plainServer.emitRequest(buildMetricsRequest(), res)
      assert.strictEqual(res.statusCode, 400)
    } finally {
      plainServer.stop()
    }
  })

  await it('should fall through to 400 on GET /metrics when metrics.enabled is false', t => {
    const offServer = new TestableUIHttpServer(
      createMockUIServerConfiguration({
        metrics: { enabled: false },
        type: ApplicationProtocol.HTTP,
      })
    )
    enrichBootstrap(offServer)
    offServer.mockListen(t)
    try {
      offServer.start()
      const res = new MockServerResponse()
      offServer.emitRequest(buildMetricsRequest(), res)
      assert.strictEqual(res.statusCode, 400)
    } finally {
      offServer.stop()
    }
  })

  await it('should serve global gauges from Bootstrap.getState().templateStatistics', async t => {
    server.mockListen(t)

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

  await it('should serve per-station gauges from chargingStations Map', async t => {
    server.addStation(buildStationData('station-T5'))
    server.mockListen(t)

    server.start()
    const res = new MockServerResponse()
    server.emitRequest(buildMetricsRequest(), res)
    await once(res, 'finish')
    const body = res.body ?? ''
    assert.match(body, /simulator_station_started\{[^}]*hash_id="station-T5"[^}]*\}\s+1/)
    assert.match(body, /simulator_station_ws_state\{[^}]*hash_id="station-T5"[^}]*\}\s+1/)
    assert.match(body, /simulator_station_connectors_total\{[^}]*hash_id="station-T5"[^}]*\}\s+1/)
  })

  await it('should serve per-connector status_info one-hot', async t => {
    server.addStation(buildStationData('station-T6'))
    server.mockListen(t)

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

  await it('should reject POST /metrics with non-200 (existing 400 path)', t => {
    server.mockListen(t)

    server.start()
    const res = new MockServerResponse()
    server.emitRequest(buildMetricsRequest({ method: 'POST' }), res)
    assert.notStrictEqual(res.statusCode, 200)
  })

  await it('should inherit AccessPolicy denial — 403 on non-loopback without TLS', t => {
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

  await it('should inherit rate-limit — eventual 429 on burst', t => {
    server.mockListen(t)

    server.start()
    const statuses: (number | undefined)[] = []
    for (let i = 0; i < 200; i++) {
      const res = new MockServerResponse()
      server.emitRequest(buildMetricsRequest(), res)
      statuses.push(res.statusCode)
    }
    assert.ok(
      statuses.some(s => s === 429),
      `Expected at least one 429 in burst on allowed /metrics path; saw ${JSON.stringify(statuses.slice(0, 5))}…`
    )
  })

  await it('should inherit BASIC_AUTH — 401 on missing credentials', t => {
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
      authServer.start()
      const res = new MockServerResponse()
      authServer.emitRequest(buildMetricsRequest(), res)
      assert.strictEqual(res.statusCode, 401)
      assert.strictEqual(res.headers['WWW-Authenticate'], 'Basic realm=users')
    } finally {
      authServer.stop()
    }
  })

  await it('should inherit BASIC_AUTH — 200 on valid credentials', async t => {
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

  await it('should not leak PII (idTag, serial, supervisionUrl) in body', async t => {
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

  await it('should escape adversarial label values (no injected # HELP)', async t => {
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

  await it('should not register a UUID in responseHandlers', t => {
    server.mockListen(t)

    server.start()
    const res = new MockServerResponse()
    server.emitRequest(buildMetricsRequest(), res)
    const responseHandlers = Reflect.get(server, 'responseHandlers') as Map<string, unknown>
    assert.strictEqual(responseHandlers.size, 0)
  })

  await it('should clear registry on stop()', t => {
    server.mockListen(t)

    server.start()
    server.stop()
    assert.strictEqual(server.getMetricsRegistry(), undefined)
  })

  await it('should fire soft-warn when sample count exceeds METRICS_SOFT_SAMPLE_CAP', async t => {
    // Each station emits ≈ 14 samples on the per-station gauges (no connectors yet)
    // plus 1 sample on info, that is ~15 per station. To cross 5 000 we add 400+ stations.
    const stationCount = Math.max(400, Math.ceil(METRICS_SOFT_SAMPLE_CAP / 15) + 50)
    for (let i = 0; i < stationCount; i++) {
      server.addStation(buildStationData(`station-T16-${i.toString()}`))
    }
    const warnSpy = t.mock.method(logger, 'warn', () => undefined)
    server.mockListen(t)

    server.start()
    const res = new MockServerResponse()
    server.emitRequest(buildMetricsRequest(), res)
    await once(res, 'finish')
    assert.strictEqual(res.statusCode, 200)
    const matchingCalls = warnSpy.mock.calls.filter(call => {
      const message: unknown = call.arguments[0]
      return typeof message === 'string' && message.includes(METRICS_SOFT_CAP_WARN_PREFIX)
    })
    assert.ok(
      matchingCalls.length > 0,
      `Expected at least one logger.warn 'soft cap' call after ${stationCount.toString()} stations; got ${warnSpy.mock.calls.length.toString()} warn calls total`
    )
  })

  await it('should omit simulator_station_ws_state line when wsState is undefined', async t => {
    server.addStation(buildStationData('station-Mws', { wsState: undefined }))
    server.mockListen(t)

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
      buildStationData('station-T18', {
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

    server.start()
    const res = new MockServerResponse()
    server.emitRequest(buildMetricsRequest(), res)
    await once(res, 'finish')
    const body = res.body ?? ''
    assert.match(body, /simulator_station_connectors_total\{[^}]*hash_id="station-T18"[^}]*\}\s+1/)
    const statusLine = body
      .split('\n')
      .find(
        l =>
          l.startsWith('simulator_connector_status_info{') &&
          l.includes('hash_id="station-T18"') &&
          l.endsWith(' 1')
      )
    assert.ok(statusLine != null, 'simulator_connector_status_info value line not found')
    assert.match(statusLine, /connector_id="1"/)
    assert.match(statusLine, /status="Available"/)
  })

  await it('should detect off-by-one at soft cap boundary (strict-greater-than semantics)', async t => {
    const warnSpy = t.mock.method(logger, 'warn', () => undefined)

    // Phase 1: probe — very high cap, count actual samples produced (no warn expected).
    const probeServer = new TestableUIHttpServer(
      createMetricsConfig({ metrics: { enabled: true, softSampleCap: 1_000_000 } })
    )
    enrichBootstrap(probeServer)
    for (let i = 0; i < 5; i++) {
      probeServer.addStation(buildStationData(`station-T19-probe-${i.toString()}`))
    }
    probeServer.mockListen(t)

    probeServer.start()
    const probeRes = new MockServerResponse()
    probeServer.emitRequest(buildMetricsRequest(), probeRes)
    await once(probeRes, 'finish')
    const probedSampleCount = (probeRes.body ?? '')
      .split('\n')
      .filter(line => line.length > 0 && !line.startsWith('#')).length
    probeServer.stop()
    warnSpy.mock.resetCalls()
    assert.ok(probedSampleCount > 0, 'probe scrape produced no samples')

    // Phase 2: cap === probedSampleCount → NO warn (count IS NOT > cap, strict).
    const exactServer = new TestableUIHttpServer(
      createMetricsConfig({ metrics: { enabled: true, softSampleCap: probedSampleCount } })
    )
    enrichBootstrap(exactServer)
    for (let i = 0; i < 5; i++) {
      exactServer.addStation(buildStationData(`station-T19-exact-${i.toString()}`))
    }
    exactServer.mockListen(t)

    exactServer.start()
    const exactRes = new MockServerResponse()
    exactServer.emitRequest(buildMetricsRequest(), exactRes)
    await once(exactRes, 'finish')
    const exactSoftCapCalls = warnSpy.mock.calls.filter(call => {
      const message: unknown = call.arguments[0]
      return typeof message === 'string' && message.includes(METRICS_SOFT_CAP_WARN_PREFIX)
    }).length
    exactServer.stop()
    assert.strictEqual(
      exactSoftCapCalls,
      0,
      `Expected 0 'soft cap' warns at exact boundary (count=cap=${probedSampleCount.toString()}); got ${exactSoftCapCalls.toString()} — would fail if '>' becomes '>='`
    )
    warnSpy.mock.resetCalls()

    // Phase 3: cap === probedSampleCount - 1 → WARN (count IS > cap).
    const belowServer = new TestableUIHttpServer(
      createMetricsConfig({
        metrics: { enabled: true, softSampleCap: probedSampleCount - 1 },
      })
    )
    enrichBootstrap(belowServer)
    for (let i = 0; i < 5; i++) {
      belowServer.addStation(buildStationData(`station-T19-below-${i.toString()}`))
    }
    belowServer.mockListen(t)

    belowServer.start()
    const belowRes = new MockServerResponse()
    belowServer.emitRequest(buildMetricsRequest(), belowRes)
    await once(belowRes, 'finish')
    const belowSoftCapCalls = warnSpy.mock.calls.filter(call => {
      const message: unknown = call.arguments[0]
      return typeof message === 'string' && message.includes(METRICS_SOFT_CAP_WARN_PREFIX)
    }).length
    belowServer.stop()
    assert.ok(
      belowSoftCapCalls >= 1,
      `Expected ≥1 'soft cap' warn when cap=${(probedSampleCount - 1).toString()} < count=${probedSampleCount.toString()}; got ${belowSoftCapCalls.toString()}`
    )
  })

  await it('should serialize concurrent /metrics scrapes (no shared-counter race)', async t => {
    // R1+R2 lock: two simultaneous GET /metrics must each produce a complete,
    // well-formed body and a coherent sample count. Without `metricsScrapeChain`
    // serialization, both scrapes' `collect()` callbacks would interleave on
    // `metricsSampleCount`, racing the soft cap check and corrupting the
    // exposition body. Configure the cap to the per-scrape sample count so an
    // honest serialized run produces ZERO warns; a broken (concurrent) run
    // would either spuriously warn (counter doubled) or truncate.
    const probeServer = new TestableUIHttpServer(
      createMetricsConfig({ metrics: { enabled: true, softSampleCap: 1_000_000 } })
    )
    enrichBootstrap(probeServer)
    for (let i = 0; i < 5; i++) {
      probeServer.addStation(buildStationData(`station-T20-probe-${i.toString()}`))
    }
    probeServer.mockListen(t)

    probeServer.start()
    const probeRes = new MockServerResponse()
    probeServer.emitRequest(buildMetricsRequest(), probeRes)
    await once(probeRes, 'finish')
    const probedSampleCount = (probeRes.body ?? '')
      .split('\n')
      .filter(line => line.length > 0 && !line.startsWith('#')).length
    probeServer.stop()
    assert.ok(probedSampleCount > 0, 'probe scrape produced no samples')

    const warnSpy = t.mock.method(logger, 'warn', () => undefined)
    const concurrentServer = new TestableUIHttpServer(
      createMetricsConfig({ metrics: { enabled: true, softSampleCap: probedSampleCount } })
    )
    enrichBootstrap(concurrentServer)
    for (let i = 0; i < 5; i++) {
      concurrentServer.addStation(buildStationData(`station-T20-${i.toString()}`))
    }
    concurrentServer.mockListen(t)

    concurrentServer.start()

    const resA = new MockServerResponse()
    const resB = new MockServerResponse()
    concurrentServer.emitRequest(buildMetricsRequest(), resA)
    concurrentServer.emitRequest(buildMetricsRequest(), resB)
    await Promise.all([once(resA, 'finish'), once(resB, 'finish')])
    concurrentServer.stop()

    assert.strictEqual(resA.statusCode, 200)
    assert.strictEqual(resB.statusCode, 200)
    const bodyA = resA.body ?? ''
    const bodyB = resB.body ?? ''
    const sampleLines = (body: string): number =>
      body.split('\n').filter(line => line.length > 0 && !line.startsWith('#')).length
    assert.strictEqual(
      sampleLines(bodyA),
      probedSampleCount,
      `scrape A must emit exactly ${probedSampleCount.toString()} sample lines (no truncation, no double-count); got ${sampleLines(bodyA).toString()}`
    )
    assert.strictEqual(
      sampleLines(bodyB),
      probedSampleCount,
      `scrape B must emit exactly ${probedSampleCount.toString()} sample lines (no truncation, no double-count); got ${sampleLines(bodyB).toString()}`
    )
    const softCapCalls = warnSpy.mock.calls.filter(call => {
      const message: unknown = call.arguments[0]
      return typeof message === 'string' && message.includes(METRICS_SOFT_CAP_WARN_PREFIX)
    }).length
    assert.strictEqual(
      softCapCalls,
      0,
      `Expected 0 'soft cap' warns under serialized concurrent scrapes (cap=count=${probedSampleCount.toString()}); got ${softCapCalls.toString()} — would fail if metricsScrapeChain serialization were removed`
    )
  })

  await it('should not warn about transport-restriction when metrics.enabled=true && type=ws (issue #1917)', t => {
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
          typeof message === 'string' &&
          /metrics\.enabled=true/i.test(message) &&
          /honored only/i.test(message)
        )
      })
      assert.strictEqual(
        matchingCalls.length,
        0,
        `Metrics endpoint is now transport-agnostic; transport-restriction warning must not be emitted. Saw ${matchingCalls.length.toString()} matching warn(s).`
      )
    } finally {
      wsServer.stop()
      void AbstractUIServer
    }
  })

  await it('start() runs buildMetricsRegistryIfEnabled THEN attachTransport THEN httpServer.listen (strict template-method ordering)', t => {
    const server = new TestableUIHttpServer(createMetricsConfig())
    const order: string[] = []
    const proto = Reflect.getPrototypeOf(server) as {
      attachTransport: () => void
      buildMetricsRegistryIfEnabled: () => void
    }
    const origBuild = proto.buildMetricsRegistryIfEnabled.bind(server)
    const origAttach = proto.attachTransport.bind(server)
    ;(
      server as unknown as { buildMetricsRegistryIfEnabled: () => void }
    ).buildMetricsRegistryIfEnabled = () => {
      order.push('build')
      origBuild()
    }
    ;(server as unknown as { attachTransport: () => void }).attachTransport = () => {
      order.push('attach')
      origAttach()
    }
    const httpServer = Reflect.get(server, 'httpServer') as {
      listen: (...args: unknown[]) => unknown
    }
    t.mock.method(
      httpServer as never,
      'listen' as never,
      ((): unknown => {
        order.push('listen')
        return httpServer
      }) as never
    )
    try {
      server.start()
      assert.deepStrictEqual(
        order,
        ['build', 'attach', 'listen'],
        'strict template-method ordering: build → attach → listen'
      )
    } finally {
      server.stop()
    }
  })

  await it('start() is one-shot — a second call throws BaseError and does not re-attach', t => {
    const server = new TestableUIHttpServer(createMetricsConfig())
    enrichBootstrap(server)
    server.mockListen(t)
    try {
      server.start()
      const registry1 = server.getMetricsRegistry()
      const httpServer = Reflect.get(server, 'httpServer') as {
        listenerCount: (event: string) => number
      }
      const listeners1 = httpServer.listenerCount('request')
      assert.throws(
        () => {
          server.start()
        },
        (err: unknown) => err instanceof BaseError,
        'second start() must throw BaseError'
      )
      assert.strictEqual(
        server.getMetricsRegistry(),
        registry1,
        'metricsRegistry reference must be preserved after the rejected second start()'
      )
      assert.strictEqual(
        httpServer.listenerCount('request'),
        listeners1,
        'request listeners must not be doubled by the rejected second start()'
      )
    } finally {
      server.stop()
    }
  })

  await it('Content-Length equals UTF-8 byte count of body, not codepoint count (non-ASCII version label)', async t => {
    const server = new TestableUIHttpServer(createMetricsConfig())
    enrichBootstrap(server, '1.0.0-✓')
    server.mockListen(t)
    try {
      server.start()
      const res = new MockServerResponse()
      server.emitRequest(buildMetricsRequest(), res)
      await once(res, 'finish')
      const body = res.body ?? ''
      assert.ok(body.includes('1.0.0-✓'), 'non-ASCII version must propagate into exposition body')
      const checkMarkOccurrences = (body.match(/✓/gu) ?? []).length
      assert.ok(checkMarkOccurrences >= 1, 'at least one ✓ must appear in the body')
      const charLen = body.length
      const byteLen = Buffer.byteLength(body, 'utf8')
      assert.notStrictEqual(charLen, byteLen, 'non-ASCII body must have byteLen !== charLen')
      assert.strictEqual(
        byteLen - charLen,
        checkMarkOccurrences * 2,
        'each ✓ contributes +2 bytes (U+2713 = 3-byte UTF-8 vs 1 codepoint)'
      )
      assert.strictEqual(
        Number(res.headers['Content-Length']),
        byteLen,
        'Content-Length header must equal UTF-8 byte length, not codepoint count'
      )
    } finally {
      server.stop()
    }
  })

  await it('stop() invokes detachTransport BEFORE stopHttpServer (lifecycle symmetry)', t => {
    const server = new TestableUIHttpServer(createMetricsConfig())
    enrichBootstrap(server)
    server.mockListen(t)
    const order: string[] = []
    const proto = Reflect.getPrototypeOf(server) as {
      detachTransport: () => void
      stopHttpServer: () => void
    }
    const origDetach = proto.detachTransport.bind(server)
    const origStopHttp = proto.stopHttpServer.bind(server)
    ;(server as unknown as { detachTransport: () => void }).detachTransport = (): void => {
      order.push('detachTransport')
      origDetach()
    }
    ;(server as unknown as { stopHttpServer: () => void }).stopHttpServer = (): void => {
      order.push('stopHttpServer')
      origStopHttp()
    }
    server.start()
    server.stop()
    assert.deepStrictEqual(
      order,
      ['detachTransport', 'stopHttpServer'],
      'detachTransport must be called before stopHttpServer for symmetric teardown'
    )
  })

  await it('handleMetricsHttpRequest error path is a no-op when res.writableEnded after the scrape rejected post-end()', async t => {
    const server = new TestableUIHttpServer(createMetricsConfig())
    enrichBootstrap(server)
    server.mockListen(t)
    try {
      server.start()
      const res = new MockServerResponse()
      let writeHeadCount = 0
      const origWriteHead = res.writeHead.bind(res)
      ;(
        res as MockServerResponse & {
          writeHead: (status: number, headers?: Record<string, string>) => MockServerResponse
        }
      ).writeHead = (status: number, headers?: Record<string, string>): MockServerResponse => {
        writeHeadCount += 1
        return origWriteHead(status, headers)
      }
      Reflect.set(
        server,
        'runMetricsScrape',
        (_req: IncomingMessage, r: MockServerResponse): Promise<void> => {
          r.writeHead(200, { 'Content-Type': 'text/plain' }).end('partial')
          return Promise.reject(new Error('post-end fail'))
        }
      )
      server.emitRequest(buildMetricsRequest(), res)
      await new Promise<void>(resolve => {
        setImmediate(resolve)
      })
      await new Promise<void>(resolve => {
        setImmediate(resolve)
      })
      assert.strictEqual(res.statusCode, 200, 'partial 200 must NOT be rewritten to 500')
      assert.strictEqual(
        writeHeadCount,
        1,
        'writeHead must run exactly once — no double-write after end()'
      )
      assert.strictEqual(res.body, 'partial', 'body must not be overwritten by the error path')
    } finally {
      server.stop()
    }
  })

  await it('stop() removes all httpServer listeners AND clears the registry when httpServer.listening === true', t => {
    const server = new TestableUIHttpServer(createMetricsConfig())
    enrichBootstrap(server)
    server.mockListen(t)
    server.start()
    const httpServer = Reflect.get(server, 'httpServer') as {
      close: () => unknown
      listenerCount: (event: string) => number
      listening: boolean
    }
    t.mock.method(httpServer as never, 'close' as never, ((): unknown => httpServer) as never)
    Object.defineProperty(httpServer, 'listening', { configurable: true, value: true })
    const requestListenersBefore = httpServer.listenerCount('request')
    assert.ok(requestListenersBefore >= 1, 'precondition: request listener attached')
    assert.notStrictEqual(server.getMetricsRegistry(), undefined)
    server.stop()
    assert.strictEqual(
      httpServer.listenerCount('request'),
      0,
      'stopHttpServer must removeAllListeners() when listening was true'
    )
    assert.strictEqual(
      server.getMetricsRegistry(),
      undefined,
      'metricsRegistry reference must be released by stop()'
    )
  })

  await it('exposition body emits only labels listed in METRICS_ALLOWED_LABEL_NAMES (PII guardian)', t => {
    const server = new TestableUIHttpServer(createMetricsConfig())
    enrichBootstrap(server)
    server.addStation(buildStationData('station-PII'))
    server.mockListen(t)
    try {
      server.start()
      const registry = server.getMetricsRegistry()
      assert(registry !== undefined, 'precondition: registry must be built')
      const metrics = registry.getMetricsAsArray()
      const leaked: string[] = []
      for (const metric of metrics) {
        const declared = (metric as { labelNames?: readonly string[] }).labelNames ?? []
        for (const labelName of declared) {
          if (!isMetricsAllowedLabelName(labelName)) leaked.push(labelName)
        }
      }
      assert.deepStrictEqual(
        leaked,
        [],
        `Label PII allowlist violated. Labels not in METRICS_ALLOWED_LABEL_NAMES: ${leaked.join(', ')}. If intentional, add to METRICS_ALLOWED_LABEL_NAMES with security review.`
      )
    } finally {
      server.stop()
    }
  })

  await it('METRICS_ALLOWED_LABEL_NAMES is a runtime-immutable frozen tuple', () => {
    assert.ok(
      Object.isFrozen(METRICS_ALLOWED_LABEL_NAMES),
      'METRICS_ALLOWED_LABEL_NAMES must be Object.frozen (honest on arrays, blocks push/length/index)'
    )
    assert.throws(
      () => {
        ;(METRICS_ALLOWED_LABEL_NAMES as unknown as string[]).push('rogue')
      },
      TypeError,
      'push on frozen array must throw TypeError at runtime'
    )
    assert.strictEqual(METRICS_ALLOWED_LABEL_NAMES.length, 14)
    assert.deepStrictEqual(
      [...METRICS_ALLOWED_LABEL_NAMES].sort(),
      [
        'availability',
        'connector_id',
        'connector_type',
        'current_out_type',
        'error_code',
        'evse_id',
        'firmware_version',
        'hash_id',
        'model',
        'ocpp_version',
        'status',
        'template',
        'vendor',
        'version',
      ].sort()
    )
  })

  await it('METRICS_SOFT_SAMPLE_CAP default is 5000 (operator-facing contract; README-documented)', () => {
    assert.strictEqual(
      METRICS_SOFT_SAMPLE_CAP,
      5000,
      'METRICS_SOFT_SAMPLE_CAP default must remain 5000 — Prometheus operators rely on the README-documented soft-warn threshold; any change requires a coordinated docs + release-notes update'
    )
  })

  await it('start() → stop() → start() succeeds (lifecycle is repeatable across cycles)', t => {
    const server = new TestableUIHttpServer(createMetricsConfig())
    enrichBootstrap(server)
    server.mockListen(t)
    let attachCalls = 0
    const proto = Reflect.getPrototypeOf(server) as { attachTransport: () => void }
    const origAttach = proto.attachTransport.bind(server)
    ;(server as unknown as { attachTransport: () => void }).attachTransport = () => {
      attachCalls += 1
      origAttach()
    }
    try {
      server.start()
      const registry1 = server.getMetricsRegistry()
      const httpServer = Reflect.get(server, 'httpServer') as {
        close: () => unknown
        listenerCount: (event: string) => number
        listening: boolean
      }
      t.mock.method(httpServer as never, 'close' as never, ((): unknown => httpServer) as never)
      Object.defineProperty(httpServer, 'listening', { configurable: true, value: true })
      const listenerCount1 = httpServer.listenerCount('request')
      server.stop()
      assert.doesNotThrow(() => {
        server.start()
      }, 'second start() after stop() must NOT throw the one-shot BaseError')
      assert.strictEqual(attachCalls, 2, 'attachTransport must run on each fresh start()')
      assert.notStrictEqual(
        server.getMetricsRegistry(),
        undefined,
        'metricsRegistry must be rebuilt on the second start()'
      )
      assert.strictEqual(
        httpServer.listenerCount('request'),
        listenerCount1,
        'request listeners must not accumulate across start()→stop()→start() cycles'
      )
      void registry1
    } finally {
      server.stop()
    }
  })

  await it('start() rolls back transportAttached when attachTransport throws — a subsequent start() succeeds', t => {
    const server = new TestableUIHttpServer(createMetricsConfig())
    enrichBootstrap(server)
    server.mockListen(t)
    const proto = Reflect.getPrototypeOf(server) as { attachTransport: () => void }
    const origAttach = proto.attachTransport.bind(server)
    const httpServer = Reflect.get(server, 'httpServer') as Server
    let throwOnce = true
    ;(server as unknown as { attachTransport: () => void }).attachTransport = () => {
      if (throwOnce) {
        throwOnce = false
        httpServer.on('request', () => undefined)
        httpServer.on('upgrade', () => undefined)
        throw new Error('attach failed')
      }
      origAttach()
    }
    try {
      assert.throws(() => {
        server.start()
      }, /attach failed/)
      assert.strictEqual(
        Reflect.get(server, 'transportAttached'),
        false,
        'rollback: transportAttached must be false after attachTransport throws'
      )
      assert.strictEqual(
        httpServer.listenerCount('request'),
        0,
        'rollback: any partially-registered request listeners must be stripped'
      )
      assert.strictEqual(
        httpServer.listenerCount('upgrade'),
        0,
        'rollback: any partially-registered upgrade listeners must be stripped'
      )
      assert.doesNotThrow(() => {
        server.start()
      }, 'second start() after rollback must NOT throw the one-shot BaseError')
    } finally {
      server.stop()
    }
  })

  await it('stop() invokes detachTransport synchronously and schedules registry.clear() as a microtask', async t => {
    const server = new TestableUIHttpServer(createMetricsConfig())
    enrichBootstrap(server)
    server.mockListen(t)
    server.start()
    const order: string[] = []
    const proto = Reflect.getPrototypeOf(server) as { detachTransport: () => void }
    const origDetach = proto.detachTransport.bind(server)
    ;(server as unknown as { detachTransport: () => void }).detachTransport = () => {
      order.push('detach')
      origDetach()
    }
    const registry = server.getMetricsRegistry()
    assert(registry !== undefined, 'precondition: registry built')
    const origClear = registry.clear.bind(registry)
    ;(registry as unknown as { clear: () => void }).clear = () => {
      order.push('clear')
      origClear()
    }
    server.stop()
    assert.deepStrictEqual(
      order,
      ['detach'],
      'detach must run synchronously inside stop(); clear is still scheduled'
    )
    await Promise.resolve()
    await Promise.resolve()
    assert.deepStrictEqual(
      order,
      ['detach', 'clear'],
      'registry.clear() must settle on the microtask queue (Promise.finally), NOT setImmediate/setTimeout'
    )
  })

  await it('handleMetricsHttpRequest error path is a no-op when writableEnded=true AND headersSent=false (end-without-writeHead)', async t => {
    const server = new TestableUIHttpServer(createMetricsConfig())
    enrichBootstrap(server)
    server.mockListen(t)
    try {
      server.start()
      const res = new MockServerResponse()
      let writeHeadCount = 0
      const origWriteHead = res.writeHead.bind(res)
      ;(
        res as MockServerResponse & {
          writeHead: (status: number, headers?: Record<string, string>) => MockServerResponse
        }
      ).writeHead = (status: number, headers?: Record<string, string>): MockServerResponse => {
        writeHeadCount += 1
        return origWriteHead(status, headers)
      }
      Reflect.set(
        server,
        'runMetricsScrape',
        (_req: IncomingMessage, r: MockServerResponse): Promise<void> => {
          r.end('partial')
          return Promise.reject(new Error('post-end fail'))
        }
      )
      server.emitRequest(buildMetricsRequest(), res)
      await new Promise<void>(resolve => {
        setImmediate(resolve)
      })
      await new Promise<void>(resolve => {
        setImmediate(resolve)
      })
      assert.strictEqual(
        res.headersSent,
        false,
        'precondition: stub used end() without writeHead → headersSent stays false'
      )
      assert.strictEqual(
        res.writableEnded,
        true,
        'precondition: stub called end() → writableEnded is true'
      )
      assert.strictEqual(
        writeHeadCount,
        0,
        'error path must NOT writeHead — `!res.writableEnded` is the gate, not `!res.headersSent` alone'
      )
      assert.strictEqual(res.body, 'partial', 'body must not be overwritten by the error path')
    } finally {
      server.stop()
    }
  })

  await it('stop() wipes pre-populated maps + caches AND resets transportAttached when detachTransport() throws (caught path)', t => {
    const server = new TestableUIHttpServer(createMetricsConfig())
    enrichBootstrap(server)
    server.mockListen(t)
    server.start()
    const { uiSvc } = populateLiveState(server)
    const httpServer = Reflect.get(server, 'httpServer') as {
      close: () => unknown
      listenerCount: (event: string) => number
      listening: boolean
    }
    t.mock.method(httpServer as never, 'close' as never, ((): unknown => httpServer) as never)
    Object.defineProperty(httpServer, 'listening', { configurable: true, value: true })
    ;(server as unknown as { detachTransport: () => void }).detachTransport = () => {
      throw new Error('detach boom')
    }
    assert.doesNotThrow(() => {
      server.stop()
    }, 'stop() must swallow detachTransport() throws and continue teardown')
    assert.strictEqual(
      Reflect.get(server, 'transportAttached'),
      false,
      'inv-1 transportAttached reset even when detachTransport throws'
    )
    assert.strictEqual(server.getMetricsRegistry(), undefined, 'inv-2 registry released')
    assert.strictEqual(uiSvc.stopCalled, 1, 'inv-3 uiService.stop() called exactly once')
    assert.strictEqual(
      (Reflect.get(server, 'uiServices') as Map<unknown, unknown>).size,
      0,
      'inv-4 uiServices cleared'
    )
    assert.strictEqual(
      (Reflect.get(server, 'responseHandlers') as Map<unknown, unknown>).size,
      0,
      'inv-5 responseHandlers cleared'
    )
    assert.strictEqual(
      (Reflect.get(server, 'chargingStations') as Map<string, unknown>).size,
      0,
      'inv-6 clearCaches() ran: chargingStations drained'
    )
    assert.strictEqual(
      (Reflect.get(server, 'chargingStationTemplates') as Set<string>).size,
      0,
      'inv-7 clearCaches() ran: chargingStationTemplates drained'
    )
    assert.strictEqual(httpServer.listenerCount('request'), 0, 'inv-8 request listeners stripped')
    assert.doesNotThrow(() => {
      server.start()
    }, 'inv-9 fresh start() must succeed after stop() swallowed a detachTransport throw')
    server.stop()
  })

  await it('stop() resets transportAttached in finally{} even when stopHttpServer() rethrows (uncaught path discriminator)', t => {
    const server = new TestableUIHttpServer(createMetricsConfig())
    enrichBootstrap(server)
    server.mockListen(t)
    server.start()
    const httpServer = Reflect.get(server, 'httpServer') as {
      close: () => unknown
      eventNames: () => (string | symbol)[]
      listening: boolean
    }
    Object.defineProperty(httpServer, 'listening', { configurable: true, value: true })
    t.mock.method(
      httpServer as never,
      'close' as never,
      ((): unknown => {
        throw new Error('close boom')
      }) as never
    )
    assert.throws(
      () => {
        server.stop()
      },
      /close boom/,
      'unprotected stopHttpServer throw must propagate'
    )
    assert.strictEqual(
      httpServer.eventNames().length,
      0,
      'listener-strip ordering: removeAllListeners() MUST run BEFORE close() so ALL listener kinds (request/connection/clientError/upgrade/error) are stripped even when close() throws'
    )
    assert.strictEqual(
      Reflect.get(server, 'transportAttached'),
      false,
      'finally{} placement: transportAttached reset even when an unprotected step rethrows'
    )
    assert.doesNotThrow(() => {
      server.start()
    }, 'recovery: fresh start() must succeed after a rethrown stop()')
    // Cleanup: the close mock is still active; suppress the trailing
    // throw to avoid bleeding into subsequent tests' diagnostics.
    Object.defineProperty(httpServer, 'listening', { configurable: true, value: false })
    server.stop()
  })

  await it('stop() continues teardown when a uiService.stop() throws (per-iteration protection)', t => {
    const server = new TestableUIHttpServer(createMetricsConfig())
    enrichBootstrap(server)
    server.mockListen(t)
    server.start()
    const services = Reflect.get(server, 'uiServices') as Map<unknown, { stop: () => void }>
    let peerStopped = false
    services.set('rogue', {
      stop: () => {
        throw new Error('service boom')
      },
    })
    services.set('peer', {
      stop: () => {
        peerStopped = true
      },
    })
    assert.doesNotThrow(() => {
      server.stop()
    }, 'stop() must swallow a rogue uiService.stop()')
    assert.strictEqual(peerStopped, true, 'peer uiService.stop() ran after rogue threw')
    assert.strictEqual(services.size, 0, 'uiServices cleared after per-iteration catch')
    assert.strictEqual(
      Reflect.get(server, 'transportAttached'),
      false,
      'transportAttached reset after rogue uiService caught'
    )
  })

  await it('metricsScrapeChain is re-armed across start()→stop()→start() cycles (monotonic identity sequence)', async t => {
    const server = new TestableUIHttpServer(createMetricsConfig())
    enrichBootstrap(server)
    server.addStation(buildStationData('station-chain'))
    server.mockListen(t)
    const getChain = (): Promise<void> => Reflect.get(server, 'metricsScrapeChain') as Promise<void>
    try {
      server.start()
      const chain0 = getChain()
      const r1 = new MockServerResponse()
      server.emitRequest(buildMetricsRequest(), r1)
      await once(r1, 'finish')
      const chainAfterScrape1 = getChain()
      assert.notStrictEqual(
        chainAfterScrape1,
        chain0,
        'scrape advances chain identity within a cycle'
      )
      server.stop()
      const chainAfterStop = getChain()
      assert.notStrictEqual(
        chainAfterStop,
        chainAfterScrape1,
        'stop() rebinds chain to schedule registry.clear()'
      )
      server.start()
      const chain1 = getChain()
      assert.notStrictEqual(
        chain1,
        chainAfterStop,
        'start() reseats chain to a fresh Promise.resolve() (no cross-cycle accumulation)'
      )
      const r2 = new MockServerResponse()
      server.emitRequest(buildMetricsRequest(), r2)
      await once(r2, 'finish')
      const chainAfterScrape2 = getChain()
      const all = [chain0, chainAfterScrape1, chainAfterStop, chain1, chainAfterScrape2]
      assert.strictEqual(
        new Set(all).size,
        all.length,
        'chain identity never reused across cycles (monotonic sequence)'
      )
    } finally {
      server.stop()
    }
  })

  await it('stop() schedules registry.clear() against the captured registry (locks the .finally body, not just chain identity)', async t => {
    const localServer = new TestableUIHttpServer(createMetricsConfig())
    enrichBootstrap(localServer)
    localServer.addStation(buildStationData('station-clear'))
    localServer.mockListen(t)
    try {
      localServer.start()
      const r1 = new MockServerResponse()
      localServer.emitRequest(buildMetricsRequest(), r1)
      await once(r1, 'finish')
      const registry = localServer.getMetricsRegistry()
      assert.ok(registry !== undefined, 'precondition: registry present before stop()')
      let clearCalls = 0
      const originalClear = registry.clear.bind(registry)
      registry.clear = (): void => {
        clearCalls += 1
        originalClear()
      }
      const chainBefore = Reflect.get(localServer, 'metricsScrapeChain') as Promise<void>
      localServer.stop()
      const chainAfter = Reflect.get(localServer, 'metricsScrapeChain') as Promise<void>
      assert.notStrictEqual(chainAfter, chainBefore, 'precondition: stop() rebinds the chain')
      await chainAfter
      assert.strictEqual(
        clearCalls,
        1,
        'stop() MUST invoke registry.clear() exactly once on the CAPTURED registry instance'
      )
      assert.strictEqual(
        localServer.getMetricsRegistry(),
        undefined,
        'registry field released even though clear() ran on the captured handle'
      )
    } finally {
      localServer.stop()
    }
  })

  await it('stop() runs registry.clear() even when metricsScrapeChain is in a REJECTED state (locks .finally semantics, not .then)', async t => {
    const localServer = new TestableUIHttpServer(createMetricsConfig())
    enrichBootstrap(localServer)
    localServer.addStation(buildStationData('station-rejected-chain'))
    localServer.mockListen(t)
    t.mock.method(logger, 'error', () => undefined)
    try {
      localServer.start()
      const registry = localServer.getMetricsRegistry()
      assert.ok(registry !== undefined, 'precondition: registry present before scrape')
      registry.metrics = async (): Promise<string> => {
        await Promise.resolve()
        throw new Error('scrape boom')
      }
      let clearCalls = 0
      const originalClear = registry.clear.bind(registry)
      registry.clear = (): void => {
        clearCalls += 1
        originalClear()
      }
      const res = new MockServerResponse()
      localServer.emitRequest(buildMetricsRequest(), res)
      await once(res, 'finish')
      const rejectedChain = Reflect.get(localServer, 'metricsScrapeChain') as Promise<void>
      let rejected = false
      await rejectedChain.catch(() => {
        rejected = true
      })
      assert.strictEqual(
        rejected,
        true,
        'precondition: scrape chain is in REJECTED state before stop()'
      )
      localServer.stop()
      const chainAfter = Reflect.get(localServer, 'metricsScrapeChain') as Promise<void>
      await chainAfter
      assert.strictEqual(
        clearCalls,
        1,
        'stop() MUST invoke registry.clear() exactly once even when metricsScrapeChain is rejected (locks `.finally`, not `.then`)'
      )
    } finally {
      localServer.stop()
    }
  })

  await it('runMetricsScrape captures sampleCount pre-yield: mutating this.metricsSampleCount across the await does not synthesize a soft-cap warn (MED-1 regression lock)', async t => {
    const cap = 999_999
    const sentinel = Number.MAX_SAFE_INTEGER
    const localServer = new TestableUIHttpServer(
      createMetricsConfig({ metrics: { enabled: true, softSampleCap: cap } })
    )
    enrichBootstrap(localServer)
    localServer.mockListen(t)
    const warnSpy = t.mock.method(logger, 'warn', () => undefined)
    try {
      localServer.start()
      const registry = localServer.getMetricsRegistry()
      assert.ok(registry !== undefined, 'precondition: registry present')
      let releaseGate = (): void => undefined
      const gated = new Promise<void>(resolve => {
        releaseGate = resolve
      })
      const originalMetrics = registry.metrics.bind(registry)
      registry.metrics = async (): Promise<string> => {
        const inner = originalMetrics()
        await gated
        Reflect.set(localServer, 'metricsSampleCount', sentinel)
        return await inner
      }
      const res = new MockServerResponse()
      localServer.emitRequest(buildMetricsRequest(), res)
      await new Promise<void>(resolve => {
        setImmediate(resolve)
      })
      releaseGate()
      await once(res, 'finish')
      const scrapeWarns = warnSpy.mock.calls.filter(
        c =>
          typeof c.arguments[0] === 'string' &&
          (c.arguments[0] as string).includes(METRICS_SOFT_CAP_WARN_PREFIX)
      )
      assert.strictEqual(
        scrapeWarns.length,
        0,
        'soft-cap branch MUST read the pre-yield captured sampleCount; mutating this.metricsSampleCount across the await must not synthesize a warn'
      )
    } finally {
      localServer.stop()
    }
  })

  await it('runMetricsScrape fires exactly one soft-cap warn at cap=1 with the captured sample count (MED-1 positive lock)', async t => {
    const cap = 1
    const localServer = new TestableUIHttpServer(
      createMetricsConfig({ metrics: { enabled: true, softSampleCap: cap } })
    )
    enrichBootstrap(localServer)
    localServer.addStation(buildStationData('station-MED1-pos'))
    localServer.mockListen(t)
    const warnSpy = t.mock.method(logger, 'warn', () => undefined)
    try {
      localServer.start()
      const res = new MockServerResponse()
      localServer.emitRequest(buildMetricsRequest(), res)
      await once(res, 'finish')
      assert.strictEqual(res.statusCode, 200)
      const sampleCount = (res.body ?? '')
        .split('\n')
        .filter(line => line.length > 0 && !line.startsWith('#')).length
      assert.ok(
        sampleCount > cap,
        `precondition: scrape must produce > cap=${cap.toString()} samples; got ${sampleCount.toString()}`
      )
      const scrapeWarns = warnSpy.mock.calls.filter(
        c =>
          typeof c.arguments[0] === 'string' &&
          (c.arguments[0] as string).includes(METRICS_SOFT_CAP_WARN_PREFIX)
      )
      assert.strictEqual(
        scrapeWarns.length,
        1,
        `soft-cap branch MUST fire exactly one warn at cap=${cap.toString()} with > ${cap.toString()} samples; got ${scrapeWarns.length.toString()}`
      )
      const message = scrapeWarns[0].arguments[0] as unknown as string
      assert.ok(
        message.includes(`${sampleCount.toString()} samples`),
        `warn message MUST embed the captured sampleCount=${sampleCount.toString()}; got: ${message}`
      )
      assert.ok(
        message.includes(`soft cap ${cap.toString()}`),
        `warn message MUST embed the configured cap=${cap.toString()}; got: ${message}`
      )
    } finally {
      localServer.stop()
    }
  })

  await it('soft-cap branch fires at cap=0 for any non-zero sample count (lower-boundary lock)', async t => {
    const localServer = new TestableUIHttpServer(
      createMetricsConfig({ metrics: { enabled: true, softSampleCap: 0 } })
    )
    enrichBootstrap(localServer)
    localServer.mockListen(t)
    const warnSpy = t.mock.method(logger, 'warn', () => undefined)
    try {
      localServer.start()
      const res = new MockServerResponse()
      localServer.emitRequest(buildMetricsRequest(), res)
      await once(res, 'finish')
      assert.strictEqual(res.statusCode, 200)
      const scrapeWarns = warnSpy.mock.calls.filter(
        c =>
          typeof c.arguments[0] === 'string' &&
          (c.arguments[0] as string).includes(METRICS_SOFT_CAP_WARN_PREFIX)
      )
      assert.strictEqual(
        scrapeWarns.length,
        1,
        'soft-cap branch MUST fire at cap=0 for any scrape with > 0 samples (strict-greater-than semantics; guards against an over-eager "cap=0 means disabled" early-exit refactor)'
      )
    } finally {
      localServer.stop()
    }
  })

  await it('in-flight scrape survives concurrent stop()', async t => {
    const localServer = new TestableUIHttpServer(createMetricsConfig())
    enrichBootstrap(localServer)
    localServer.addStation(buildStationData('station-capture-lock'))
    localServer.mockListen(t)
    try {
      localServer.start()
      const registry = localServer.getMetricsRegistry()
      assert.ok(registry !== undefined, 'precondition: registry present')
      let releaseGate = (): void => undefined
      const gated = new Promise<void>(resolve => {
        releaseGate = resolve
      })
      const originalMetrics = registry.metrics.bind(registry)
      registry.metrics = async (): Promise<string> => {
        const inner = originalMetrics()
        await gated
        return await inner
      }
      const res = new MockServerResponse()
      localServer.emitRequest(buildMetricsRequest(), res)
      await new Promise<void>(resolve => {
        setImmediate(resolve)
      })
      localServer.stop()
      assert.strictEqual(
        localServer.getMetricsRegistry(),
        undefined,
        'precondition: stop() nulled this.metricsRegistry mid-flight'
      )
      releaseGate()
      await once(res, 'finish')
      assert.strictEqual(
        res.statusCode,
        200,
        'in-flight scrape completes 200 — captured const registry survives mid-flight stop()'
      )
      assert.match(
        res.body ?? '',
        /^# HELP /m,
        'response body is the OLD registry exposition (captured const, not the nulled field)'
      )
    } finally {
      localServer.stop()
    }
  })

  await it('stop() is idempotent — a second stop() is a safe no-op (no throw, no chain rebind)', t => {
    const server = new TestableUIHttpServer(createMetricsConfig())
    enrichBootstrap(server)
    server.mockListen(t)
    server.start()
    server.stop()
    const chainBefore = Reflect.get(server, 'metricsScrapeChain') as Promise<void>
    const registryBefore = server.getMetricsRegistry()
    const attachedBefore = Reflect.get(server, 'transportAttached') as boolean
    assert.doesNotThrow(() => {
      server.stop()
    }, 'second stop() must not throw')
    assert.strictEqual(
      server.getMetricsRegistry(),
      registryBefore,
      '2nd stop: registry stays undefined'
    )
    assert.strictEqual(
      Reflect.get(server, 'transportAttached'),
      attachedBefore,
      '2nd stop: transportAttached stays false'
    )
    assert.strictEqual(
      Reflect.get(server, 'metricsScrapeChain'),
      chainBefore,
      '2nd stop: chain MUST NOT be rebound when metricsRegistry is already undefined'
    )
  })

  await it('stop() clears the client-notification debounce timer on every invocation (outside the metricsRegistry guard)', t => {
    const localServer = new TestableUIHttpServer(createMetricsConfig())
    enrichBootstrap(localServer)
    localServer.mockListen(t)
    localServer.start()
    ;(
      localServer as unknown as { scheduleClientNotification: () => void }
    ).scheduleClientNotification()
    const installed = Reflect.get(localServer, 'clientNotificationDebounceTimer') as
      | NodeJS.Timeout
      | undefined
    assert.ok(installed !== undefined, 'precondition: debounce timer installed')
    const clearedHandles: unknown[] = []
    const originalClearTimeout = globalThis.clearTimeout
    globalThis.clearTimeout = ((handle?: NodeJS.Timeout): void => {
      clearedHandles.push(handle)
      originalClearTimeout(handle)
    }) as typeof globalThis.clearTimeout
    try {
      // Measure delta within each stop() so that clearTimeout calls
      // from scheduleClientNotification() (which clears its own stale
      // handle before installing a fresh one) don't contaminate the
      // count attributable to stop().
      const beforeStop1 = clearedHandles.length
      localServer.stop()
      const afterStop1 = clearedHandles.length
      assert.strictEqual(
        afterStop1 - beforeStop1,
        1,
        '1st stop() MUST invoke clearTimeout exactly once'
      )
      assert.strictEqual(
        clearedHandles[afterStop1 - 1],
        installed,
        '1st stop() clears the originally installed handle'
      )
      ;(
        localServer as unknown as { scheduleClientNotification: () => void }
      ).scheduleClientNotification()
      const reinstalled = Reflect.get(localServer, 'clientNotificationDebounceTimer') as
        | NodeJS.Timeout
        | undefined
      assert.ok(reinstalled !== undefined, 'precondition: 2nd timer installed after first stop()')
      const beforeStop2 = clearedHandles.length
      localServer.stop()
      const afterStop2 = clearedHandles.length
      assert.strictEqual(
        afterStop2 - beforeStop2,
        1,
        '2nd stop() MUST invoke clearTimeout exactly once — the call sits OUTSIDE the metricsRegistry guard'
      )
      assert.strictEqual(
        clearedHandles[afterStop2 - 1],
        reinstalled,
        '2nd stop() clears the re-installed handle (no leak across cycles)'
      )
    } finally {
      globalThis.clearTimeout = originalClearTimeout
    }
  })

  await it('attachTransport() observes transportAttached === true (one-shot guard set BEFORE hook invocation)', t => {
    const server = new TestableUIHttpServer(createMetricsConfig())
    enrichBootstrap(server)
    server.mockListen(t)
    let observedDuringAttach: unknown = 'unset'
    const proto = Reflect.getPrototypeOf(server) as { attachTransport: () => void }
    const origAttach = proto.attachTransport.bind(server)
    ;(server as unknown as { attachTransport: () => void }).attachTransport = () => {
      observedDuringAttach = Reflect.get(server, 'transportAttached')
      origAttach()
    }
    try {
      server.start()
      assert.strictEqual(
        observedDuringAttach,
        true,
        'transportAttached MUST be true while attachTransport runs (guards re-entry / nested start())'
      )
    } finally {
      server.stop()
    }
  })
})
