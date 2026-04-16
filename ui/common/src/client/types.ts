import type { UIServerConfigurationSection } from '../config/schema.js'
import type { ResponsePayload } from '../types/UIProtocol.js'

export const enum WebSocketReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
}

export type AuthenticationConfig = NonNullable<UIServerConfigurationSection['authentication']>

export type ClientConfig = Omit<UIServerConfigurationSection, 'name'>

export type DataConverter = (data: unknown) => string

export interface ResponseHandler {
  reject: (reason?: unknown) => void
  resolve: (value: ResponsePayload) => void
  timeoutId: ReturnType<typeof setTimeout>
}

export type WebSocketFactory = (url: string, protocols: string | string[]) => WebSocketLike

export interface WebSocketLike {
  close(code?: number, reason?: string): void
  onclose: ((event: { code: number; reason: string }) => void) | null
  onerror: ((event: { error: unknown; message: string }) => void) | null
  onmessage: ((event: { data: string }) => void) | null
  onopen: (() => void) | null
  readonly readyState: WebSocketReadyState
  send(data: string): void
}
