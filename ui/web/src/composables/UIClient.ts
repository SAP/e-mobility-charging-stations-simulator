import { useToast } from 'vue-toast-notification'

import type {
  ApplicationProtocol,
  AuthenticationType,
  type ChargingStationOptions,
  ProcedureName,
  type ProtocolResponse,
  type RequestPayload,
  type ResponsePayload,
  ResponseStatus,
  type UIServerConfigurationSection,
  UUIDv4,
} from '@/types'

import { UI_WEBSOCKET_REQUEST_TIMEOUT_MS } from './Constants'
import { randomUUID, validateUUID } from './Utils'

interface ResponseHandler {
  procedureName: ProcedureName
  reject: (reason?: unknown) => void
  resolve: (value: PromiseLike<ResponsePayload> | ResponsePayload) => void
}

export class UIClient {
  private static instance: null | UIClient = null
  private responseHandlers: Map<UUIDv4, ResponseHandler>

  private ws?: WebSocket

  private constructor (private uiServerConfiguration: UIServerConfigurationSection) {
    this.openWS()
    this.responseHandlers = new Map<UUIDv4, ResponseHandler>()
  }

  public static getInstance (uiServerConfiguration?: UIServerConfigurationSection): UIClient {
    if (UIClient.instance === null) {
      if (uiServerConfiguration == null) {
        throw new Error('Cannot initialize UIClient if no configuration is provided')
      }
      UIClient.instance = new UIClient(uiServerConfiguration)
    }
    return UIClient.instance
  }

  public async addChargingStations (
    template: string,
    numberOfStations: number,
    options?: ChargingStationOptions
  ): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.ADD_CHARGING_STATIONS, {
      numberOfStations,
      options,
      template,
    })
  }

  public async authorize (hashId: string, idTag: string): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.AUTHORIZE, {
      hashIds: [hashId],
      idTag,
    })
  }

  public async closeConnection (hashId: string): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.CLOSE_CONNECTION, {
      hashIds: [hashId],
    })
  }

  public async deleteChargingStation (hashId: string): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.DELETE_CHARGING_STATIONS, {
      hashIds: [hashId],
    })
  }

  public async listChargingStations (): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.LIST_CHARGING_STATIONS, {})
  }

  public async listTemplates (): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.LIST_TEMPLATES, {})
  }

  public async openConnection (hashId: string): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.OPEN_CONNECTION, {
      hashIds: [hashId],
    })
  }

  public registerWSEventListener<K extends keyof WebSocketEventMap>(
    event: K,
    listener: (event: WebSocketEventMap[K]) => void,
    options?: AddEventListenerOptions | boolean
  ) {
    this.ws?.addEventListener(event, listener, options)
  }

  public setConfiguration (uiServerConfiguration: UIServerConfigurationSection): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.close()
      delete this.ws
    }
    this.uiServerConfiguration = uiServerConfiguration
    this.openWS()
  }

  public async setSupervisionUrl (hashId: string, supervisionUrl: string): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.SET_SUPERVISION_URL, {
      hashIds: [hashId],
      url: supervisionUrl,
    })
  }

  public async simulatorState (): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.SIMULATOR_STATE, {})
  }

  public async startAutomaticTransactionGenerator (
    hashId: string,
    connectorId: number
  ): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.START_AUTOMATIC_TRANSACTION_GENERATOR, {
      connectorIds: [connectorId],
      hashIds: [hashId],
    })
  }

  public async startChargingStation (hashId: string): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.START_CHARGING_STATION, {
      hashIds: [hashId],
    })
  }

  public async startSimulator (): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.START_SIMULATOR, {})
  }

  public async startTransaction (
    hashId: string,
    connectorId: number,
    idTag: string | undefined
  ): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.START_TRANSACTION, {
      connectorId,
      hashIds: [hashId],
      idTag,
    })
  }

  public async stopAutomaticTransactionGenerator (
    hashId: string,
    connectorId: number
  ): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.STOP_AUTOMATIC_TRANSACTION_GENERATOR, {
      connectorIds: [connectorId],
      hashIds: [hashId],
    })
  }

  public async stopChargingStation (hashId: string): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.STOP_CHARGING_STATION, {
      hashIds: [hashId],
    })
  }

  public async stopSimulator (): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.STOP_SIMULATOR, {})
  }

  public async stopTransaction (
    hashId: string,
    transactionId: number | undefined
  ): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.STOP_TRANSACTION, {
      hashIds: [hashId],
      transactionId,
    })
  }

  public unregisterWSEventListener<K extends keyof WebSocketEventMap>(
    event: K,
    listener: (event: WebSocketEventMap[K]) => void,
    options?: AddEventListenerOptions | boolean
  ) {
    this.ws?.removeEventListener(event, listener, options)
  }

  private openWS (): void {
    const protocols =
      this.uiServerConfiguration.authentication?.enabled === true &&
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      this.uiServerConfiguration.authentication.type === AuthenticationType.PROTOCOL_BASIC_AUTH
        ? [
            `${this.uiServerConfiguration.protocol}${this.uiServerConfiguration.version}`,
            `authorization.basic.${btoa(
              // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
              `${this.uiServerConfiguration.authentication.username}:${this.uiServerConfiguration.authentication.password}`
            ).replace(/={1,2}$/, '')}`,
          ]
        : `${this.uiServerConfiguration.protocol}${this.uiServerConfiguration.version}`
    this.ws = new WebSocket(
      `${
        this.uiServerConfiguration.secure === true
          ? ApplicationProtocol.WSS
          : ApplicationProtocol.WS
      }://${this.uiServerConfiguration.host}:${this.uiServerConfiguration.port.toString()}`,
      protocols
    )
    this.ws.onopen = () => {
      useToast().success(
        `WebSocket to UI server '${this.uiServerConfiguration.host}:${this.uiServerConfiguration.port.toString()}' successfully opened`
      )
    }
    this.ws.onmessage = this.responseHandler.bind(this)
    this.ws.onerror = errorEvent => {
      useToast().error(
        `Error in WebSocket to UI server '${this.uiServerConfiguration.host}:${this.uiServerConfiguration.port.toString()}'`
      )
      console.error(
        `Error in WebSocket to UI server '${this.uiServerConfiguration.host}:${this.uiServerConfiguration.port.toString()}'`,
        errorEvent
      )
    }
    this.ws.onclose = () => {
      useToast().info('WebSocket to UI server closed')
    }
  }

  private responseHandler (messageEvent: MessageEvent<string>): void {
    let response: ProtocolResponse
    try {
      response = JSON.parse(messageEvent.data) as ProtocolResponse
    } catch (error) {
      useToast().error('Invalid response JSON format')
      console.error('Invalid response JSON format', error)
      return
    }

    if (!Array.isArray(response)) {
      useToast().error('Response not an array')
      console.error('Response not an array:', response)
      return
    }

    const [uuid, responsePayload] = response

    if (!validateUUID(uuid)) {
      useToast().error('Response UUID field is invalid')
      console.error('Response UUID field is invalid:', response)
      return
    }

    if (this.responseHandlers.has(uuid)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const { procedureName, reject, resolve } = this.responseHandlers.get(uuid)!
      switch (responsePayload.status) {
        case ResponseStatus.FAILURE:
          reject(responsePayload)
          break
        case ResponseStatus.SUCCESS:
          resolve(responsePayload)
          break
        default:
          reject(
            new Error(
              // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
              `Response status for procedure '${procedureName}' not supported: '${responsePayload.status}'`
            )
          )
      }
      this.responseHandlers.delete(uuid)
    } else {
      throw new Error(`Not a response to a request: ${JSON.stringify(response, undefined, 2)}`)
    }
  }

  private async sendRequest (
    procedureName: ProcedureName,
    payload: RequestPayload
  ): Promise<ResponsePayload> {
    return new Promise<ResponsePayload>((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        const uuid = randomUUID()
        const msg = JSON.stringify([uuid, procedureName, payload])
        const sendTimeout = setTimeout(() => {
          this.responseHandlers.delete(uuid)
          reject(new Error(`Send request '${procedureName}' message: connection timeout`))
        }, UI_WEBSOCKET_REQUEST_TIMEOUT_MS)
        try {
          this.ws.send(msg)
          this.responseHandlers.set(uuid, { procedureName, reject, resolve })
        } catch (error) {
          this.responseHandlers.delete(uuid)
          reject(
            new Error(
              `Send request '${procedureName}' message: error ${(error as Error).toString()}`
            )
          )
        } finally {
          clearTimeout(sendTimeout)
        }
      } else {
        reject(new Error(`Send request '${procedureName}' message: connection closed`))
      }
    })
  }
}
