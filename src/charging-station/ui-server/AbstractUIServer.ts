import type { WebSocket } from 'ws'

import { getReasonPhrase, StatusCodes } from 'http-status-codes'
import { type IncomingMessage, Server, type ServerResponse } from 'node:http'
import { createServer, type Http2Server } from 'node:http2'
import { Gauge, type GaugeConfiguration, Registry } from 'prom-client'

import type { IBootstrap } from '../IBootstrap.js'
import type { AbstractUIService } from './ui-services/AbstractUIService.js'

import { BaseError } from '../../exception/index.js'
import {
  ApplicationProtocolVersion,
  AuthenticationType,
  type ChargingStationData,
  ConfigurationSection,
  type ConnectorEntry,
  type ConnectorStatus,
  type ProcedureName,
  type ProtocolRequest,
  type ProtocolResponse,
  ProtocolVersion,
  type RequestPayload,
  type ResponsePayload,
  UIRequestOrigin,
  type UIServerConfiguration,
  type UUIDv4,
} from '../../types/index.js'
import { isEmpty, isNotEmptyString, logger, logPrefix } from '../../utils/index.js'
import { UIServiceFactory } from './ui-services/UIServiceFactory.js'
import {
  createUIServerAccessCache,
  resolveUIServerAccess,
  type UIServerAccessCache,
  type UIServerAccessDecision,
} from './UIServerAccessPolicy.js'
import { isLoopback } from './UIServerNet.js'
import {
  createRateLimiter,
  DEFAULT_RATE_LIMIT,
  DEFAULT_RATE_WINDOW_MS,
  isValidCredential,
} from './UIServerSecurity.js'
import { getUsernameAndPasswordFromAuthorizationToken, HttpMethod } from './UIServerUtils.js'

/**
 * Outcome of {@link AbstractUIServer.runRequestPrologue}.
 *
 * Discriminated by `ok`. On `ok: true` the caller proceeds to authentication
 * and protocol handling with the resolved {@link UIServerAccessDecision}
 * (always `allowed: true`). On `ok: false` the caller renders the rejection
 * to its native transport response (HTTP body / WebSocket status line).
 */
type UIServerRequestPrologueResult =
  | {
    readonly decision: Extract<UIServerAccessDecision, { allowed: true }>
    readonly ok: true
  }
  | {
    readonly headers?: Readonly<Record<string, string>>
    readonly ok: false
    readonly reasonPhrase: string
    readonly status: StatusCodes
  }

const CLIENT_NOTIFICATION_DEBOUNCE_MS = 500

const HTTP_HEADERS_TIMEOUT_MS = 5_000
const HTTP_REQUEST_TIMEOUT_MS = 30_000

const moduleName = 'AbstractUIServer'

/**
 * Soft cardinality cap for the Prometheus exposition. When a single scrape
 * emits more samples than this threshold, a single `logger.warn` is logged
 * and the response is still served in full. There is no truncation and no
 * scrape failure; the operator decides whether to disable the endpoint or
 * scale the threshold.
 */
export const METRICS_SOFT_SAMPLE_CAP = 5_000

/**
 * Stable substring prefix of the soft-cap warn message emitted by
 * {@link AbstractUIServer.runMetricsScrape}. Exported so regression specs
 * filter `logger.warn` calls without hard-coding the marketing wording.
 */
export const METRICS_SOFT_CAP_WARN_PREFIX = 'Prometheus scrape produced'

/**
 * Frozen tuple of every label name a Prometheus gauge defined by
 * {@link AbstractUIServer.buildMetricsRegistry} is permitted to emit.
 * `Object.freeze` is honest on arrays (blocks index assignment, `push`,
 * `length`); on `Set` it is a no-op against `.add`/`.delete`. The
 * `as const` annotation pins the literal types. Co-located with
 * {@link METRICS_SOFT_SAMPLE_CAP} as the canonical PII surface: adding a
 * label here is the single, explicit PR action that admits it into the
 * exposition. O(1) membership goes through
 * {@link isMetricsAllowedLabelName}.
 */
export const METRICS_ALLOWED_LABEL_NAMES = Object.freeze([
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
] as const)

/** Label name admitted by {@link METRICS_ALLOWED_LABEL_NAMES}. */
export type MetricsAllowedLabelName = (typeof METRICS_ALLOWED_LABEL_NAMES)[number]

const metricsAllowedLabelNameSet: ReadonlySet<MetricsAllowedLabelName> = new Set(
  METRICS_ALLOWED_LABEL_NAMES
)

/**
 * O(1) type-guard predicate over {@link METRICS_ALLOWED_LABEL_NAMES}.
 * @param name Candidate label name.
 * @returns `true` iff `name` is one of the admitted label names.
 */
export const isMetricsAllowedLabelName = (name: string): name is MetricsAllowedLabelName =>
  (metricsAllowedLabelNameSet as ReadonlySet<string>).has(name)

/**
 * URL pathname under which Prometheus exposition is served on every UI
 * transport (`http`, `ws`, `mcp`). The endpoint is opt-in via
 * `uiServer.metrics.enabled`; the pathname is not configurable. Internal
 * constant — not part of the public API.
 */
const METRICS_PATHNAME = '/metrics'

/**
 * Subset of {@link AbstractUIServer} consumed by the metrics gauge helpers
 * and by the inline `simulator_ui_server_known_stations_total` gauge in
 * {@link AbstractUIServer.buildMetricsRegistry}. Restricting access to this
 * projection keeps the metrics surface decoupled from the concrete UI
 * server class and from `this`-rebound contexts inside `collect()`
 * callbacks.
 */
interface ChargingStationDataProvider {
  getChargingStationsCount(): number
  listChargingStationData(): ChargingStationData[]
}

export abstract class AbstractUIServer {
  protected readonly httpServer: Http2Server | Server
  protected readonly rateLimiter: ReturnType<typeof createRateLimiter>
  protected readonly responseHandlers: Map<UUIDv4, ServerResponse | WebSocket>

  protected abstract readonly uiServerType: string

  protected readonly uiServices: Map<ProtocolVersion, AbstractUIService>

  private readonly accessCache: UIServerAccessCache
  private readonly bootstrap: IBootstrap
  private readonly chargingStations: Map<string, ChargingStationData>
  private readonly chargingStationTemplates: Set<string>
  private clientNotificationDebounceTimer: ReturnType<typeof setTimeout> | undefined
  private metricsRegistry?: Registry
  /**
   * Per-scrape sample counter. Reset to 0 at the start of each scrape and
   * snapshotted into a scrape-local `sampleCount` BEFORE the first `await`
   * (see {@link runMetricsScrape}). Mutated by the `accountSamples`
   * closure captured by every `collect()` callback in {@link buildMetricsRegistry}.
   * Concurrency safety has two layers:
   *   1. Within a `start()` cycle, {@link metricsScrapeChain} serializes
   *      scrapes so no two `reset → Registry.metrics()` interleave their
   *      counter mutations.
   *   2. Across `stop()`/`start()` cycles, where {@link start} reseats the
   *      chain to `Promise.resolve()`, the pre-yield local capture in
   *      {@link runMetricsScrape} frees the soft-cap branch from
   *      cross-cycle reads of this field.
   * Both layers also require the `prom-client` 15.x sync prefix to remain
   * yield-free: `Registry.metrics()` iterates metrics and invokes each
   * `Gauge.get()` (driving its `collect()` callback) synchronously before
   * its first `await`. Every `collect()` callback must therefore be
   * synchronous, and a future `prom-client` release that adds a pre-map
   * `await` (lazy hooks, OTEL bridge, async default-label resolution)
   * would invalidate the pre-yield capture and require revisiting layer 2.
   */
  private metricsSampleCount = 0
  private metricsScrapeChain: Promise<void> = Promise.resolve()
  private transportAttached = false

  public constructor (
    protected readonly uiServerConfiguration: UIServerConfiguration,
    bootstrap: IBootstrap
  ) {
    this.bootstrap = bootstrap
    this.chargingStations = new Map<string, ChargingStationData>()
    this.chargingStationTemplates = new Set<string>()
    switch (this.uiServerConfiguration.version) {
      case ApplicationProtocolVersion.VERSION_11:
        this.httpServer = new Server()
        break
      case ApplicationProtocolVersion.VERSION_20:
        this.httpServer = createServer()
        break
      default:
        throw new BaseError(
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `Unsupported application protocol version ${this.uiServerConfiguration.version} in '${ConfigurationSection.uiServer}' configuration section`
        )
    }
    if ('requestTimeout' in this.httpServer) {
      this.httpServer.requestTimeout = HTTP_REQUEST_TIMEOUT_MS
    }
    if ('headersTimeout' in this.httpServer) {
      this.httpServer.headersTimeout = HTTP_HEADERS_TIMEOUT_MS
    }
    this.responseHandlers = new Map<UUIDv4, ServerResponse | WebSocket>()
    this.rateLimiter = createRateLimiter(DEFAULT_RATE_LIMIT, DEFAULT_RATE_WINDOW_MS)
    this.uiServices = new Map<ProtocolVersion, AbstractUIService>()
    this.accessCache = createUIServerAccessCache()
    this.warnIfMisconfigured()
  }

  public buildProtocolRequest (
    uuid: UUIDv4,
    procedureName: ProcedureName,
    requestPayload: RequestPayload
  ): ProtocolRequest {
    return [uuid, procedureName, requestPayload]
  }

  public buildProtocolResponse (uuid: UUIDv4, responsePayload: ResponsePayload): ProtocolResponse {
    return [uuid, responsePayload]
  }

  public clearCaches (): void {
    this.chargingStations.clear()
    this.chargingStationTemplates.clear()
  }

  public deleteChargingStationData (hashId: string): boolean {
    return this.chargingStations.delete(hashId)
  }

  public getBootstrap (): IBootstrap {
    return this.bootstrap
  }

  public getChargingStationData (hashId: string): ChargingStationData | undefined {
    return this.chargingStations.get(hashId)
  }

  public getChargingStationsCount (): number {
    return this.chargingStations.size
  }

  public getChargingStationTemplates (): string[] {
    return [...this.chargingStationTemplates.values()]
  }

  public hasChargingStationData (hashId: string): boolean {
    return this.chargingStations.has(hashId)
  }

  public hasChargingStationTemplates (template: string): boolean {
    return this.chargingStationTemplates.has(template)
  }

  public hasResponseHandler (uuid: UUIDv4): boolean {
    return this.responseHandlers.has(uuid)
  }

  public listChargingStationData (): ChargingStationData[] {
    return [...this.chargingStations.values()]
  }

  public logPrefix = (modName?: string, methodName?: string, prefixSuffix?: string): string => {
    const logMsgPrefix =
      prefixSuffix != null ? `${this.uiServerType} ${prefixSuffix}` : this.uiServerType
    const logMsg =
      isNotEmptyString(modName) && isNotEmptyString(methodName)
        ? ` ${logMsgPrefix} | ${modName}.${methodName}:`
        : ` ${logMsgPrefix} |`
    return logPrefix(logMsg)
  }

  public scheduleClientNotification (): void {
    if (this.clientNotificationDebounceTimer != null) {
      clearTimeout(this.clientNotificationDebounceTimer)
    }
    this.clientNotificationDebounceTimer = setTimeout(() => {
      this.notifyClients()
      this.clientNotificationDebounceTimer = undefined
    }, CLIENT_NOTIFICATION_DEBOUNCE_MS)
  }

  public async sendInternalRequest (request: ProtocolRequest): Promise<ProtocolResponse> {
    const protocolVersion = ProtocolVersion['0.0.1']
    this.registerProtocolVersionUIService(protocolVersion)
    return await (this.uiServices
      .get(protocolVersion)
      ?.requestHandler(request, { origin: UIRequestOrigin.INTERNAL }) as Promise<ProtocolResponse>)
  }

  public abstract sendRequest (request: ProtocolRequest): void

  public abstract sendResponse (response: ProtocolResponse): void

  public setChargingStationData (hashId: string, data: ChargingStationData): boolean {
    const cachedData = this.chargingStations.get(hashId)
    if (cachedData == null || data.timestamp >= cachedData.timestamp) {
      this.chargingStations.set(hashId, data)
      return true
    }
    return false
  }

  public setChargingStationTemplates (templates: string[] | undefined): void {
    if (templates == null) {
      return
    }
    for (const template of templates) {
      this.chargingStationTemplates.add(template)
    }
  }

  /**
   * Bring the UI server up exactly once. Template-method that builds the
   * Prometheus registry (gated by `uiServer.metrics.enabled`), invokes
   * the subclass {@link attachTransport} hook, then starts the shared
   * HTTP server. The ordering — registry BEFORE listener BEFORE
   * `listen()` — combined with the one-shot {@link transportAttached}
   * guard guarantees no caller can reorder, skip, or re-run transport
   * attachment. The guard is set BEFORE {@link attachTransport} so a
   * throwing hook cannot leave a half-attached server that admits a
   * silent retry; on failure any partially-registered listeners on
   * `httpServer` are stripped, the guard is rolled back, and the throw
   * propagates. A second `start()` without an intervening `stop()`
   * throws {@link BaseError}; recovery requires the explicit
   * `stop()` → `start()` cycle.
   */
  public start (): void {
    if (this.transportAttached) {
      throw new BaseError(
        `${this.uiServerType} start() invoked twice; attachTransport() is one-shot`
      )
    }
    // Fresh lifecycle: drop the chain accreted across prior stop() cycles
    // so captured-registry closures are not retained for the lifetime of
    // the server instance. The prior chain's scheduled registry.clear()
    // still runs against its own captured registry reference.
    this.metricsScrapeChain = Promise.resolve()
    this.buildMetricsRegistryIfEnabled()
    this.transportAttached = true
    try {
      this.attachTransport()
    } catch (error) {
      try {
        this.detachTransport()
      } catch (detachError) {
        logger.error(
          `${this.logPrefix(moduleName, 'start')} Error during detachTransport() on attach failure, continuing rollback:`,
          detachError
        )
      }
      this.httpServer.removeAllListeners('request')
      this.httpServer.removeAllListeners('upgrade')
      this.metricsRegistry = undefined
      this.transportAttached = false
      throw error
    }
    this.startHttpServer()
  }

  /**
   * Bring the UI server down and release any Prometheus registry held on
   * this instance. Two independent orderings coexist:
   *
   * 1. The registry clear is **scheduled** onto
   *    `metricsScrapeChain.finally` so any in-flight scrape finishes
   *    BEFORE `registry.clear()` runs. The terminal
   *    `.catch(() => undefined)` keeps the chain field pointing at a
   *    handled promise so a late rejection cannot escape.
   * 2. The subclass {@link detachTransport} hook and the shared HTTP
   *    server shutdown run **synchronously** in body order (detach →
   *    close → stop services → clear handlers/caches → reset
   *    {@link transportAttached}). They do NOT wait for the scheduled
   *    registry clear; subclass overrides MUST NOT touch state read by
   *    `collect()` callbacks still in the scheduled clear chain.
   *
   * A throw from {@link detachTransport} or from a single
   * `uiService.stop()` is caught and logged so downstream teardown
   * (`stopHttpServer`, remaining services, handlers, caches) still runs.
   * Any other unexpected throw inside the teardown body still
   * propagates, but {@link transportAttached} is reset in a `finally`
   * block so a subsequent `start()` is never permanently locked out.
   */
  public stop (): void {
    try {
      clearTimeout(this.clientNotificationDebounceTimer)
      this.clientNotificationDebounceTimer = undefined
      if (this.metricsRegistry !== undefined) {
        const registry = this.metricsRegistry
        this.metricsScrapeChain = this.metricsScrapeChain
          .finally(() => {
            registry.clear()
          })
          .catch(() => undefined)
        this.metricsRegistry = undefined
      }
      // detachTransport() / uiService.stop() are subclass hooks — see
      // the "throw from detachTransport()" paragraph in the JSDoc above
      // for the catch-and-log rationale.
      try {
        this.detachTransport()
      } catch (error) {
        logger.error(
          `${this.logPrefix(moduleName, 'stop')} Error during detachTransport(), continuing teardown:`,
          error
        )
      }
      this.stopHttpServer()
      for (const uiService of this.uiServices.values()) {
        try {
          uiService.stop()
        } catch (error) {
          logger.error(
            `${this.logPrefix(moduleName, 'stop')} Error during uiService.stop(), continuing teardown:`,
            error
          )
        }
      }
      this.uiServices.clear()
      this.responseHandlers.clear()
      this.clearCaches()
    } finally {
      this.transportAttached = false
    }
  }

  /**
   * Attach the transport's request and/or upgrade listener(s) on
   * `this.httpServer`. Implementations MUST NOT invoke
   * `httpServer.listen()` — the template {@link start} owns lifecycle
   * ordering. Called exactly once per `start()` cycle; the inverse hook
   * is {@link detachTransport}.
   */
  protected abstract attachTransport (): void

  protected authenticate (req: IncomingMessage): boolean {
    if (this.uiServerConfiguration.authentication?.enabled !== true) {
      return true
    }
    if (this.isBasicAuthEnabled()) {
      return this.isValidBasicAuth(req)
    }
    if (this.isProtocolBasicAuthEnabled()) {
      return this.isValidProtocolBasicAuth(req)
    }
    return false
  }

  /**
   * Build and memoize the Prometheus {@link Registry} on the first
   * `start()` when `uiServer.metrics.enabled === true`. Idempotent: a
   * second call after the registry has been built is a no-op. The
   * registry is released by {@link stop} via `metricsScrapeChain.finally`.
   * The `/metrics` route itself is mounted by {@link tryServeMetrics} from
   * each transport listener; this method owns the registry only.
   */
  protected buildMetricsRegistryIfEnabled (): void {
    if (this.uiServerConfiguration.metrics?.enabled !== true) {
      return
    }
    if (this.metricsRegistry !== undefined) {
      return
    }
    this.metricsRegistry = this.buildMetricsRegistry()
  }

  /**
   * Destroy the underlying HTTP/1.1 socket after a denial when the
   * client has not finished writing. "Pending" = HTTP/1.1 request whose
   * body the client has not finished sending (`req.complete === false`).
   * HTTP/2 streams self-close via `res.end()`; calling `req.destroy()`
   * on an HTTP/2 stream is redundant and may raise
   * `ERR_HTTP2_INVALID_STREAM` on some Node versions. The `req.complete`
   * guard skips teardown once the client has finished writing (the
   * socket is owned by the keep-alive pool).
   * @param req Incoming HTTP request.
   */
  protected destroyHttp1SocketIfPending (req: IncomingMessage): void {
    if (req.httpVersionMajor >= 2) {
      return
    }
    if (!req.complete) {
      req.destroy()
    }
  }

  /**
   * Symmetric inverse of {@link attachTransport}. Default no-op because
   * `httpServer.removeAllListeners()` in `stopHttpServer` already strips
   * every listener installed on the shared server. Subclasses with
   * transport-specific resources outliving the HTTP listener override
   * to release them. Invoked from {@link stop} BEFORE `stopHttpServer()`;
   * see {@link stop} point 2 for the constraint on overrides w.r.t. the
   * scheduled registry clear chain.
   */
  protected detachTransport (): void {
    /* Default: no resources to release */
  }

  /**
   * Connection-close header to attach on denial responses.
   *
   * HTTP/2 forbids `Connection` as a connection-specific header; emitting it
   * triggers a Node `UnsupportedWarning` and the value is dropped. Streams are
   * closed by `res.end()` instead. HTTP/1.1 responses keep the explicit close
   * to terminate keep-alive on denial.
   * @returns Header object spreadable into `writeHead` (empty on HTTP/2).
   */
  protected getConnectionCloseHeader (): Record<string, string> {
    return this.uiServerConfiguration.version === ApplicationProtocolVersion.VERSION_20
      ? {}
      : { Connection: 'close' }
  }

  /**
   * Accessor for the lazily-built Prometheus {@link Registry}. Returns
   * `undefined` when `metrics.enabled !== true` or before
   * {@link buildMetricsRegistryIfEnabled} has run. Subclasses MUST NOT
   * mutate the registry; lifecycle is owned by {@link stop}.
   * @returns The active metrics registry, or `undefined` when disabled.
   */
  protected getMetricsRegistry (): Registry | undefined {
    return this.metricsRegistry
  }

  protected getUnauthorizedDenial (): {
    headers: Readonly<Record<string, string>>
    reasonPhrase: string
    status: StatusCodes
  } {
    return {
      headers: { 'WWW-Authenticate': 'Basic realm=users' },
      reasonPhrase: getReasonPhrase(StatusCodes.UNAUTHORIZED),
      status: StatusCodes.UNAUTHORIZED,
    }
  }

  /**
   * Render the Prometheus exposition for a `/metrics` GET or HEAD request.
   *
   * Schedules the scrape on the serial {@link runMetricsScrape} chain and
   * converts any rejection into `HTTP 500 Internal Server Error` (only
   * when the response is still writable — a partial write is left
   * untouched).
   *
   * Pre-conditions enforced by {@link tryServeMetrics}: `metrics.enabled`
   * is true, the request method is `GET` or `HEAD`, the pathname is
   * `/metrics`, and the prologue + authentication have already passed.
   *
   * The `registry === undefined` branch is a defensive 404 against a late
   * {@link stop} that nulled the registry while this request was in
   * flight. HEAD responses send identical headers to GET (including
   * `Content-Length`) with an empty body per RFC 9110 §9.3.2.
   * @param req HTTP request (used to detect HEAD).
   * @param res Server response to end with the exposition body (or empty
   *   for HEAD / on error).
   */
  protected handleMetricsHttpRequest (req: IncomingMessage, res: ServerResponse): void {
    const registry = this.metricsRegistry
    if (registry === undefined) {
      this.renderDenial(res, {
        reasonPhrase: getReasonPhrase(StatusCodes.NOT_FOUND),
        status: StatusCodes.NOT_FOUND,
      })
      return
    }
    this.runMetricsScrape(req, res, registry).catch((error: unknown) => {
      logger.error(
        `${this.logPrefix(moduleName, 'handleMetricsHttpRequest')} Metrics handler error:`,
        error
      )
      if (!res.headersSent && !res.writableEnded) {
        res.writeHead(StatusCodes.INTERNAL_SERVER_ERROR, { 'Content-Type': 'text/plain' }).end()
      }
    })
  }

  protected isMetricsRequest (req: IncomingMessage): boolean {
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

  protected notifyClients (): void {
    // No-op by default — subclasses with push capability override this
  }

  protected registerProtocolVersionUIService (version: ProtocolVersion): void {
    if (!this.uiServices.has(version)) {
      this.uiServices.set(version, UIServiceFactory.getUIServiceImplementation(version, this))
    }
  }

  protected renderDenial (
    res: ServerResponse,
    payload: {
      headers?: Readonly<Record<string, string>>
      reasonPhrase: string
      status: StatusCodes
    }
  ): void {
    if (res.headersSent) return
    res
      .writeHead(payload.status, {
        'Content-Type': 'text/plain',
        ...payload.headers,
        ...this.getConnectionCloseHeader(),
      })
      .end(`${payload.status.toString()} ${payload.reasonPhrase}`)
  }

  /**
   * Emit a 404 denial then tear down the request socket if the client
   * did not finish writing. Used by transports that mount `/metrics`
   * next to a single non-default route — every other path is a 404.
   * Ordering is fixed: response is rendered first, then `req.destroy()`,
   * so observers of `'finish'` see the response before the socket
   * teardown.
   * @param req Incoming HTTP request.
   * @param res Server response.
   */
  protected renderNotFoundAndDestroy (req: IncomingMessage, res: ServerResponse): void {
    this.renderDenial(res, {
      reasonPhrase: getReasonPhrase(StatusCodes.NOT_FOUND),
      status: StatusCodes.NOT_FOUND,
    })
    this.destroyHttp1SocketIfPending(req)
  }

  /**
   * Run the access-policy + rate-limit prologue for a request.
   *
   * The order is fixed:
   * 1. Resolve the access decision (memoized on the request).
   * 2. Account every request against the rate limiter, including denied
   *    ones.
   * 3. Apply the access verdict.
   *
   * Authentication is delegated to each transport.
   * @param req The incoming HTTP request.
   * @returns A discriminated {@link UIServerRequestPrologueResult}.
   */
  protected runRequestPrologue (req: IncomingMessage): UIServerRequestPrologueResult {
    const decision = resolveUIServerAccess(req, this.uiServerConfiguration, this.accessCache)
    const rateLimitKey = decision.clientAddress.length > 0 ? decision.clientAddress : 'unknown'
    if (!this.rateLimiter(rateLimitKey)) {
      logger.warn(
        `${this.logPrefix(
          moduleName,
          'runRequestPrologue'
        )} UI rate limit exceeded for client '${rateLimitKey}'`
      )
      return {
        headers: { 'Retry-After': '60' },
        ok: false,
        reasonPhrase: getReasonPhrase(StatusCodes.TOO_MANY_REQUESTS),
        status: StatusCodes.TOO_MANY_REQUESTS,
      }
    }
    if (!decision.allowed) {
      logger.warn(
        `${this.logPrefix(moduleName, 'runRequestPrologue')} UI access denied: ${
          decision.message
        } (reason=${decision.reason})`
      )
      return {
        ok: false,
        reasonPhrase: getReasonPhrase(StatusCodes.FORBIDDEN),
        status: StatusCodes.FORBIDDEN,
      }
    }
    return { decision, ok: true }
  }

  protected startHttpServer (): void {
    this.httpServer.on('error', error => {
      logger.error(
        `${this.logPrefix(moduleName, 'start.httpServer.on.error')} HTTP server error:`,
        error
      )
    })
    if (!this.httpServer.listening) {
      this.httpServer.listen(this.uiServerConfiguration.options)
    }
  }

  /**
   * Single-gate dispatcher for the Prometheus `/metrics` endpoint, shared
   * by every transport that mounts an HTTP request listener. Encapsulates
   * the `metrics.enabled` gate, the path predicate
   * ({@link isMetricsRequest}), authentication, and delegation to
   * {@link handleMetricsHttpRequest}. All concrete UI servers MUST call
   * this between {@link runRequestPrologue} and their transport-specific
   * dispatch so gating, ordering, and auth coverage stay identical across
   * transports.
   * @param req Incoming HTTP request (post-prologue).
   * @param res Server response.
   * @returns `true` when the helper has written a response (served or
   *   denied); the caller MUST then return. `false` when the request is
   *   not for `/metrics` and the caller should continue its own routing.
   */
  protected tryServeMetrics (req: IncomingMessage, res: ServerResponse): boolean {
    if (this.uiServerConfiguration.metrics?.enabled !== true) {
      return false
    }
    if (!this.isMetricsRequest(req)) {
      return false
    }
    if (!this.authenticate(req)) {
      this.renderDenial(res, this.getUnauthorizedDenial())
      return true
    }
    this.handleMetricsHttpRequest(req, res)
    return true
  }

  /**
   * Build the Prometheus `Registry` populated with every gauge exposed by
   * the simulator. Each gauge declares an explicit source field via its
   * `collect()` callback; there is no generic property iteration so adding
   * a new field on `ChargingStationData` does NOT silently expose it
   * (PII allowlist invariant). All `collect()` callbacks registered here
   * are synchronous; an async `collect` would let `prom-client` interleave
   * them within a single `Registry.metrics()` call, racing on
   * {@link metricsSampleCount}.
   * @returns The populated registry; `Registry.metrics()` renders the body.
   */
  private buildMetricsRegistry (): Registry {
    const registry = new Registry()
    const bootstrap = this.getBootstrap()
    const provider: ChargingStationDataProvider = {
      getChargingStationsCount: this.getChargingStationsCount.bind(this),
      listChargingStationData: this.listChargingStationData.bind(this),
    }
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
        this.set(provider.getChargingStationsCount())
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
        for (const data of provider.listChargingStationData()) {
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
      provider,
      'simulator_station_started',
      '1 when the charging station is started, 0 otherwise.',
      data => data.started
    )

    addPerStationNumeric(
      registry,
      accountSamples,
      provider,
      'simulator_station_ws_state',
      'WebSocket readyState (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED).',
      data => data.wsState
    )

    addPerStationNumeric(
      registry,
      accountSamples,
      provider,
      'simulator_station_connectors_total',
      'Number of connectors of the charging station.',
      countConnectors
    )

    addPerStationNumeric(
      registry,
      accountSamples,
      provider,
      'simulator_station_evses_total',
      'Number of EVSEs of the charging station.',
      data => data.evses.length
    )

    addPerStationNumeric(
      registry,
      accountSamples,
      provider,
      'simulator_station_max_power_watts',
      'Maximum power of the charging station, in Watts.',
      data => data.stationInfo.maximumPower
    )

    addPerStationNumeric(
      registry,
      accountSamples,
      provider,
      'simulator_station_max_amperage_amperes',
      'Maximum amperage of the charging station, in Amperes.',
      data => data.stationInfo.maximumAmperage
    )

    addPerStationNumeric(
      registry,
      accountSamples,
      provider,
      'simulator_station_voltage_out_volts',
      'Voltage output of the charging station, in Volts.',
      data => data.stationInfo.voltageOut
    )

    addPerStationNumeric(
      registry,
      accountSamples,
      provider,
      'simulator_station_data_timestamp_seconds',
      'Unix epoch (seconds) at which the charging station snapshot was emitted.',
      data => Math.floor(data.timestamp / 1000)
    )

    addPerStationStatusInfo(
      registry,
      accountSamples,
      provider,
      'simulator_station_boot_status_info',
      'BootNotification status (one-hot).',
      data => data.bootNotificationResponse?.status
    )

    addPerStationNumeric(
      registry,
      accountSamples,
      provider,
      'simulator_station_boot_heartbeat_interval_seconds',
      'BootNotification heartbeat interval, in seconds.',
      data => data.bootNotificationResponse?.interval
    )

    addPerStationBoolean(
      registry,
      accountSamples,
      provider,
      'simulator_station_atg_enabled',
      '1 when the ATG is enabled in configuration, 0 otherwise.',
      data => data.automaticTransactionGenerator?.automaticTransactionGenerator?.enable === true
    )

    addPerStationStatusInfo(
      registry,
      accountSamples,
      provider,
      'simulator_station_diagnostics_status_info',
      'Most recent DiagnosticsStatusNotification status (one-hot).',
      data => data.stationInfo.diagnosticsStatus
    )

    addPerStationStatusInfo(
      registry,
      accountSamples,
      provider,
      'simulator_station_firmware_status_info',
      'Most recent FirmwareStatusNotification status (one-hot).',
      data => data.stationInfo.firmwareStatus
    )

    addPerStationNumeric(
      registry,
      accountSamples,
      provider,
      'simulator_station_ocpp_config_keys_total',
      'Number of OCPP configuration keys advertised by the charging station.',
      data => data.ocppConfiguration.configurationKey?.length ?? 0
    )

    /** Per connector gauges. */

    addConnectorOneHot(
      registry,
      accountSamples,
      provider,
      'simulator_connector_status_info',
      'Connector status (one-hot).',
      'status',
      cs => cs.status
    )
    addConnectorOneHot(
      registry,
      accountSamples,
      provider,
      'simulator_connector_boot_status_info',
      'Connector boot status (one-hot).',
      'status',
      cs => cs.bootStatus
    )
    addConnectorOneHot(
      registry,
      accountSamples,
      provider,
      'simulator_connector_availability_info',
      'Connector availability (one-hot).',
      'availability',
      cs => cs.availability
    )
    addConnectorOneHot(
      registry,
      accountSamples,
      provider,
      'simulator_connector_error_code_info',
      'Connector OCPP error code (one-hot).',
      'error_code',
      cs => cs.errorCode
    )
    addConnectorOneHot(
      registry,
      accountSamples,
      provider,
      'simulator_connector_type_info',
      'Connector physical type (one-hot).',
      'connector_type',
      cs => cs.type
    )

    addConnectorBoolean(
      registry,
      accountSamples,
      provider,
      'simulator_connector_locked',
      '1 when the connector is locked, 0 otherwise.',
      cs => cs.locked === true
    )
    addConnectorBoolean(
      registry,
      accountSamples,
      provider,
      'simulator_connector_transaction_started',
      '1 when a transaction is currently started on the connector.',
      cs => cs.transactionStarted === true
    )
    addConnectorBoolean(
      registry,
      accountSamples,
      provider,
      'simulator_connector_transaction_pending',
      '1 when a transaction is pending on the connector.',
      cs => cs.transactionPending === true
    )
    addConnectorBoolean(
      registry,
      accountSamples,
      provider,
      'simulator_connector_transaction_remote_started',
      '1 when the current transaction was remote-started.',
      cs => cs.transactionRemoteStarted === true
    )
    addConnectorBoolean(
      registry,
      accountSamples,
      provider,
      'simulator_connector_reservation_active',
      '1 when an active reservation is set on the connector.',
      cs => cs.reservation != null
    )

    addConnectorNumeric(
      registry,
      accountSamples,
      provider,
      'simulator_connector_transaction_seq_no',
      'Last transaction event sequence number sent on the connector.',
      cs => cs.transactionSeqNo
    )
    addConnectorNumeric(
      registry,
      accountSamples,
      provider,
      'simulator_connector_transaction_event_queue_size',
      'Number of pending transaction events queued on the connector.',
      cs => cs.transactionEventQueue?.length ?? 0
    )
    addConnectorNumeric(
      registry,
      accountSamples,
      provider,
      'simulator_connector_transaction_id',
      'Numeric transaction id of the active transaction on the connector. NEVER used as a label (cardinality).',
      cs => (typeof cs.transactionId === 'number' ? cs.transactionId : undefined)
    )
    addConnectorNumeric(
      registry,
      accountSamples,
      provider,
      'simulator_connector_transaction_start_seconds',
      'Unix epoch (seconds) at which the active transaction started on the connector.',
      cs =>
        cs.transactionStart != null ? Math.floor(cs.transactionStart.getTime() / 1000) : undefined
    )
    addConnectorNumeric(
      registry,
      accountSamples,
      provider,
      'simulator_connector_transaction_energy_active_import_register_wh',
      'Active energy imported during the current transaction, in Wh.',
      cs => cs.transactionEnergyActiveImportRegisterValue
    )
    addConnectorNumeric(
      registry,
      accountSamples,
      provider,
      'simulator_connector_energy_active_import_register_wh',
      'Cumulative active energy imported by the connector meter, in Wh.',
      cs => cs.energyActiveImportRegisterValue
    )
    addConnectorNumeric(
      registry,
      accountSamples,
      provider,
      'simulator_connector_max_power_watts',
      'Maximum power of the connector, in Watts.',
      cs => cs.maximumPower
    )
    addConnectorNumeric(
      registry,
      accountSamples,
      provider,
      'simulator_connector_charging_profiles_total',
      'Number of charging profiles installed on the connector.',
      cs => cs.chargingProfiles?.length ?? 0
    )
    addConnectorNumericFromEntry(
      registry,
      accountSamples,
      provider,
      'simulator_connector_evse_id',
      'EVSE id the connector belongs to.',
      entry => entry.evseId
    )

    return registry
  }

  private isBasicAuthEnabled (): boolean {
    return (
      this.uiServerConfiguration.authentication?.enabled === true &&
      this.uiServerConfiguration.authentication.type === AuthenticationType.BASIC_AUTH
    )
  }

  private isProtocolBasicAuthEnabled (): boolean {
    return (
      this.uiServerConfiguration.authentication?.enabled === true &&
      this.uiServerConfiguration.authentication.type === AuthenticationType.PROTOCOL_BASIC_AUTH
    )
  }

  private isValidBasicAuth (req: IncomingMessage): boolean {
    const usernameAndPassword = getUsernameAndPasswordFromAuthorizationToken(
      req.headers.authorization?.split(/\s+/).pop() ?? ''
    )
    if (usernameAndPassword == null) {
      return false
    }
    const [username, password] = usernameAndPassword
    return this.isValidUsernameAndPassword(username, password)
  }

  private isValidProtocolBasicAuth (req: IncomingMessage): boolean {
    const authorizationProtocol = req.headers['sec-websocket-protocol']?.split(/,\s+/).pop()
    if (authorizationProtocol == null || isEmpty(authorizationProtocol)) {
      return false
    }
    const usernameAndPassword = getUsernameAndPasswordFromAuthorizationToken(
      `${authorizationProtocol}${Array(((4 - (authorizationProtocol.length % 4)) % 4) + 1).join(
        '='
      )}`
        .split('.')
        .pop() ?? ''
    )
    if (usernameAndPassword == null) {
      return false
    }
    const [username, password] = usernameAndPassword
    return this.isValidUsernameAndPassword(username, password)
  }

  private isValidUsernameAndPassword (username: string, password: string): boolean {
    return (
      isValidCredential(username, this.uiServerConfiguration.authentication?.username ?? '') &&
      isValidCredential(password, this.uiServerConfiguration.authentication?.password ?? '')
    )
  }

  /**
   * Schedule a `/metrics` scrape onto {@link metricsScrapeChain} so concurrent
   * scrape requests serialize through a single FIFO chain (preserves the
   * {@link metricsSampleCount} invariant). The function itself is synchronous —
   * the inner async work runs in a `.then()` continuation and rejections
   * propagate to the returned promise, which the caller's `.catch()`
   * converts to HTTP 500. The exposition body is omitted on HEAD per
   * RFC 9110 §9.3.2; HEAD response headers are identical to GET, including
   * `Content-Length` set to the byte length of the body GET would emit.
   * @param req HTTP request (used to detect HEAD).
   * @param res HTTP response to end with the exposition body.
   * @param registry Source Prometheus registry.
   * @returns The chained scrape promise.
   */
  private runMetricsScrape (
    req: IncomingMessage,
    res: ServerResponse,
    registry: Registry
  ): Promise<void> {
    this.metricsScrapeChain = this.metricsScrapeChain
      .catch(() => undefined)
      .then(async () => {
        this.metricsSampleCount = 0
        // prom-client's sync prefix runs every collect() (each writing
        // this.metricsSampleCount via accountSamples) before its first
        // internal await. Snapshot the counter here, BEFORE our own
        // await yields, so a peer scrape dispatched after a sync
        // stop()→start() (which reseats metricsScrapeChain) cannot
        // overwrite the count we read for the soft-cap branch. See the
        // metricsSampleCount field JSDoc for the full invariant.
        const metricsPromise = registry.metrics()
        const sampleCount = this.metricsSampleCount
        const rawBody: string = await metricsPromise
        const cap = this.uiServerConfiguration.metrics?.softSampleCap ?? METRICS_SOFT_SAMPLE_CAP
        if (sampleCount > cap) {
          logger.warn(
            `${this.logPrefix(moduleName, 'runMetricsScrape')} ` +
              `${METRICS_SOFT_CAP_WARN_PREFIX} ${sampleCount.toString()} samples ` +
              `(soft cap ${cap.toString()})`
          )
        }
        if (!res.headersSent && !res.writableEnded) {
          const contentLength = Buffer.byteLength(rawBody, 'utf8').toString()
          const isHead = req.method === HttpMethod.HEAD
          res
            .writeHead(StatusCodes.OK, {
              'Content-Length': contentLength,
              'Content-Type': registry.contentType,
            })
            .end(isHead ? undefined : rawBody)
        }
        return undefined
      })
    return this.metricsScrapeChain
  }

  /**
   * Strips listeners before `httpServer.close()`. The order releases
   * subscribers even if `close()` throws, and lets {@link detachTransport}
   * stay a default no-op. Subclasses MUST NOT attach `httpServer` listeners
   * whose side-effects must run after shutdown.
   */
  private stopHttpServer (): void {
    if (this.httpServer.listening) {
      this.httpServer.removeAllListeners()
      this.httpServer.close()
    }
  }

  private warnIfMisconfigured (): void {
    const configuredHost = this.uiServerConfiguration.options?.host ?? ''
    const accessPolicy = this.uiServerConfiguration.accessPolicy
    const allowedHosts = accessPolicy?.allowedHosts ?? []
    const trustedProxies = accessPolicy?.trustedProxies ?? []
    const requireTls = accessPolicy?.requireTlsForNonLoopback ?? true
    const isWildcard =
      configuredHost === '' || configuredHost === '0.0.0.0' || configuredHost === '::'

    if (isWildcard && allowedHosts.length === 0) {
      logger.warn(
        `${this.logPrefix(
          moduleName,
          'constructor'
        )} UI server bound to wildcard host '${configuredHost}' with no accessPolicy.allowedHosts; all requests will be denied as host-not-allowed. Configure accessPolicy.allowedHosts or set options.host to a specific address.`
      )
      return
    }
    if (!isWildcard && !isLoopback(configuredHost) && requireTls && trustedProxies.length === 0) {
      logger.warn(
        `${this.logPrefix(
          moduleName,
          'constructor'
        )} UI server bound to non-loopback host '${configuredHost}' with requireTlsForNonLoopback=true and no accessPolicy.trustedProxies; plaintext requests will be denied as tls-required. Configure accessPolicy.trustedProxies to terminate TLS upstream, or set requireTlsForNonLoopback=false on private bindings.`
      )
    }
  }
}

/**
 * Construct and register a Prometheus `Gauge` whose `labelNames` are narrowed
 * to a string-literal union via `as const`. The returned reference is owned
 * by `registry` (lifecycle managed by `Registry.clear()`); callers may ignore
 * it because each gauge's `collect()` callback receives the gauge as its
 * `this` binding. The `L = never` default (stricter than `prom-client`'s own
 * `Gauge<T extends string = string>`) forbids passing `labelNames` for
 * unlabeled gauges, catching mismatches at compile time.
 * @param registry Destination registry; auto-injected into `registers`.
 * @param config Gauge configuration WITHOUT `registers`.
 * @returns The constructed `Gauge<L>`.
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

const addPerStationStatusInfo = (
  registry: Registry,
  account: (n: number) => void,
  server: ChargingStationDataProvider,
  name: string,
  help: string,
  pick: (data: ChargingStationData) => string | undefined
): void => {
  defineGauge(registry, {
    collect (this: Gauge<'hash_id' | 'status'>) {
      this.reset()
      for (const data of server.listChargingStationData()) {
        const v = pick(data)
        if (typeof v === 'string') {
          this.labels({ hash_id: data.stationInfo.hashId, status: v }).set(1)
          account(1)
        }
      }
    },
    help,
    labelNames: ['hash_id', 'status'] as const,
    name,
  })
}

/**
 * Connector count under the OCPP 1.6 (`data.connectors`) vs OCPP 2.0.x
 * (`data.evses[*].evseStatus.connectors`) source split. The two sources
 * are mutually exclusive: `buildConnectorEntries` guarantees
 * `data.connectors` is empty when `data.evses` is populated; never sum
 * them. Also used by {@link iterateConnectors}.
 * @param data Charging station snapshot.
 * @returns Connector count under the active mode.
 */
const countConnectors = (data: ChargingStationData): number =>
  data.connectors.length > 0
    ? data.connectors.length
    : data.evses.reduce((n, evse) => n + evse.evseStatus.connectors.size, 0)

/**
 * Iterate connectors under the same OCPP 1.6 vs OCPP 2.0.x source split as
 * {@link countConnectors}: yields entries from `data.connectors` when
 * non-empty, otherwise from `data.evses[*].evseStatus.connectors`. The two
 * sources are mutually exclusive; never sum them.
 * @param data Charging station snapshot.
 * @yields {ConnectorEntry} A connector entry under the active mode.
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

type ConnectorOneHotLabel = 'availability' | 'connector_type' | 'error_code' | 'status'

const addConnectorOneHot = (
  registry: Registry,
  account: (n: number) => void,
  server: ChargingStationDataProvider,
  name: string,
  help: string,
  labelName: ConnectorOneHotLabel,
  pick: (cs: ConnectorStatus) => string | undefined
): void => {
  defineGauge<'connector_id' | 'hash_id' | ConnectorOneHotLabel>(registry, {
    collect (this: Gauge<'connector_id' | 'hash_id' | ConnectorOneHotLabel>) {
      this.reset()
      for (const data of server.listChargingStationData()) {
        for (const entry of iterateConnectors(data)) {
          const v = pick(entry.connectorStatus)
          if (typeof v === 'string') {
            const labels: Partial<
              Record<'connector_id' | 'hash_id' | ConnectorOneHotLabel, string>
            > = {}
            labels.hash_id = data.stationInfo.hashId
            labels.connector_id = entry.connectorId.toString()
            labels[labelName] = v
            this.labels(labels).set(1)
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
