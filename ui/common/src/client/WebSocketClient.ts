import type { ProcedureName, RequestPayload, ResponsePayload } from '../types/UIProtocol.js'
import type { UUIDv4 } from '../types/UUID.js'
import type { ClientConfig, ResponseHandler, WebSocketFactory, WebSocketLike } from './types.js'

import { UI_WEBSOCKET_REQUEST_TIMEOUT_MS } from '../constants.js'
import { ServerFailureError } from '../errors.js'
import { AuthenticationType, ResponseStatus } from '../types/UIProtocol.js'
import { randomUUID, validateUUID } from '../utils/UUID.js'
import { WebSocketReadyState } from './types.js'

export { ServerFailureError } from '../errors.js'

export class WebSocketClient {
  public get connected (): boolean {
    return this.ws?.readyState === WebSocketReadyState.OPEN
  }

  public get url (): string {
    const scheme = this.config.secure === true ? 'wss' : 'ws'
    return `${scheme}://${this.config.host}:${this.config.port.toString()}`
  }

  private readonly config: ClientConfig
  private readonly factory: WebSocketFactory
  private readonly responseHandlers: Map<UUIDv4, ResponseHandler>
  private readonly timeoutMs: number

  private ws?: WebSocketLike

  public constructor (
    factory: WebSocketFactory,
    config: ClientConfig,
    timeoutMs = UI_WEBSOCKET_REQUEST_TIMEOUT_MS,
    private readonly onNotification?: (notification: unknown[]) => void
  ) {
    this.factory = factory
    this.config = config
    this.timeoutMs = timeoutMs
    this.responseHandlers = new Map()
  }

  public connect (): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const protocols = this.buildProtocols()
      const url = this.url
      this.ws = this.factory(url, protocols)
      let settled = false
      this.ws.onopen = () => {
        settled = true
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
        settled = true
        const err =
          event.error instanceof Error
            ? event.error
            : new Error(event.message.length > 0 ? event.message : 'WebSocket connection error')
        reject(err)
      }
      this.ws.onmessage = event => {
        this.handleMessage(event.data)
      }
      this.ws.onclose = event => {
        if (!settled) {
          settled = true
          reject(
            new Error(
              `WebSocket closed before connection established (code: ${event.code.toString()})`
            )
          )
        }
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
    payload: RequestPayload,
    timeoutMs?: number
  ): Promise<ResponsePayload> {
    return new Promise<ResponsePayload>((resolve, reject) => {
      if (this.ws?.readyState !== WebSocketReadyState.OPEN) {
        reject(new Error('WebSocket is not open'))
        return
      }
      const uuid = randomUUID()
      const message = JSON.stringify([uuid, procedureName, payload])
      const effectiveTimeoutMs = timeoutMs ?? this.timeoutMs
      if (!Number.isFinite(effectiveTimeoutMs) || effectiveTimeoutMs <= 0) {
        reject(new Error(`Invalid timeout: ${String(effectiveTimeoutMs)}ms (must be > 0)`))
        return
      }
      const timeoutId = setTimeout(() => {
        this.responseHandlers.delete(uuid)
        reject(
          new Error(`Request '${procedureName}' timed out after ${effectiveTimeoutMs.toString()}ms`)
        )
      }, effectiveTimeoutMs)
      this.responseHandlers.set(uuid, { reject, resolve, timeoutId })
      this.ws.send(message)
    })
  }

  private buildProtocols (): string | string[] {
    const primary = `${this.config.protocol}${this.config.version}`
    const auth = this.config.authentication
    if (
      auth?.enabled === true &&
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      auth.type === AuthenticationType.PROTOCOL_BASIC_AUTH &&
      auth.username != null &&
      auth.password != null
    ) {
      const encoded = btoa(`${auth.username}:${auth.password}`).replace(/={1,2}$/, '')
      return [primary, `authorization.basic.${encoded}`]
    }
    return primary
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
    if (!Array.isArray(message)) return
    if (message.length === 1) {
      this.onNotification?.(message)
      return
    }
    if (message.length !== 2) return
    const [uuid, responsePayload] = message as [unknown, unknown]
    if (!validateUUID(uuid)) return
    const handler = this.responseHandlers.get(uuid)
    if (handler == null) return
    if (
      responsePayload == null ||
      typeof responsePayload !== 'object' ||
      !('status' in responsePayload) ||
      typeof (responsePayload as { status: unknown }).status !== 'string'
    ) {
      this.settleHandler(uuid, handler)
      handler.reject(new Error('Server sent malformed response payload'))
      return
    }
    this.settleHandler(uuid, handler)
    const payload = responsePayload as ResponsePayload
    if (payload.status === ResponseStatus.SUCCESS) {
      handler.resolve(payload)
    } else {
      handler.reject(new ServerFailureError(payload))
    }
  }

  private settleHandler (uuid: UUIDv4, handler: ResponseHandler): void {
    clearTimeout(handler.timeoutId)
    this.responseHandlers.delete(uuid)
  }
}
