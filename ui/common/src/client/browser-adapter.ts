import type { WebSocketLike } from './types.js'

import { createWsAdapter } from './adapter.js'

interface BrowserWebSocket {
  close(code?: number, reason?: string): void
  set onclose(handler: ((event: { code: number; reason: string }) => void) | null)
  set onerror(handler: ((event: unknown) => void) | null)
  set onmessage(handler: ((event: { data: unknown }) => void) | null)
  set onopen(handler: (() => void) | null)
  readonly readyState: number
  send(data: string): void
}

export const createBrowserWsAdapter = (ws: BrowserWebSocket): WebSocketLike =>
  createWsAdapter(ws, {
    dataConverter: data => data as string,
    errorDefault: 'WebSocket error',
  })
