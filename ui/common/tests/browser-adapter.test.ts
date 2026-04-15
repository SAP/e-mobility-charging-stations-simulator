/** @file Unit tests for the browser WebSocket adapter (browser WebSocket → WebSocketLike) */

import assert from 'node:assert'
import { describe, it } from 'node:test'

import { createBrowserWsAdapter } from '../src/client/browser-adapter.js'
import { WebSocketReadyState } from '../src/client/types.js'

interface MockBrowserWs {
  close: (code?: number, reason?: string) => void
  onclose: ((event: { code: number; reason: string }) => void) | null
  onerror: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onopen: (() => void) | null
  readyState: number
  send: (data: string) => void
}

const createMockBrowserWs = (): MockBrowserWs => ({
  close: () => undefined,
  onclose: null,
  onerror: null,
  onmessage: null,
  onopen: null,
  readyState: WebSocketReadyState.OPEN,
  send: () => undefined,
})

await describe('browser WebSocket adapter', async () => {
  // Test: MessageEvent data extraction
  await it('should extract data from MessageEvent in onmessage', () => {
    const mockWs = createMockBrowserWs()
    const adapter = createBrowserWsAdapter(mockWs as never)
    let receivedData: string | undefined
    adapter.onmessage = event => {
      receivedData = event.data
    }
    mockWs.onmessage?.({ data: '["test"]' })
    assert.strictEqual(receivedData, '["test"]')
  })

  // Test: onerror produces WebSocketLike error shape
  await it('should produce error shape from browser Event in onerror', () => {
    const mockWs = createMockBrowserWs()
    const adapter = createBrowserWsAdapter(mockWs as never)
    let receivedError: unknown
    let receivedMessage: string | undefined
    adapter.onerror = event => {
      receivedError = event.error
      receivedMessage = event.message
    }
    mockWs.onerror?.({}) // plain Event (no .error or .message)
    assert.ok(receivedError instanceof Error)
    assert.strictEqual(receivedMessage, 'WebSocket error')
  })

  // Test: onclose extracts code and reason
  await it('should extract code and reason from CloseEvent in onclose', () => {
    const mockWs = createMockBrowserWs()
    const adapter = createBrowserWsAdapter(mockWs as never)
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

  // Test: onopen forwarded
  await it('should forward onopen callback', () => {
    const mockWs = createMockBrowserWs()
    const adapter = createBrowserWsAdapter(mockWs as never)
    let opened = false
    adapter.onopen = () => {
      opened = true
    }
    mockWs.onopen?.()
    assert.strictEqual(opened, true)
  })

  // Test: send delegation
  await it('should delegate send to browser WebSocket', () => {
    const mockWs = createMockBrowserWs()
    let sentData: string | undefined
    mockWs.send = (data: string) => {
      sentData = data
    }
    const adapter = createBrowserWsAdapter(mockWs as never)
    adapter.send('{"test":1}')
    assert.strictEqual(sentData, '{"test":1}')
  })

  // Test: readyState delegation
  await it('should delegate readyState to browser WebSocket', () => {
    const mockWs = createMockBrowserWs()
    mockWs.readyState = WebSocketReadyState.CONNECTING
    const adapter = createBrowserWsAdapter(mockWs as never)
    assert.strictEqual(adapter.readyState, WebSocketReadyState.CONNECTING)
  })

  // Test: close delegation
  await it('should delegate close to browser WebSocket', () => {
    const mockWs = createMockBrowserWs()
    let closedCode: number | undefined
    mockWs.close = (code?: number) => {
      closedCode = code
    }
    const adapter = createBrowserWsAdapter(mockWs as never)
    adapter.close(1000)
    assert.strictEqual(closedCode, 1000)
  })
})
