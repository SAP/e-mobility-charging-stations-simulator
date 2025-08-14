import type { WebSocket } from 'ws'

import { type IncomingMessage, Server, type ServerResponse } from 'node:http'
import { createServer, type Http2Server } from 'node:http2'

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
} from '../../types/index.js'
import { logger } from '../../utils/index.js'
import { UIServiceFactory } from './ui-services/UIServiceFactory.js'
import { getUsernameAndPasswordFromAuthorizationToken } from './UIServerUtils.js'

const moduleName = 'AbstractUIServer'

export abstract class AbstractUIServer {
  public readonly chargingStations: Map<string, ChargingStationData>
  public readonly chargingStationTemplates: Set<string>

  protected readonly httpServer: Http2Server | Server
  protected readonly responseHandlers: Map<
    `${string}-${string}-${string}-${string}-${string}`,
    ServerResponse | WebSocket
  >

  protected readonly uiServices: Map<ProtocolVersion, AbstractUIService>

  public constructor (protected readonly uiServerConfiguration: UIServerConfiguration) {
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
    this.responseHandlers = new Map<
      `${string}-${string}-${string}-${string}-${string}`,
      ServerResponse | WebSocket
    >()
    this.uiServices = new Map<ProtocolVersion, AbstractUIService>()
  }

  public buildProtocolRequest (
    uuid: `${string}-${string}-${string}-${string}-${string}`,
    procedureName: ProcedureName,
    requestPayload: RequestPayload
  ): ProtocolRequest {
    return [uuid, procedureName, requestPayload]
  }

  public buildProtocolResponse (
    uuid: `${string}-${string}-${string}-${string}-${string}`,
    responsePayload: ResponsePayload
  ): ProtocolResponse {
    return [uuid, responsePayload]
  }

  public clearCaches (): void {
    this.chargingStations.clear()
    this.chargingStationTemplates.clear()
  }

  public hasResponseHandler (uuid: `${string}-${string}-${string}-${string}-${string}`): boolean {
    return this.responseHandlers.has(uuid)
  }

  public abstract logPrefix (moduleName?: string, methodName?: string, prefixSuffix?: string): string

  public async sendInternalRequest (request: ProtocolRequest): Promise<ProtocolResponse> {
    const protocolVersion = ProtocolVersion['0.0.1']
    this.registerProtocolVersionUIService(protocolVersion)
    return await (this.uiServices
      .get(protocolVersion)
      ?.requestHandler(request) as Promise<ProtocolResponse>)
  }

  public abstract sendRequest (request: ProtocolRequest): void

  public abstract sendResponse (response: ProtocolResponse): void

  public abstract start (): void

  public stop (): void {
    this.stopHttpServer()
    for (const uiService of this.uiServices.values()) {
      uiService.stop()
    }
    this.clearCaches()
  }

  protected authenticate (req: IncomingMessage, next: (err?: Error) => void): void {
    const authorizationError = new BaseError('Unauthorized')
    if (this.isBasicAuthEnabled()) {
      if (!this.isValidBasicAuth(req, next)) {
        next(authorizationError)
      }
      next()
    } else if (this.isProtocolBasicAuthEnabled()) {
      if (!this.isValidProtocolBasicAuth(req, next)) {
        next(authorizationError)
      }
      next()
    } else if (this.uiServerConfiguration.authentication?.enabled === true) {
      next(authorizationError)
    }
    next()
  }

  protected registerProtocolVersionUIService (version: ProtocolVersion): void {
    if (!this.uiServices.has(version)) {
      this.uiServices.set(version, UIServiceFactory.getUIServiceImplementation(version, this))
    }
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
    const usernameAndPassword = getUsernameAndPasswordFromAuthorizationToken(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/restrict-template-expressions
      `${authorizationProtocol}${Array(((4 - (authorizationProtocol!.length % 4)) % 4) + 1).join(
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
      this.uiServerConfiguration.authentication?.username === username &&
      this.uiServerConfiguration.authentication.password === password
    )
  }

  private stopHttpServer (): void {
    if (this.httpServer.listening) {
      this.httpServer.close()
      this.httpServer.removeAllListeners()
    }
  }
}
