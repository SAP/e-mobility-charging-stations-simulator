import type { WebSocketLike } from 'ui-common'
import type { WebSocketReadyState } from 'ui-common'
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
  let onmessageCallback: ((event: { data: string }) => void) | null = null
  let onerrorCallback: ((event: { error: unknown; message: string }) => void) | null = null
  let oncloseCallback: ((event: { code: number; reason: string }) => void) | null = null
  let onopenCallback: (() => void) | null = null

  ws.onmessage = event => {
    if (onmessageCallback != null) {
      const data = toDataString(event.data)
      onmessageCallback({ data })
    }
  }

  ws.onerror = event => {
    if (onerrorCallback != null) {
      let error: Error
      let message: string
      if (event instanceof Error) {
        error = event
        message = event.message
      } else {
        message = typeof event === 'string' ? event : 'Unknown error'
        error = new Error(message)
      }
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
    get onclose (): ((event: { code: number; reason: string }) => void) | null {
      return oncloseCallback
    },

    set onclose (callback: ((event: { code: number; reason: string }) => void) | null) {
      oncloseCallback = callback
    },
    get onerror (): ((event: { error: unknown; message: string }) => void) | null {
      return onerrorCallback
    },

    set onerror (callback: ((event: { error: unknown; message: string }) => void) | null) {
      onerrorCallback = callback
    },
    get onmessage (): ((event: { data: string }) => void) | null {
      return onmessageCallback
    },

    set onmessage (callback: ((event: { data: string }) => void) | null) {
      onmessageCallback = callback
    },
    get onopen (): (() => void) | null {
      return onopenCallback
    },

    set onopen (callback: (() => void) | null) {
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
