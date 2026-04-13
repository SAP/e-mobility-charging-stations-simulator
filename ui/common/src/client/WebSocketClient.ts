import { Buffer } from 'node:buffer'

import type { ProcedureName, RequestPayload, ResponsePayload } from '../types/UIProtocol.js'
import type { UUIDv4 } from '../types/UUID.js'
import type { ClientConfig, ResponseHandler, WebSocketFactory, WebSocketLike } from './types.js'

import { ResponseStatus } from '../types/UIProtocol.js'
import { randomUUID, validateUUID } from '../utils/UUID.js'

const UI_WEBSOCKET_REQUEST_TIMEOUT_MS = 60_000

export class WebSocketClient {
  private readonly config: ClientConfig
  private readonly factory: WebSocketFactory
  private readonly responseHandlers: Map<UUIDv4, ResponseHandler>
  private readonly timeoutMs: number
  private ws?: WebSocketLike

  public constructor (
    factory: WebSocketFactory,
    config: ClientConfig,
    timeoutMs = UI_WEBSOCKET_REQUEST_TIMEOUT_MS
  ) {
    this.factory = factory
    this.config = config
    this.timeoutMs = timeoutMs
    this.responseHandlers = new Map()
  }

  public connect (): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const protocols = this.buildProtocols()
      const url = this.buildUrl()
      this.ws = this.factory(url, protocols)
      this.ws.onopen = () => {
        if (this.ws != null) {
          this.ws.onerror = event => {
            const err =
              event.error instanceof Error
                ? event.error
                : new Error(event.message.length > 0 ? event.message : 'WebSocket error')
            this.failAllPending(err)
          }
        }
        resolve()
      }
      this.ws.onerror = event => {
        const err =
          event.error instanceof Error
            ? event.error
            : new Error(event.message.length > 0 ? event.message : 'WebSocket connection error')
        reject(err)
      }
      this.ws.onmessage = event => {
        this.handleMessage(event.data)
      }
      this.ws.onclose = () => {
        this.clearHandlers()
      }
    })
  }

  public disconnect (): void {
    this.clearHandlers()
    this.ws?.close()
  }

  public sendRequest (
    procedureName: ProcedureName,
    payload: RequestPayload
  ): Promise<ResponsePayload> {
    return new Promise<ResponsePayload>((resolve, reject) => {
      if (this.ws?.readyState !== 1) {
        reject(new Error('WebSocket is not open'))
        return
      }
      const uuid = randomUUID()
      const message = JSON.stringify([uuid, procedureName, payload])
      const timeoutId = setTimeout(() => {
        this.responseHandlers.delete(uuid)
        reject(
          new Error(`Request '${procedureName}' timed out after ${this.timeoutMs.toString()}ms`)
        )
      }, this.timeoutMs)
      this.responseHandlers.set(uuid, { reject, resolve, timeoutId })
      this.ws.send(message)
    })
  }

  private buildProtocols (): string | string[] {
    const primary = `${this.config.protocol}${this.config.version}`
    const auth = this.config.authentication
    if (
      auth?.enabled === true &&
      auth.type === 'protocol-basic-auth' &&
      auth.username != null &&
      auth.password != null
    ) {
      const encoded = Buffer.from(`${auth.username}:${auth.password}`)
        .toString('base64')
        .replace(/={1,2}$/, '')
      return [primary, `authorization.basic.${encoded}`]
    }
    return primary
  }

  private buildUrl (): string {
    const scheme = this.config.secure === true ? 'wss' : 'ws'
    return `${scheme}://${this.config.host}:${this.config.port.toString()}`
  }

  private clearHandlers (): void {
    this.failAllPending(new Error('Connection closed'))
  }

  private failAllPending (error: Error): void {
    const handlers = [...this.responseHandlers.values()]
    this.responseHandlers.clear()
    for (const handler of handlers) {
      clearTimeout(handler.timeoutId)
      handler.reject(error)
    }
  }

  private handleMessage (data: string): void {
    let message: unknown
    try {
      message = JSON.parse(data) as unknown
    } catch {
      return
    }
    if (!Array.isArray(message) || message.length !== 2) return
    const [uuid, responsePayload] = message as [unknown, unknown]
    if (typeof uuid !== 'string' || !validateUUID(uuid)) return
    const handler = this.responseHandlers.get(uuid)
    if (handler == null) return
    clearTimeout(handler.timeoutId)
    this.responseHandlers.delete(uuid)
    const payload = responsePayload as ResponsePayload
    if (payload.status === ResponseStatus.SUCCESS) {
      handler.resolve(payload)
    } else {
      handler.reject(payload)
    }
  }
}
