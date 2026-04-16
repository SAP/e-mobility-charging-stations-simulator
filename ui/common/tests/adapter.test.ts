/** @file Unit tests for the generic WebSocket adapter factory */

import assert from 'node:assert'
import { describe, it } from 'node:test'

import { createWsAdapter } from '../src/client/adapter.js'
import { WebSocketReadyState } from '../src/client/types.js'

interface MockRawWs {
  close: (code?: number, reason?: string) => void
  onclose: ((event: { code: number; reason: string }) => void) | null
  onerror: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onopen: (() => void) | null
  readyState: number
  send: (data: string) => void
}

const createMockRawWs = (): MockRawWs => ({
  close: () => undefined,
  onclose: null,
  onerror: null,
  onmessage: null,
  onopen: null,
  readyState: WebSocketReadyState.OPEN,
  send: () => undefined,
})

await describe('generic WebSocket adapter factory', async () => {
  await it('should apply dataConverter to message data', () => {
    const mockWs = createMockRawWs()
    const adapter = createWsAdapter(mockWs as never, {
      dataConverter: data => `converted:${String(data)}`,
    })
    let receivedData: string | undefined
    adapter.onmessage = event => {
      receivedData = event.data
    }
    mockWs.onmessage?.({ data: 'raw' })
    assert.strictEqual(receivedData, 'converted:raw')
  })

  await it('should use custom errorDefault in onerror fallback', () => {
    const mockWs = createMockRawWs()
    const adapter = createWsAdapter(mockWs as never, {
      dataConverter: data => data as string,
      errorDefault: 'Custom fallback',
    })
    let receivedMessage: string | undefined
    adapter.onerror = event => {
      receivedMessage = event.message
    }
    mockWs.onerror?.({})
    assert.strictEqual(receivedMessage, 'Custom fallback')
  })

  await it('should default errorDefault to WebSocket error', () => {
    const mockWs = createMockRawWs()
    const adapter = createWsAdapter(mockWs as never, {
      dataConverter: data => data as string,
    })
    let receivedMessage: string | undefined
    adapter.onerror = event => {
      receivedMessage = event.message
    }
    mockWs.onerror?.({})
    assert.strictEqual(receivedMessage, 'WebSocket error')
  })

  await it('should delegate close, send, and readyState', () => {
    const mockWs = createMockRawWs()
    let closedCode: number | undefined
    let sentData: string | undefined
    mockWs.close = (code?: number) => {
      closedCode = code
    }
    mockWs.send = (data: string) => {
      sentData = data
    }
    mockWs.readyState = WebSocketReadyState.CONNECTING
    const adapter = createWsAdapter(mockWs as never, {
      dataConverter: data => data as string,
    })
    adapter.close(1000)
    adapter.send('test')
    assert.strictEqual(closedCode, 1000)
    assert.strictEqual(sentData, 'test')
    assert.strictEqual(adapter.readyState, WebSocketReadyState.CONNECTING)
  })

  await it('should forward onclose and onopen events', () => {
    const mockWs = createMockRawWs()
    const adapter = createWsAdapter(mockWs as never, {
      dataConverter: data => data as string,
    })
    let closeCode: number | undefined
    let opened = false
    adapter.onclose = event => {
      closeCode = event.code
    }
    adapter.onopen = () => {
      opened = true
    }
    mockWs.onclose?.({ code: 1000, reason: 'normal' })
    mockWs.onopen?.()
    assert.strictEqual(closeCode, 1000)
    assert.strictEqual(opened, true)
  })
})
