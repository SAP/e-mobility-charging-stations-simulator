/** @file Shared mock factories for WebSocket-based tests */

import type { WebSocketLike } from '../src/client/types.js'

export interface MockWebSocketLike extends WebSocketLike {
  sentMessages: string[]
  triggerClose: () => void
  triggerError: (message: string) => void
  triggerMessage: (data: string) => void
  triggerOpen: () => void
}

/**
 * @returns Mock WebSocket with trigger methods for testing.
 */
export function createMockWebSocketLike (): MockWebSocketLike {
  let oncloseFn: ((event: { code: number; reason: string }) => void) | null = null
  let onerrorFn: ((event: { error: unknown; message: string }) => void) | null = null
  let onmessageFn: ((event: { data: string }) => void) | null = null
  let onopenFn: (() => void) | null = null
  const sentMessages: string[] = []
  let readyState: 0 | 1 | 2 | 3 = 1

  return {
    close () {
      readyState = 3
      oncloseFn?.({ code: 1000, reason: '' })
    },
    get onclose () {
      return oncloseFn
    },
    set onclose (l: ((event: { code: number; reason: string }) => void) | null) {
      oncloseFn = l
    },
    get onerror () {
      return onerrorFn
    },
    set onerror (l: ((event: { error: unknown; message: string }) => void) | null) {
      onerrorFn = l
    },
    get onmessage () {
      return onmessageFn
    },
    set onmessage (l: ((event: { data: string }) => void) | null) {
      onmessageFn = l
    },
    get onopen () {
      return onopenFn
    },
    set onopen (l: (() => void) | null) {
      onopenFn = l
    },
    get readyState () {
      return readyState
    },
    send (data) {
      sentMessages.push(data)
    },
    sentMessages,
    triggerClose () {
      readyState = 3
      oncloseFn?.({ code: 1000, reason: '' })
    },
    triggerError (message) {
      onerrorFn?.({ error: new Error(message), message })
    },
    triggerMessage (data) {
      onmessageFn?.({ data })
    },
    triggerOpen () {
      onopenFn?.()
    },
  }
}
