import type { OCPPVersion } from 'ui-common'

import {
  buildAuthorizePayload,
  buildStartTransactionPayload,
  buildStopTransactionPayload,
  type ChargingStationOptions,
  createBrowserWsAdapter,
  isOCPP20x,
  ProcedureName,
  type RequestPayload,
  type ResponsePayload,
  ResponseStatus,
  ServerNotification,
  type UIServerConfigurationSection,
  WebSocketClient,
  type WebSocketFactory,
} from 'ui-common'
import { useToast } from 'vue-toast-notification'

export class UIClient {
  private static instance: null | UIClient = null
  private abortConnection: () => void
  private client: WebSocketClient
  private readonly refreshListeners: Set<() => void>
  private uiServerConfiguration: UIServerConfigurationSection
  private readonly wsEventTarget: EventTarget

  private constructor (uiServerConfiguration: UIServerConfigurationSection) {
    this.uiServerConfiguration = uiServerConfiguration
    this.refreshListeners = new Set()
    this.wsEventTarget = new EventTarget()
    const { abort, client } = this.createClientWithAbort()
    this.client = client
    this.abortConnection = abort
    this.client.connect().catch((error: unknown) => {
      console.error('WebSocket connect failed', error)
    })
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

  public async authorize (
    hashId: string,
    idTag: string,
    ocppVersion?: OCPPVersion
  ): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.AUTHORIZE, {
      hashIds: [hashId],
      ...buildAuthorizePayload(idTag, ocppVersion),
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

  public isConnected (): boolean {
    return this.client.connected
  }

  public async listChargingStations (): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.LIST_CHARGING_STATIONS, {})
  }

  public async listTemplates (): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.LIST_TEMPLATES, {})
  }

  public async lockConnector (hashId: string, connectorId: number): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.LOCK_CONNECTOR, {
      connectorId,
      hashIds: [hashId],
    })
  }

  public onRefresh (listener: () => void): () => void {
    this.refreshListeners.add(listener)
    return () => {
      this.refreshListeners.delete(listener)
    }
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
    this.wsEventTarget.addEventListener(event, listener as EventListener, options)
  }

  public setConfiguration (uiServerConfiguration: UIServerConfigurationSection): void {
    this.abortConnection()
    this.client.disconnect()
    this.uiServerConfiguration = uiServerConfiguration
    const { abort, client } = this.createClientWithAbort()
    this.client = client
    this.abortConnection = abort
    this.client.connect().catch((error: unknown) => {
      console.error('WebSocket connect failed', error)
    })
  }

  public async setSupervisionUrl (
    hashId: string,
    supervisionUrl: string,
    supervisionUser?: string,
    supervisionPassword?: string
  ): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.SET_SUPERVISION_URL, {
      hashIds: [hashId],
      url: supervisionUrl,
      ...(supervisionUser != null && { supervisionUser }),
      ...(supervisionPassword != null && { supervisionPassword }),
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
    options: {
      connectorId: number
      evseId?: number
      idTag?: string
      ocppVersion?: OCPPVersion
    }
  ): Promise<ResponsePayload> {
    const { payload, procedureName } = buildStartTransactionPayload(
      options.connectorId,
      options.ocppVersion,
      { evseId: options.evseId, idTag: options.idTag }
    )
    if (procedureName === ProcedureName.TRANSACTION_EVENT) {
      return this.transactionEvent(hashId, payload)
    }
    return this.sendRequest(ProcedureName.START_TRANSACTION, {
      hashIds: [hashId],
      ...payload,
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
    options: {
      ocppVersion?: OCPPVersion
      transactionId: number | string | undefined
    }
  ): Promise<ResponsePayload> {
    if (options.transactionId == null) {
      return {
        responsesFailed: [
          {
            errorMessage: 'transactionId is required',
            hashId,
            status: ResponseStatus.FAILURE,
          },
        ],
        status: ResponseStatus.FAILURE,
      }
    }
    if (!isOCPP20x(options.ocppVersion) && typeof options.transactionId === 'string') {
      return {
        responsesFailed: [
          {
            errorMessage: 'OCPP 1.6 requires numeric transactionId',
            hashId,
            status: ResponseStatus.FAILURE,
          },
        ],
        status: ResponseStatus.FAILURE,
      }
    }
    const { payload, procedureName } = buildStopTransactionPayload(
      options.transactionId,
      options.ocppVersion
    )
    if (procedureName === ProcedureName.TRANSACTION_EVENT) {
      return this.transactionEvent(hashId, payload)
    }
    return this.sendRequest(ProcedureName.STOP_TRANSACTION, {
      hashIds: [hashId],
      ...payload,
    })
  }

  public async unlockConnector (hashId: string, connectorId: number): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.UNLOCK_CONNECTOR, {
      connectorId,
      hashIds: [hashId],
    })
  }

  public unregisterWSEventListener<K extends keyof WebSocketEventMap>(
    event: K,
    listener: (event: WebSocketEventMap[K]) => void,
    options?: AddEventListenerOptions | boolean
  ) {
    this.wsEventTarget.removeEventListener(event, listener as EventListener, options)
  }

  private createClientWithAbort (): { abort: () => void; client: WebSocketClient } {
    let aborted = false
    const config = this.uiServerConfiguration
    const eventTarget = this.wsEventTarget

    const factory: WebSocketFactory = (url, protocols) => {
      const adapter = createBrowserWsAdapter(
        new WebSocket(url, protocols) as unknown as Parameters<typeof createBrowserWsAdapter>[0]
      )

      return {
        close (code?: number, reason?: string): void {
          adapter.close(code, reason)
        },
        get onclose () {
          return adapter.onclose
        },
        set onclose (handler) {
          adapter.onclose = event => {
            if (aborted) return
            handler?.(event)
            useToast().info('WebSocket to UI server closed')
            eventTarget.dispatchEvent(
              new CloseEvent('close', { code: event.code, reason: event.reason })
            )
          }
        },
        get onerror () {
          return adapter.onerror
        },
        set onerror (handler) {
          adapter.onerror = event => {
            if (aborted) return
            handler?.(event)
            useToast().error(
              `Error in WebSocket to UI server '${config.host}:${config.port.toString()}'`
            )
            console.error(
              `Error in WebSocket to UI server '${config.host}:${config.port.toString()}'`,
              event
            )
            eventTarget.dispatchEvent(new Event('error'))
          }
        },
        get onmessage () {
          return adapter.onmessage
        },
        set onmessage (handler) {
          adapter.onmessage = handler
        },
        get onopen () {
          return adapter.onopen
        },
        set onopen (handler) {
          adapter.onopen = () => {
            if (aborted) return
            handler?.()
            useToast().success(
              `WebSocket to UI server '${config.host}:${config.port.toString()}' successfully opened`
            )
            eventTarget.dispatchEvent(new Event('open'))
          }
        },
        get readyState () {
          return adapter.readyState
        },
        send (data: string): void {
          adapter.send(data)
        },
      }
    }

    const client = new WebSocketClient(
      factory,
      {
        authentication: config.authentication,
        host: config.host,
        port: config.port,
        protocol: config.protocol,
        secure: config.secure,
        version: config.version,
      },
      undefined,
      (notification: unknown[]) => {
        if (notification[0] === ServerNotification.REFRESH) {
          for (const listener of this.refreshListeners) {
            listener()
          }
        }
      }
    )

    return {
      abort: () => {
        aborted = true
      },
      client,
    }
  }

  private async sendRequest (
    procedureName: ProcedureName,
    payload: RequestPayload
  ): Promise<ResponsePayload> {
    return this.client.sendRequest(procedureName, payload)
  }

  private async transactionEvent (
    hashId: string,
    payload: RequestPayload
  ): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.TRANSACTION_EVENT, {
      hashIds: [hashId],
      ...payload,
    })
  }
}
