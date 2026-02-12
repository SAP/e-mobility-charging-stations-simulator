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
  type UUIDv4,
} from '../../types/index.js'
import { isEmpty, logger } from '../../utils/index.js'
import { UIServiceFactory } from './ui-services/UIServiceFactory.js'
import { isValidCredential } from './UIServerSecurity.js'
import { getUsernameAndPasswordFromAuthorizationToken } from './UIServerUtils.js'

const moduleName = 'AbstractUIServer'

export abstract class AbstractUIServer {
  protected readonly httpServer: Http2Server | Server
  protected readonly responseHandlers: Map<UUIDv4, ServerResponse | WebSocket>

  protected readonly uiServices: Map<ProtocolVersion, AbstractUIService>

  private readonly chargingStations: Map<string, ChargingStationData>
  private readonly chargingStationTemplates: Set<string>

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
    this.responseHandlers = new Map<UUIDv4, ServerResponse | WebSocket>()
    this.uiServices = new Map<ProtocolVersion, AbstractUIService>()
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

  public setChargingStationData (hashId: string, data: ChargingStationData): void {
    const cachedData = this.chargingStations.get(hashId)
    if (cachedData == null || data.timestamp >= cachedData.timestamp) {
      this.chargingStations.set(hashId, data)
    }
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
