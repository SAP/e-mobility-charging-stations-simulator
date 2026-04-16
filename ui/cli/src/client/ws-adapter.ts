import type { WebSocketLike } from 'ui-common'
import type { WebSocket as WsWebSocket } from 'ws'

import { Buffer } from 'node:buffer'
import { createWsAdapter as createWsAdapterBase } from 'ui-common'

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

export const createWsAdapter = (ws: WsWebSocket): WebSocketLike =>
  createWsAdapterBase(ws as unknown as Parameters<typeof createWsAdapterBase>[0], {
    dataConverter: data => toDataString(data as WsWebSocket.Data),
    errorDefault: 'Unknown error',
  })
