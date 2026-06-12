import type { WebSocket } from 'ws'

import { StatusCodes } from 'http-status-codes'
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

// Bound the time a peer may hold a TCP connection without completing the
// HTTP request line and headers. Both values are well below Node defaults
// (60 s and 5 min) and prevent slow-loris exposure on rejected upgrades.
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

  protected authenticate (req: IncomingMessage, next: (err?: Error) => void): void {
    if (this.uiServerConfiguration.authentication?.enabled !== true) {
      next()
      return
    }
    let ok = false
    if (this.isBasicAuthEnabled()) {
      ok = this.isValidBasicAuth(req, next)
    } else if (this.isProtocolBasicAuthEnabled()) {
      ok = this.isValidProtocolBasicAuth(req, next)
    }
    next(ok ? undefined : new BaseError('Unauthorized'))
  }

  protected notifyClients (): void {
    // No-op by default — subclasses with push capability override this
  }

  protected registerProtocolVersionUIService (version: ProtocolVersion): void {
    if (!this.uiServices.has(version)) {
      this.uiServices.set(version, UIServiceFactory.getUIServiceImplementation(version, this))
    }
  }

  /**
   * Run the access-policy + rate-limit prologue for a request.
   *
   * The order is enforced structurally here so transports cannot diverge:
   * 1. Resolve the access decision (memoized on the request).
   * 2. Account every request against the rate limiter, including denied
   *    ones, so a flood of forbidden requests still consumes a budget slot.
   * 3. Apply the access verdict.
   *
   * Authentication is left to each transport because rejection mechanisms
   * differ (HTTP body vs WebSocket status line vs MCP).
   * @param req The incoming HTTP request.
   * @returns A discriminated {@link UIServerRequestPrologueResult}.
   */
  protected runRequestPrologue (req: IncomingMessage): UIServerRequestPrologueResult {
    const decision = resolveUIServerAccess(req, this.uiServerConfiguration, this.accessCache)
    const rateLimitKey = decision.clientAddress.length > 0 ? decision.clientAddress : 'unknown'
    if (!this.rateLimiter(rateLimitKey)) {
      return {
        headers: { 'Retry-After': '60' },
        ok: false,
        reasonPhrase: 'Too Many Requests',
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
        reasonPhrase: 'Forbidden',
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

  private isValidBasicAuth (req: IncomingMessage, next: (err?: Error) => void): boolean {
    const usernameAndPassword = getUsernameAndPasswordFromAuthorizationToken(
      req.headers.authorization?.split(/\s+/).pop() ?? '',
      next
    )
    if (usernameAndPassword == null) {
      return false
    }
    const [username, password] = usernameAndPassword
    return this.isValidUsernameAndPassword(username, password)
  }

  private isValidProtocolBasicAuth (req: IncomingMessage, next: (err?: Error) => void): boolean {
    const authorizationProtocol = req.headers['sec-websocket-protocol']?.split(/,\s+/).pop()
    if (authorizationProtocol == null || isEmpty(authorizationProtocol)) {
      return false
    }
    const usernameAndPassword = getUsernameAndPasswordFromAuthorizationToken(
      `${authorizationProtocol}${Array(((4 - (authorizationProtocol.length % 4)) % 4) + 1).join(
        '='
      )}`
        .split('.')
        .pop() ?? '',
      next
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
}
