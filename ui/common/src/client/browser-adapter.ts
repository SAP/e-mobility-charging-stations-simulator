import type { WebSocketReadyState } from './types.js'

import { type WebSocketLike } from './types.js'

interface BrowserWebSocket {
  close(code?: number, reason?: string): void
  set onclose(handler: ((event: { code: number; reason: string }) => void) | null)
  set onerror(handler: ((event: unknown) => void) | null)
  set onmessage(handler: ((event: { data: unknown }) => void) | null)
  set onopen(handler: (() => void) | null)
  readonly readyState: number
  send(data: string): void
}

export const createBrowserWsAdapter = (ws: BrowserWebSocket): WebSocketLike => {
  let onmessageCallback: WebSocketLike['onmessage'] = null
  let onerrorCallback: WebSocketLike['onerror'] = null
  let oncloseCallback: WebSocketLike['onclose'] = null
  let onopenCallback: WebSocketLike['onopen'] = null

  ws.onmessage = event => {
    if (onmessageCallback != null) {
      const data = event.data as string
      onmessageCallback({ data })
    }
  }

  ws.onerror = event => {
    if (onerrorCallback != null) {
      const raw = event as { error?: unknown; message?: string }
      const error =
        raw.error instanceof Error ? raw.error : new Error(raw.message ?? 'WebSocket error')
      const message = raw.message ?? error.message
      onerrorCallback({ error, message })
    }
  }

  ws.onclose = event => {
    if (oncloseCallback != null) {
      oncloseCallback({ code: event.code, reason: event.reason })
    }
  }

  ws.onopen = () => {
    if (onopenCallback != null) {
      onopenCallback()
    }
  }

  return {
    close (code?: number, reason?: string): void {
      ws.close(code, reason)
    },
    get onclose () {
      return oncloseCallback
    },

    set onclose (callback) {
      oncloseCallback = callback
    },
    get onerror () {
      return onerrorCallback
    },

    set onerror (callback) {
      onerrorCallback = callback
    },
    get onmessage () {
      return onmessageCallback
    },

    set onmessage (callback) {
      onmessageCallback = callback
    },
    get onopen () {
      return onopenCallback
    },

    set onopen (callback) {
      onopenCallback = callback
    },

    get readyState (): WebSocketReadyState {
      return ws.readyState as WebSocketReadyState
    },

    send (data: string): void {
      ws.send(data)
    },
  }
}
