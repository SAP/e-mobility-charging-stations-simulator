import type { WebSocketLike, WebSocketReadyState } from 'ui-common'
import type { WebSocket as WsWebSocket } from 'ws'

import { Buffer } from 'node:buffer'

const toDataString = (data: WsWebSocket.Data): string => {
  if (Buffer.isBuffer(data)) {
    return data.toString('utf-8')
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf-8')
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data as Buffer[]).toString('utf-8')
  }
  return data
}

export const createWsAdapter = (ws: WsWebSocket): WebSocketLike => {
  let onmessageCallback: WebSocketLike['onmessage'] = null
  let onerrorCallback: WebSocketLike['onerror'] = null
  let oncloseCallback: WebSocketLike['onclose'] = null
  let onopenCallback: WebSocketLike['onopen'] = null

  ws.onmessage = event => {
    if (onmessageCallback != null) {
      const data = toDataString(event.data)
      onmessageCallback({ data })
    }
  }

  ws.onerror = event => {
    if (onerrorCallback != null) {
      const raw = event as { error?: unknown; message?: string }
      const error =
        raw.error instanceof Error ? raw.error : new Error(raw.message ?? 'Unknown error')
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
