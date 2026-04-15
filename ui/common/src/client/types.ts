import type { AuthenticationType, ResponsePayload } from '../types/UIProtocol.js'

export const enum WebSocketReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
}

export interface AuthenticationConfig {
  enabled: boolean
  password?: string
  type: AuthenticationType
  username?: string
}

export interface ClientConfig {
  authentication?: AuthenticationConfig
  host: string
  port: number
  protocol: string
  secure?: boolean
  version: string
}

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
