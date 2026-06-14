import type { WebSocket } from 'ws'

import { getReasonPhrase, StatusCodes } from 'http-status-codes'
import { type IncomingMessage, Server, type ServerResponse } from 'node:http'
import { createServer, type Http2Server } from 'node:http2'

import type { IBootstrap } from '../IBootstrap.js'
import type { AbstractUIService } from './ui-services/AbstractUIService.js'

import { BaseError } from '../../exception/index.js'
import {
  ApplicationProtocolVersion,
  AuthenticationType,
  type ChargingStationData,
  ConfigurationSection,
  type ProcedureName,
  type ProtocolRequest,
  type ProtocolResponse,
  ProtocolVersion,
  type RequestPayload,
  type ResponsePayload,
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
import { getUsernameAndPasswordFromAuthorizationToken } from './UIServerUtils.js'

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
      ?.requestHandler(request) as Promise<ProtocolResponse>)
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

  public abstract start (): void

  public stop (): void {
    clearTimeout(this.clientNotificationDebounceTimer)
    this.stopHttpServer()
    for (const uiService of this.uiServices.values()) {
      uiService.stop()
    }
    this.uiServices.clear()
    this.responseHandlers.clear()
    this.clearCaches()
  }

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

  private stopHttpServer (): void {
    if (this.httpServer.listening) {
      this.httpServer.close()
      this.httpServer.removeAllListeners()
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
