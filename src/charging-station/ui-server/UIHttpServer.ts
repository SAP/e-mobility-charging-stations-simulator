import type { IncomingMessage, ServerResponse } from 'node:http'

import { getReasonPhrase, StatusCodes } from 'http-status-codes'
import { createGzip } from 'node:zlib'
import { Gauge, type GaugeConfiguration, Registry } from 'prom-client'

import type { ChargingStationData, ConnectorEntry, ConnectorStatus } from '../../types/index.js'
import type { IBootstrap } from '../IBootstrap.js'

import { BaseError } from '../../exception/index.js'
import {
  ApplicationProtocolVersion,
  MapStringifyFormat,
  type ProcedureName,
  type Protocol,
  type ProtocolRequest,
  type ProtocolResponse,
  type ProtocolVersion,
  type RequestPayload,
  ResponseStatus,
  type UIServerConfiguration,
  type UUIDv4,
} from '../../types/index.js'
import { generateUUID, getErrorMessage, JSONStringify, logger } from '../../utils/index.js'
import { AbstractUIServer } from './AbstractUIServer.js'
import {
  DEFAULT_COMPRESSION_THRESHOLD_BYTES,
  DEFAULT_MAX_PAYLOAD_SIZE_BYTES,
  PayloadTooLargeError,
  readLimitedBody,
} from './UIServerSecurity.js'
import { HttpMethod, isProtocolAndVersionSupported } from './UIServerUtils.js'

const moduleName = 'UIHttpServer'

/**
 * Soft cardinality cap for the Prometheus exposition. When a single scrape
 * emits more samples than this threshold, a single `logger.warn` is logged
 * and the response is still served in full. There is no truncation and no
 * scrape failure; the operator decides whether to disable the endpoint or
 * scale the threshold.
 */
export const METRICS_SOFT_SAMPLE_CAP = 5_000

const METRICS_PATHNAME = '/metrics'

/**
 * Subset of {@link AbstractUIServer} consumed by the metrics gauge helpers.
 * Restricting helpers to the `listChargingStationData` projection keeps them
 * decoupled from `this`-rebound contexts inside `collect()` callbacks.
 */
type ChargingStationDataProvider = Pick<AbstractUIServer, 'listChargingStationData'>

/**
 * @deprecated Use UIMCPServer (ApplicationProtocol.MCP) instead. Will be removed in a future major version.
 */
export class UIHttpServer extends AbstractUIServer {
  protected override readonly uiServerType = 'UI HTTP Server'

  private readonly acceptsGzip: Map<UUIDv4, boolean>
  private metricsRegistry?: Registry
  /**
   * Per-scrape sample counter. Reset to 0 at the start of each scrape and
   * read after `Registry.metrics()` resolves. Mutated by the `accountSamples`
   * closure captured by every `collect()` callback in {@link buildMetricsRegistry}.
   * **Invariant**: concurrency safety relies on {@link metricsScrapeChain}:
   * every scrape (`reset → await Registry.metrics() → read`) runs as a single
   * link in a serial promise chain, so no two scrapes interleave their counter
   * mutations. Removing the chain or making any `collect()` callback `async`
   * (and thus potentially concurrent within a scrape) breaks this invariant.
   */
  private metricsSampleCount = 0
  private metricsScrapeChain: Promise<void> = Promise.resolve()

  public constructor (
    protected override readonly uiServerConfiguration: UIServerConfiguration,
    bootstrap: IBootstrap
  ) {
    super(uiServerConfiguration, bootstrap)
    this.acceptsGzip = new Map<UUIDv4, boolean>()
  }

  public sendRequest (request: ProtocolRequest): void {
    switch (this.uiServerConfiguration.version) {
      case ApplicationProtocolVersion.VERSION_20:
        this.httpServer.emit('request', request)
        break
    }
  }

  public sendResponse (response: ProtocolResponse): void {
    const [uuid, payload] = response
    try {
      if (this.hasResponseHandler(uuid)) {
        const res = this.responseHandlers.get(uuid) as ServerResponse
        const body = JSONStringify(payload, undefined, MapStringifyFormat.object)
        const shouldCompress =
          this.acceptsGzip.get(uuid) === true &&
          Buffer.byteLength(body) >= DEFAULT_COMPRESSION_THRESHOLD_BYTES

        if (shouldCompress) {
          res.writeHead(this.responseStatusToStatusCode(payload.status), {
            'Content-Encoding': 'gzip',
            'Content-Type': 'application/json',
            Vary: 'Accept-Encoding',
          })
          const gzip = createGzip()
          gzip.pipe(res)
          gzip.end(body)
        } else {
          res
            .writeHead(this.responseStatusToStatusCode(payload.status), {
              'Content-Type': 'application/json',
            })
            .end(body)
        }
      } else {
        logger.error(
          `${this.logPrefix(moduleName, 'sendResponse')} Response for unknown request id: ${uuid}`
        )
      }
    } catch (error) {
      logger.error(
        `${this.logPrefix(moduleName, 'sendResponse')} Error at sending response id '${uuid}':`,
        error
      )
    } finally {
      this.responseHandlers.delete(uuid)
      this.acceptsGzip.delete(uuid)
    }
  }

  /**
   * @deprecated Use UIMCPServer (ApplicationProtocol.MCP) instead. Will be removed in a future major version.
   */
  public start (): void {
    this.httpServer.on('request', this.requestListener.bind(this))
    if (
      this.uiServerConfiguration.metrics?.enabled === true &&
      this.metricsRegistry === undefined
    ) {
      this.metricsRegistry = this.buildMetricsRegistry()
    }
    this.startHttpServer()
  }

  /**
   * Stop the HTTP UI server and release any Prometheus registry held by
   * {@link metricsRegistry}.
   * **Invariant**: the registry clear is sequenced AFTER any in-flight scrape
   * via `metricsScrapeChain.finally`. Calling `registry.clear()` synchronously
   * would race a running `collect()` callback's `this.reset()`. The terminal
   * `.catch(() => undefined)` guarantees the chain field always points to a
   * handled promise (no `UnhandledPromiseRejection` if the last in-flight
   * scrape rejected and no further scrape is queued).
   */
  public override stop (): void {
    if (this.metricsRegistry !== undefined) {
      const registry = this.metricsRegistry
      this.metricsScrapeChain = this.metricsScrapeChain
        .finally(() => {
          registry.clear()
        })
        .catch(() => undefined)
      this.metricsRegistry = undefined
    }
    super.stop()
  }

  /**
   * Build the Prometheus `Registry` populated with every gauge exposed by
   * the simulator. Each gauge declares an explicit source field via its
   * `collect()` callback; there is no generic property iteration so adding
   * a new field on `ChargingStationData` does NOT silently expose it
   * (PII allowlist invariant).
   * **Invariant**: all `collect()` callbacks registered here are SYNCHRONOUS.
   * An async `collect` would let `prom-client` interleave them within a single
   * `Registry.metrics()` call, racing on {@link metricsSampleCount}.
   * @returns The populated registry; `Registry.metrics()` renders the body.
   */
  private buildMetricsRegistry (): Registry {
    const registry = new Registry()
    const bootstrap = this.getBootstrap()
    // `self` captures the UIHttpServer instance for `collect()` callbacks
    // where `this` is rebound to the Gauge by prom-client.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this
    const accountSamples = (n: number): void => {
      this.metricsSampleCount += n
    }

    /** Global gauges. */

    defineGauge(registry, {
      collect (this: Gauge<'version'>) {
        this.reset()
        this.labels({ version: bootstrap.getState().version }).set(1)
        accountSamples(1)
      },
      help: 'Simulator process information.',
      labelNames: ['version'] as const,
      name: 'simulator_info',
    })

    defineGauge(registry, {
      collect (this: Gauge) {
        this.reset()
        this.set(bootstrap.getState().started ? 1 : 0)
        accountSamples(1)
      },
      help: '1 when the simulator is started, 0 otherwise.',
      name: 'simulator_started',
    })

    defineGauge(registry, {
      collect (this: Gauge) {
        this.reset()
        this.set(bootstrap.getState().templateStatistics.size)
        accountSamples(1)
      },
      help: 'Number of charging station templates configured.',
      name: 'simulator_charging_station_templates_total',
    })

    // Aggregate counters across templates. Tuple shape: [metric name, key, help].
    // HELP text is preserved verbatim per public-API stability (Prometheus
    // exposition is observable to operators).
    const stationAggregates = [
      [
        'simulator_charging_stations_configured_total',
        'configured',
        'Number of charging stations configured across all templates.',
      ],
      [
        'simulator_charging_stations_provisioned_total',
        'provisioned',
        'Number of charging stations provisioned across all templates.',
      ],
      [
        'simulator_charging_stations_added_total',
        'added',
        'Number of charging stations added in the current process.',
      ],
      [
        'simulator_charging_stations_started_total',
        'started',
        'Number of charging stations currently started.',
      ],
    ] as const
    for (const [name, key, help] of stationAggregates) {
      defineGauge(registry, {
        collect (this: Gauge) {
          let total = 0
          for (const t of bootstrap.getState().templateStatistics.values()) {
            total += t[key]
          }
          this.reset()
          this.set(total)
          accountSamples(1)
        },
        help,
        name,
      })
    }

    defineGauge(registry, {
      collect (this: Gauge) {
        this.reset()
        this.set(self.getChargingStationsCount())
        accountSamples(1)
      },
      help: 'Number of charging station snapshots cached on the UI server.',
      name: 'simulator_ui_server_known_stations_total',
    })

    for (const [name, key] of [
      ['simulator_template_added', 'added'],
      ['simulator_template_configured', 'configured'],
      ['simulator_template_provisioned', 'provisioned'],
      ['simulator_template_started', 'started'],
    ] as const) {
      defineGauge(registry, {
        collect (this: Gauge<'template'>) {
          this.reset()
          for (const [templateName, t] of bootstrap.getState().templateStatistics) {
            this.labels({ template: templateName }).set(t[key])
            accountSamples(1)
          }
        },
        help: `Per-template '${key}' charging stations counter.`,
        labelNames: ['template'] as const,
        name,
      })
    }

    /** Per charging station gauges. */

    defineGauge(registry, {
      collect (
        this: Gauge<
          'current_out_type' | 'firmware_version' | 'hash_id' | 'model' | 'ocpp_version' | 'vendor'
        >
      ) {
        this.reset()
        for (const data of self.listChargingStationData()) {
          this.labels({
            current_out_type: stringLabel(data.stationInfo.currentOutType),
            firmware_version: stringLabel(data.stationInfo.firmwareVersion),
            hash_id: data.stationInfo.hashId,
            model: stringLabel(data.stationInfo.chargePointModel),
            ocpp_version: stringLabel(data.stationInfo.ocppVersion),
            vendor: stringLabel(data.stationInfo.chargePointVendor),
          }).set(1)
          accountSamples(1)
        }
      },
      help: 'Static information for the charging station (vendor / model / firmware / ocpp).',
      labelNames: [
        'hash_id',
        'vendor',
        'model',
        'firmware_version',
        'ocpp_version',
        'current_out_type',
      ] as const,
      name: 'simulator_station_info',
    })

    addPerStationBoolean(
      registry,
      accountSamples,
      this,
      'simulator_station_started',
      '1 when the charging station is started, 0 otherwise.',
      data => data.started
    )

    defineGauge(registry, {
      collect (this: Gauge<'hash_id'>) {
        this.reset()
        for (const data of self.listChargingStationData()) {
          if (data.wsState !== undefined) {
            this.labels({ hash_id: data.stationInfo.hashId }).set(data.wsState)
            accountSamples(1)
          }
        }
      },
      help: 'WebSocket readyState (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED).',
      labelNames: ['hash_id'] as const,
      name: 'simulator_station_ws_state',
    })

    defineGauge(registry, {
      collect (this: Gauge<'hash_id'>) {
        this.reset()
        for (const data of self.listChargingStationData()) {
          const direct = data.connectors.length
          let fromEvses = 0
          for (const evse of data.evses) {
            fromEvses += evse.evseStatus.connectors.size
          }
          const count = direct > 0 ? direct : fromEvses
          this.labels({ hash_id: data.stationInfo.hashId }).set(count)
          accountSamples(1)
        }
      },
      help: 'Number of connectors of the charging station.',
      labelNames: ['hash_id'] as const,
      name: 'simulator_station_connectors_total',
    })

    addPerStationNumeric(
      registry,
      accountSamples,
      this,
      'simulator_station_evses_total',
      'Number of EVSEs of the charging station.',
      data => data.evses.length
    )

    addPerStationNumeric(
      registry,
      accountSamples,
      this,
      'simulator_station_max_power_watts',
      'Maximum power of the charging station, in Watts.',
      data => data.stationInfo.maximumPower
    )

    addPerStationNumeric(
      registry,
      accountSamples,
      this,
      'simulator_station_max_amperage_amperes',
      'Maximum amperage of the charging station, in Amperes.',
      data => data.stationInfo.maximumAmperage
    )

    addPerStationNumeric(
      registry,
      accountSamples,
      this,
      'simulator_station_voltage_out_volts',
      'Voltage output of the charging station, in Volts.',
      data => data.stationInfo.voltageOut
    )

    addPerStationNumeric(
      registry,
      accountSamples,
      this,
      'simulator_station_data_timestamp_seconds',
      'Unix epoch (seconds) at which the charging station snapshot was emitted.',
      data => Math.floor(data.timestamp / 1000)
    )

    defineGauge(registry, {
      collect (this: Gauge<'hash_id' | 'status'>) {
        this.reset()
        for (const data of self.listChargingStationData()) {
          const status = data.bootNotificationResponse?.status
          if (typeof status === 'string') {
            this.labels({ hash_id: data.stationInfo.hashId, status }).set(1)
            accountSamples(1)
          }
        }
      },
      help: 'BootNotification status (one-hot).',
      labelNames: ['hash_id', 'status'] as const,
      name: 'simulator_station_boot_status_info',
    })

    addPerStationNumeric(
      registry,
      accountSamples,
      this,
      'simulator_station_boot_heartbeat_interval_seconds',
      'BootNotification heartbeat interval, in seconds.',
      data => data.bootNotificationResponse?.interval
    )

    addPerStationBoolean(
      registry,
      accountSamples,
      this,
      'simulator_station_atg_enabled',
      '1 when the ATG is enabled in configuration, 0 otherwise.',
      data => data.automaticTransactionGenerator?.automaticTransactionGenerator?.enable === true
    )

    addPerStationInfoLabel(
      registry,
      accountSamples,
      this,
      'simulator_station_diagnostics_status_info',
      'Most recent DiagnosticsStatusNotification status (one-hot).',
      'status',
      data => data.stationInfo.diagnosticsStatus
    )

    addPerStationInfoLabel(
      registry,
      accountSamples,
      this,
      'simulator_station_firmware_status_info',
      'Most recent FirmwareStatusNotification status (one-hot).',
      'status',
      data => data.stationInfo.firmwareStatus
    )

    addPerStationNumeric(
      registry,
      accountSamples,
      this,
      'simulator_station_ocpp_config_keys_total',
      'Number of OCPP configuration keys advertised by the charging station.',
      data => data.ocppConfiguration.configurationKey?.length ?? 0
    )

    /** Per connector gauges. */

    addConnectorOneHot(
      registry,
      accountSamples,
      this,
      'simulator_connector_status_info',
      'Connector status (one-hot).',
      'status',
      cs => cs.status
    )
    addConnectorOneHot(
      registry,
      accountSamples,
      this,
      'simulator_connector_boot_status_info',
      'Connector boot status (one-hot).',
      'status',
      cs => cs.bootStatus
    )
    addConnectorOneHot(
      registry,
      accountSamples,
      this,
      'simulator_connector_availability_info',
      'Connector availability (one-hot).',
      'availability',
      cs => cs.availability
    )
    addConnectorOneHot(
      registry,
      accountSamples,
      this,
      'simulator_connector_error_code_info',
      'Connector OCPP error code (one-hot).',
      'error_code',
      cs => cs.errorCode
    )
    addConnectorOneHot(
      registry,
      accountSamples,
      this,
      'simulator_connector_type_info',
      'Connector physical type (one-hot).',
      'connector_type',
      cs => cs.type
    )

    addConnectorBoolean(
      registry,
      accountSamples,
      this,
      'simulator_connector_locked',
      '1 when the connector is locked, 0 otherwise.',
      cs => cs.locked === true
    )
    addConnectorBoolean(
      registry,
      accountSamples,
      this,
      'simulator_connector_transaction_started',
      '1 when a transaction is currently started on the connector.',
      cs => cs.transactionStarted === true
    )
    addConnectorBoolean(
      registry,
      accountSamples,
      this,
      'simulator_connector_transaction_pending',
      '1 when a transaction is pending on the connector.',
      cs => cs.transactionPending === true
    )
    addConnectorBoolean(
      registry,
      accountSamples,
      this,
      'simulator_connector_transaction_remote_started',
      '1 when the current transaction was remote-started.',
      cs => cs.transactionRemoteStarted === true
    )
    addConnectorBoolean(
      registry,
      accountSamples,
      this,
      'simulator_connector_reservation_active',
      '1 when an active reservation is set on the connector.',
      cs => cs.reservation != null
    )

    addConnectorNumeric(
      registry,
      accountSamples,
      this,
      'simulator_connector_transaction_seq_no',
      'Last transaction event sequence number sent on the connector.',
      cs => cs.transactionSeqNo
    )
    addConnectorNumeric(
      registry,
      accountSamples,
      this,
      'simulator_connector_transaction_event_queue_size',
      'Number of pending transaction events queued on the connector.',
      cs => cs.transactionEventQueue?.length ?? 0
    )
    addConnectorNumeric(
      registry,
      accountSamples,
      this,
      'simulator_connector_transaction_id',
      'Numeric transaction id of the active transaction on the connector. NEVER used as a label (cardinality).',
      cs => (typeof cs.transactionId === 'number' ? cs.transactionId : undefined)
    )
    addConnectorNumeric(
      registry,
      accountSamples,
      this,
      'simulator_connector_transaction_start_seconds',
      'Unix epoch (seconds) at which the active transaction started on the connector.',
      cs =>
        cs.transactionStart != null ? Math.floor(cs.transactionStart.getTime() / 1000) : undefined
    )
    addConnectorNumeric(
      registry,
      accountSamples,
      this,
      'simulator_connector_transaction_energy_active_import_register_wh',
      'Active energy imported during the current transaction, in Wh.',
      cs => cs.transactionEnergyActiveImportRegisterValue
    )
    addConnectorNumeric(
      registry,
      accountSamples,
      this,
      'simulator_connector_energy_active_import_register_wh',
      'Cumulative active energy imported by the connector meter, in Wh.',
      cs => cs.energyActiveImportRegisterValue
    )
    addConnectorNumeric(
      registry,
      accountSamples,
      this,
      'simulator_connector_max_power_watts',
      'Maximum power of the connector, in Watts.',
      cs => cs.maximumPower
    )
    addConnectorNumeric(
      registry,
      accountSamples,
      this,
      'simulator_connector_charging_profiles_total',
      'Number of charging profiles installed on the connector.',
      cs => cs.chargingProfiles?.length ?? 0
    )
    addConnectorNumericFromEntry(
      registry,
      accountSamples,
      this,
      'simulator_connector_evse_id',
      'EVSE id the connector belongs to.',
      entry => entry.evseId
    )

    return registry
  }

  /**
   * Schedule a `/metrics` scrape onto {@link metricsScrapeChain} so concurrent
   * scrape requests serialize through a single FIFO chain (preserves the
   * {@link metricsSampleCount} invariant). The function itself is synchronous —
   * the inner async work runs in a `.then()` continuation and rejections
   * propagate to the returned promise, which the listener-side `.catch()`
   * converts to HTTP 500.
   * @param res The HTTP response to write the exposition body to.
   * @param registry The Prometheus registry the scrape reads from.
   * @returns A promise resolving when the scrape link completes (success or failure).
   */
  private handleMetricsRequest (res: ServerResponse, registry: Registry): Promise<void> {
    this.metricsScrapeChain = this.metricsScrapeChain
      .catch(() => undefined)
      .then(async () => {
        this.metricsSampleCount = 0
        const body = await registry.metrics()
        const cap = this.uiServerConfiguration.metrics?.softSampleCap ?? METRICS_SOFT_SAMPLE_CAP
        if (this.metricsSampleCount > cap) {
          logger.warn(
            `${this.logPrefix(moduleName, 'handleMetricsRequest')} ` +
              `Prometheus scrape produced ${this.metricsSampleCount.toString()} samples ` +
              `(soft cap ${cap.toString()})`
          )
        }
        if (!res.headersSent && !res.writableEnded) {
          res
            .writeHead(StatusCodes.OK, {
              'Content-Type': registry.contentType,
            })
            .end(body)
        }
        // Explicit return required by `promise/always-return` lint rule.
        return undefined
      })
    return this.metricsScrapeChain
  }

  private async handleRequestBody (
    req: IncomingMessage,
    res: ServerResponse,
    uuid: UUIDv4,
    version: ProtocolVersion,
    procedureName: ProcedureName
  ): Promise<void> {
    const buffer = await readLimitedBody(req, DEFAULT_MAX_PAYLOAD_SIZE_BYTES)
    let requestPayload: RequestPayload
    try {
      requestPayload = JSON.parse(buffer.toString()) as RequestPayload
    } catch (error) {
      this.sendResponse(
        this.buildProtocolResponse(uuid, {
          errorMessage: getErrorMessage(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          status: ResponseStatus.FAILURE,
        })
      )
      return
    }
    const service = this.uiServices.get(version)
    if (service == null || typeof service.requestHandler !== 'function') {
      this.sendResponse(this.buildProtocolResponse(uuid, { status: ResponseStatus.FAILURE }))
      return
    }
    const protocolResponse = await service.requestHandler(
      this.buildProtocolRequest(uuid, procedureName, requestPayload)
    )
    if (protocolResponse != null) {
      this.sendResponse(protocolResponse)
    } else {
      this.sendResponse(this.buildProtocolResponse(uuid, { status: ResponseStatus.SUCCESS }))
    }
  }

  private isMetricsRequest (req: IncomingMessage): boolean {
    if (req.method !== HttpMethod.GET && req.method !== HttpMethod.HEAD) {
      return false
    }
    const rawUrl = req.url ?? ''
    try {
      const { pathname } = new URL(rawUrl, 'http://localhost')
      return pathname === METRICS_PATHNAME
    } catch {
      return false
    }
  }

  private requestListener (req: IncomingMessage, res: ServerResponse): void {
    const prologue = this.runRequestPrologue(req)
    if (!prologue.ok) {
      this.renderDenial(res, prologue)
      return
    }
    if (!this.authenticate(req)) {
      this.renderDenial(res, this.getUnauthorizedDenial())
      return
    }

    if (this.metricsRegistry !== undefined && this.isMetricsRequest(req)) {
      const registry = this.metricsRegistry
      this.handleMetricsRequest(res, registry).catch((error: unknown) => {
        logger.error(
          `${this.logPrefix(moduleName, 'requestListener.metrics')} Metrics handler error:`,
          error
        )
        if (!res.headersSent) {
          res.writeHead(StatusCodes.INTERNAL_SERVER_ERROR, { 'Content-Type': 'text/plain' }).end()
        }
      })
      return
    }

    const uuid = generateUUID()
    this.responseHandlers.set(uuid, res)
    const acceptEncoding = req.headers['accept-encoding'] ?? ''
    this.acceptsGzip.set(uuid, /\bgzip\b/.test(acceptEncoding))
    res.on('close', () => {
      this.responseHandlers.delete(uuid)
      this.acceptsGzip.delete(uuid)
    })

    try {
      // Expected request URL pathname: /ui/:version/:procedureName
      const rawUrl = req.url ?? ''
      const { pathname } = new URL(rawUrl, 'http://localhost')
      const parts = pathname.split('/').filter(Boolean)
      if (parts.length < 3) {
        throw new BaseError(
          `Malformed URL path: '${pathname}' (expected /ui/:version/:procedureName)`
        )
      }
      const [protocol, version, procedureName] = parts as [Protocol, ProtocolVersion, ProcedureName]
      const fullProtocol = `${protocol}${version}`
      if (!isProtocolAndVersionSupported(fullProtocol)) {
        throw new BaseError(`Unsupported UI protocol version: '${fullProtocol}'`)
      }
      this.registerProtocolVersionUIService(version)

      req.on('error', error => {
        logger.error(
          `${this.logPrefix(moduleName, 'requestListener.req.onerror')} Error on HTTP request:`,
          error
        )
        if (!res.headersSent) {
          this.sendResponse(this.buildProtocolResponse(uuid, { status: ResponseStatus.FAILURE }))
        } else {
          this.responseHandlers.delete(uuid)
        }
      })

      if (req.method !== HttpMethod.POST) {
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        throw new BaseError(`Unsupported HTTP method: '${req.method}'`)
      }

      this.handleRequestBody(req, res, uuid, version, procedureName).catch((error: unknown) => {
        if (error instanceof PayloadTooLargeError) {
          this.renderDenial(res, {
            reasonPhrase: getReasonPhrase(StatusCodes.REQUEST_TOO_LONG),
            status: StatusCodes.REQUEST_TOO_LONG,
          })
          return
        }
        logger.error(
          `${this.logPrefix(moduleName, 'requestListener.service.requestHandler')} UI service request handler error:`,
          error
        )
        this.sendResponse(this.buildProtocolResponse(uuid, { status: ResponseStatus.FAILURE }))
      })
    } catch (error) {
      logger.error(
        `${this.logPrefix(moduleName, 'requestListener')} Handle HTTP request error:`,
        error
      )
      this.sendResponse(this.buildProtocolResponse(uuid, { status: ResponseStatus.FAILURE }))
    }
  }

  private responseStatusToStatusCode (status: ResponseStatus): StatusCodes {
    switch (status) {
      case ResponseStatus.FAILURE:
        return StatusCodes.BAD_REQUEST
      case ResponseStatus.SUCCESS:
        return StatusCodes.OK
      default:
        return StatusCodes.INTERNAL_SERVER_ERROR
    }
  }
}

/**
 * Construct and register a Prometheus `Gauge` whose `labelNames` are narrowed
 * to a string-literal union via `as const`. The returned reference is owned
 * by `registry` (lifecycle managed by `Registry.clear()`); callers may ignore
 * it because each gauge's `collect()` callback receives the gauge as its
 * `this` binding.
 * @param registry The destination registry; auto-injected into `registers`.
 * @param config Gauge configuration WITHOUT `registers` (injected here to
 * prevent registry drift).
 * @returns The constructed `Gauge<L>` so a non-arrow `collect (this: Gauge<L>)`
 * can be type-checked end-to-end.
 */
const defineGauge = <L extends string = never>(
  registry: Registry,
  config: Omit<GaugeConfiguration<L>, 'registers'>
): Gauge<L> => new Gauge<L>({ ...config, registers: [registry] })

const stringLabel = (value: string | undefined): string => value ?? ''

const addPerStationNumeric = (
  registry: Registry,
  account: (n: number) => void,
  server: ChargingStationDataProvider,
  name: string,
  help: string,
  pick: (data: ChargingStationData) => number | undefined
): void => {
  defineGauge(registry, {
    collect (this: Gauge<'hash_id'>) {
      this.reset()
      for (const data of server.listChargingStationData()) {
        const v = pick(data)
        if (typeof v === 'number') {
          this.labels({ hash_id: data.stationInfo.hashId }).set(v)
          account(1)
        }
      }
    },
    help,
    labelNames: ['hash_id'] as const,
    name,
  })
}

const addPerStationBoolean = (
  registry: Registry,
  account: (n: number) => void,
  server: ChargingStationDataProvider,
  name: string,
  help: string,
  pick: (data: ChargingStationData) => boolean
): void => {
  defineGauge(registry, {
    collect (this: Gauge<'hash_id'>) {
      this.reset()
      for (const data of server.listChargingStationData()) {
        this.labels({ hash_id: data.stationInfo.hashId }).set(pick(data) ? 1 : 0)
        account(1)
      }
    },
    help,
    labelNames: ['hash_id'] as const,
    name,
  })
}

const addPerStationInfoLabel = (
  registry: Registry,
  account: (n: number) => void,
  server: ChargingStationDataProvider,
  name: string,
  help: string,
  labelName: string,
  pick: (data: ChargingStationData) => string | undefined
): void => {
  defineGauge(registry, {
    collect (this: Gauge) {
      this.reset()
      for (const data of server.listChargingStationData()) {
        const v = pick(data)
        if (typeof v === 'string') {
          this.labels({ hash_id: data.stationInfo.hashId, [labelName]: v }).set(1)
          account(1)
        }
      }
    },
    help,
    labelNames: ['hash_id', labelName],
    name,
  })
}

/**
 * Iterate connectors using the OCPP-version-driven either-or rule shared
 * with `simulator_station_connectors_total`:
 * - When `data.connectors` is non-empty, the station is in OCPP 1.6
 *   connector-mode; EVSE entries are ignored.
 * - Otherwise (OCPP 2.0.x EVSE-mode), connectors are sourced from
 *   `data.evses[*].evseStatus.connectors`.
 *
 * The two sources are NEVER summed: `buildConnectorEntries` guarantees
 * `data.connectors` is empty when `data.evses` is populated.
 * @param data The charging station data snapshot to iterate.
 * @yields {ConnectorEntry} A connector entry for each connector under the active mode.
 */
const iterateConnectors = function * (data: ChargingStationData): Generator<ConnectorEntry> {
  if (data.connectors.length > 0) {
    for (const entry of data.connectors) {
      yield entry
    }
    return
  }
  for (const evse of data.evses) {
    for (const [connectorId, connectorStatus] of evse.evseStatus.connectors) {
      yield { connectorId, connectorStatus, evseId: evse.evseId }
    }
  }
}

const addConnectorOneHot = (
  registry: Registry,
  account: (n: number) => void,
  server: ChargingStationDataProvider,
  name: string,
  help: string,
  labelName: string,
  pick: (cs: ConnectorStatus) => string | undefined
): void => {
  defineGauge(registry, {
    collect (this: Gauge) {
      this.reset()
      for (const data of server.listChargingStationData()) {
        for (const entry of iterateConnectors(data)) {
          const v = pick(entry.connectorStatus)
          if (typeof v === 'string') {
            this.labels({
              connector_id: entry.connectorId.toString(),
              hash_id: data.stationInfo.hashId,
              [labelName]: v,
            }).set(1)
            account(1)
          }
        }
      }
    },
    help,
    labelNames: ['hash_id', 'connector_id', labelName],
    name,
  })
}

const addConnectorBoolean = (
  registry: Registry,
  account: (n: number) => void,
  server: ChargingStationDataProvider,
  name: string,
  help: string,
  pick: (cs: ConnectorStatus) => boolean
): void => {
  defineGauge(registry, {
    collect (this: Gauge<'connector_id' | 'hash_id'>) {
      this.reset()
      for (const data of server.listChargingStationData()) {
        for (const entry of iterateConnectors(data)) {
          this.labels({
            connector_id: entry.connectorId.toString(),
            hash_id: data.stationInfo.hashId,
          }).set(pick(entry.connectorStatus) ? 1 : 0)
          account(1)
        }
      }
    },
    help,
    labelNames: ['hash_id', 'connector_id'] as const,
    name,
  })
}

const addConnectorNumeric = (
  registry: Registry,
  account: (n: number) => void,
  server: ChargingStationDataProvider,
  name: string,
  help: string,
  pick: (cs: ConnectorStatus) => number | undefined
): void => {
  defineGauge(registry, {
    collect (this: Gauge<'connector_id' | 'hash_id'>) {
      this.reset()
      for (const data of server.listChargingStationData()) {
        for (const entry of iterateConnectors(data)) {
          const v = pick(entry.connectorStatus)
          if (typeof v === 'number') {
            this.labels({
              connector_id: entry.connectorId.toString(),
              hash_id: data.stationInfo.hashId,
            }).set(v)
            account(1)
          }
        }
      }
    },
    help,
    labelNames: ['hash_id', 'connector_id'] as const,
    name,
  })
}

const addConnectorNumericFromEntry = (
  registry: Registry,
  account: (n: number) => void,
  server: ChargingStationDataProvider,
  name: string,
  help: string,
  pick: (entry: ConnectorEntry) => number | undefined
): void => {
  defineGauge(registry, {
    collect (this: Gauge<'connector_id' | 'hash_id'>) {
      this.reset()
      for (const data of server.listChargingStationData()) {
        for (const entry of iterateConnectors(data)) {
          const v = pick(entry)
          if (typeof v === 'number') {
            this.labels({
              connector_id: entry.connectorId.toString(),
              hash_id: data.stationInfo.hashId,
            }).set(v)
            account(1)
          }
        }
      }
    },
    help,
    labelNames: ['hash_id', 'connector_id'] as const,
    name,
  })
}
