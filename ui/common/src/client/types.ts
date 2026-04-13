import type { ResponsePayload } from '../types/UIProtocol.js'

export interface AuthenticationConfig {
  enabled: boolean
  password?: string
  type: string
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

export type ReadyState = 0 | 1 | 2 | 3 // CONNECTING, OPEN, CLOSING, CLOSED

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
  readonly readyState: ReadyState
  send(data: string): void
}
