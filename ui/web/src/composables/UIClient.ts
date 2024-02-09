import {
  ProcedureName,
  type ProtocolResponse,
  type RequestPayload,
  type ResponsePayload,
  ResponseStatus
} from '@/types'
import config from '@/assets/config'

type ResponseHandler = {
  procedureName: ProcedureName
  resolve: (value: ResponsePayload | PromiseLike<ResponsePayload>) => void
  reject: (reason?: unknown) => void
}

export class UIClient {
  private static instance: UIClient | null = null

  private ws!: WebSocket
  private responseHandlers: Map<string, ResponseHandler>

  private constructor() {
    this.openWS()
    this.responseHandlers = new Map<string, ResponseHandler>()
  }

  public static getInstance() {
    if (UIClient.instance === null) {
      UIClient.instance = new UIClient()
    }
    return UIClient.instance
  }

  public registerWSonOpenListener(listener: (event: Event) => void) {
    this.ws.addEventListener('open', listener)
  }

  public async startSimulator(): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.START_SIMULATOR, {})
  }

  public async stopSimulator(): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.STOP_SIMULATOR, {})
  }

  public async listChargingStations(): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.LIST_CHARGING_STATIONS, {})
  }

  public async startChargingStation(hashId: string): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.START_CHARGING_STATION, { hashIds: [hashId] })
  }

  public async stopChargingStation(hashId: string): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.STOP_CHARGING_STATION, { hashIds: [hashId] })
  }

  public async openConnection(hashId: string): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.OPEN_CONNECTION, {
      hashIds: [hashId]
    })
  }

  public async closeConnection(hashId: string): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.CLOSE_CONNECTION, {
      hashIds: [hashId]
    })
  }

  public async startTransaction(
    hashId: string,
    connectorId: number,
    idTag: string | undefined
  ): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.START_TRANSACTION, {
      hashIds: [hashId],
      connectorId,
      idTag
    })
  }

  public async stopTransaction(
    hashId: string,
    transactionId: number | undefined
  ): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.STOP_TRANSACTION, {
      hashIds: [hashId],
      transactionId
    })
  }

  public async startAutomaticTransactionGenerator(
    hashId: string,
    connectorId: number
  ): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.START_AUTOMATIC_TRANSACTION_GENERATOR, {
      hashIds: [hashId],
      connectorIds: [connectorId]
    })
  }

  public async stopAutomaticTransactionGenerator(
    hashId: string,
    connectorId: number
  ): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.STOP_AUTOMATIC_TRANSACTION_GENERATOR, {
      hashIds: [hashId],
      connectorIds: [connectorId]
    })
  }

  private openWS(): void {
    this.ws = new WebSocket(
      `ws://${config.uiServer.host}:${config.uiServer.port}`,
      config.uiServer.protocol
    )
    this.ws.onmessage = this.responseHandler.bind(this)
    this.ws.onerror = errorEvent => {
      console.error('WebSocket error: ', errorEvent)
    }
    this.ws.onclose = closeEvent => {
      console.info('WebSocket closed: ', closeEvent)
    }
  }

  private async sendRequest(
    procedureName: ProcedureName,
    payload: RequestPayload
  ): Promise<ResponsePayload> {
    return new Promise<ResponsePayload>((resolve, reject) => {
      if (this.ws.readyState !== WebSocket.OPEN) {
        this.openWS()
      }
      if (this.ws.readyState === WebSocket.OPEN) {
        const uuid = crypto.randomUUID()
        const msg = JSON.stringify([uuid, procedureName, payload])
        const sendTimeout = setTimeout(() => {
          this.responseHandlers.delete(uuid)
          return reject(new Error(`Send request '${procedureName}' message timeout`))
        }, 60 * 1000)
        try {
          this.ws.send(msg)
          this.responseHandlers.set(uuid, { procedureName, resolve, reject })
        } catch (error) {
          this.responseHandlers.delete(uuid)
          reject(error)
        } finally {
          clearTimeout(sendTimeout)
        }
      } else {
        throw new Error(`Send request '${procedureName}' message: connection not opened`)
      }
    })
  }

  private responseHandler(messageEvent: MessageEvent<string>): void {
    const response = JSON.parse(messageEvent.data) as ProtocolResponse

    if (Array.isArray(response) === false) {
      throw new Error(`Response not an array: ${JSON.stringify(response, undefined, 2)}`)
    }

    const [uuid, responsePayload] = response

    if (this.responseHandlers.has(uuid) === true) {
      const { procedureName, resolve, reject } = this.responseHandlers.get(uuid)!
      switch (responsePayload.status) {
        case ResponseStatus.SUCCESS:
          resolve(responsePayload)
          break
        case ResponseStatus.FAILURE:
          reject(responsePayload)
          break
        default:
          console.error(
            `Response status for procedure '${procedureName}' not supported: '${responsePayload.status}'`
          )
      }
      this.responseHandlers.delete(uuid)
    } else {
      throw new Error(`Not a response to a request: ${JSON.stringify(response, undefined, 2)}`)
    }
  }
}
