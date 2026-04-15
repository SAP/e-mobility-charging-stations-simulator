/**
 * @file Unit tests for the WebSocket adapter (ws → WebSocketLike)
 * @description Tests for converting ws library WebSocket to WebSocketLike interface
 */

import type { WebSocket } from 'ws'

import assert from 'node:assert'
import { Buffer } from 'node:buffer'
import { describe, it } from 'node:test'
import { WebSocketReadyState } from 'ui-common'

import { createWsAdapter } from '../src/client/ws-adapter.js'

interface MockWs {
  close: (code?: number, reason?: string) => void
  onclose: ((event: { code: number; reason: string }) => void) | null
  onerror: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onopen: (() => void) | null
  readyState: WebSocketReadyState
  send: (data: string) => void
}

const createMockWs = (): MockWs => ({
  close: () => undefined,
  onclose: null,
  onerror: null,
  onmessage: null,
  onopen: null,
  readyState: WebSocketReadyState.OPEN,
  send: () => undefined,
})

await describe('WS Adapter', async () => {
  await it('should convert Buffer data to string in onmessage', () => {
    const mockWs = createMockWs()

    const adapter = createWsAdapter(mockWs as unknown as WebSocket)

    let receivedData: string | undefined
    adapter.onmessage = event => {
      receivedData = event.data
    }

    const bufferData = Buffer.from('hello', 'utf-8')
    mockWs.onmessage?.({ data: bufferData })

    assert.strictEqual(receivedData, 'hello')
  })

  await it('should convert ArrayBuffer data to string in onmessage', () => {
    const mockWs = createMockWs()

    const adapter = createWsAdapter(mockWs as unknown as WebSocket)

    let receivedData: string | undefined
    adapter.onmessage = event => {
      receivedData = event.data
    }

    const arrayBuffer = new TextEncoder().encode('world').buffer
    mockWs.onmessage?.({ data: arrayBuffer })

    assert.strictEqual(receivedData, 'world')
  })

  await it('should convert Buffer[] data to string in onmessage', () => {
    const mockWs = createMockWs()

    const adapter = createWsAdapter(mockWs as unknown as WebSocket)

    let receivedData: string | undefined
    adapter.onmessage = event => {
      receivedData = event.data
    }

    const bufferArray = [Buffer.from('hello'), Buffer.from(' '), Buffer.from('world')]
    mockWs.onmessage?.({ data: bufferArray })

    assert.strictEqual(receivedData, 'hello world')
  })

  await it('should pass through string data in onmessage', () => {
    const mockWs = createMockWs()

    const adapter = createWsAdapter(mockWs as unknown as WebSocket)

    let receivedData: string | undefined
    adapter.onmessage = event => {
      receivedData = event.data
    }

    mockWs.onmessage?.({ data: 'already a string' })

    assert.strictEqual(receivedData, 'already a string')
  })

  await it('should delegate readyState getter to ws', () => {
    const mockWs = createMockWs()
    mockWs.readyState = WebSocketReadyState.CONNECTING

    const adapter = createWsAdapter(mockWs as unknown as WebSocket)

    assert.strictEqual(adapter.readyState, WebSocketReadyState.CONNECTING)
  })

  await it('should delegate send() to ws', () => {
    let sentData: string | undefined
    const mockWs = createMockWs()
    mockWs.send = (data: string) => {
      sentData = data
    }

    const adapter = createWsAdapter(mockWs as unknown as WebSocket)
    adapter.send('test message')

    assert.strictEqual(sentData, 'test message')
  })

  await it('should delegate close() to ws', () => {
    let closeCode: number | undefined
    let closeReason: string | undefined
    const mockWs = createMockWs()
    mockWs.close = (code?: number, reason?: string) => {
      closeCode = code
      closeReason = reason
    }

    const adapter = createWsAdapter(mockWs as unknown as WebSocket)
    adapter.close(1000, 'normal closure')

    assert.strictEqual(closeCode, 1000)
    assert.strictEqual(closeReason, 'normal closure')
  })

  await it('should forward onerror event with error shape', () => {
    const mockWs = createMockWs()

    const adapter = createWsAdapter(mockWs as unknown as WebSocket)

    let receivedError: unknown
    let receivedMessage: string | undefined
    adapter.onerror = event => {
      receivedError = event.error
      receivedMessage = event.message
    }

    const testError = new Error('connection failed')
    mockWs.onerror?.(testError)

    assert.ok(receivedError instanceof Error)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const error = receivedError as Error
    assert.strictEqual(error.message, 'connection failed')
    assert.strictEqual(receivedMessage, 'connection failed')
  })

  await it('should forward onerror when event is a string', () => {
    const mockWs = createMockWs()
    const adapter = createWsAdapter(mockWs as unknown as WebSocket)
    let receivedMessage = ''
    adapter.onerror = event => {
      receivedMessage = event.message
    }
    mockWs.onerror?.('connection refused')
    assert.strictEqual(receivedMessage, 'connection refused')
  })

  await it('should forward onerror with fallback for unknown event type', () => {
    const mockWs = createMockWs()
    const adapter = createWsAdapter(mockWs as unknown as WebSocket)
    let receivedMessage = ''
    adapter.onerror = event => {
      receivedMessage = event.message
    }
    mockWs.onerror?.(42 as unknown as Error)
    assert.strictEqual(receivedMessage, 'Unknown error')
  })

  await it('should forward onclose event with code and reason', () => {
    const mockWs = createMockWs()
    mockWs.readyState = WebSocketReadyState.CLOSED

    const adapter = createWsAdapter(mockWs as unknown as WebSocket)

    let receivedCode: number | undefined
    let receivedReason: string | undefined
    adapter.onclose = event => {
      receivedCode = event.code
      receivedReason = event.reason
    }

    mockWs.onclose?.({ code: 1000, reason: 'normal closure' })

    assert.strictEqual(receivedCode, 1000)
    assert.strictEqual(receivedReason, 'normal closure')
  })

  await it('should forward onopen event', () => {
    const mockWs = createMockWs()

    const adapter = createWsAdapter(mockWs as unknown as WebSocket)

    let openCalled = false
    adapter.onopen = () => {
      openCalled = true
    }

    mockWs.onopen?.()

    assert.strictEqual(openCalled, true)
  })

  await it('should have getter and setter for onmessage', () => {
    const mockWs = createMockWs()

    const adapter = createWsAdapter(mockWs as unknown as WebSocket)

    const callback = (event: { data: string }): undefined => {
      // eslint-disable-next-line no-void
      void event
      return undefined
    }
    adapter.onmessage = callback
    assert.strictEqual(adapter.onmessage, callback)

    adapter.onmessage = null
    assert.strictEqual(adapter.onmessage, null)
  })

  await it('should have getter and setter for onerror', () => {
    const mockWs = createMockWs()

    const adapter = createWsAdapter(mockWs as unknown as WebSocket)

    const callback = (event: { error: unknown; message: string }): undefined => {
      // eslint-disable-next-line no-void
      void event
      return undefined
    }
    adapter.onerror = callback
    assert.strictEqual(adapter.onerror, callback)

    adapter.onerror = null
    assert.strictEqual(adapter.onerror, null)
  })

  await it('should have getter and setter for onclose', () => {
    const mockWs = createMockWs()

    const adapter = createWsAdapter(mockWs as unknown as WebSocket)

    const callback = (event: { code: number; reason: string }): undefined => {
      // eslint-disable-next-line no-void
      void event
      return undefined
    }
    adapter.onclose = callback
    assert.strictEqual(adapter.onclose, callback)

    adapter.onclose = null
    assert.strictEqual(adapter.onclose, null)
  })

  await it('should have getter and setter for onopen', () => {
    const mockWs = createMockWs()

    const adapter = createWsAdapter(mockWs as unknown as WebSocket)

    const callback = (): undefined => undefined
    adapter.onopen = callback
    assert.strictEqual(adapter.onopen, callback)

    adapter.onopen = null
    assert.strictEqual(adapter.onopen, null)
  })
})
