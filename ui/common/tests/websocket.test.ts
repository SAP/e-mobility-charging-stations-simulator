import assert from 'node:assert'
import { describe, it } from 'node:test'

import { WebSocketReadyState } from '../src/client/types.js'
import { getWebSocketStateName } from '../src/utils/websocket.js'

await describe('getWebSocketStateName', async () => {
  await it('should return "Connecting" for WebSocketReadyState.CONNECTING (0)', () => {
    assert.strictEqual(getWebSocketStateName(WebSocketReadyState.CONNECTING), 'Connecting')
  })

  await it('should return "Open" for WebSocketReadyState.OPEN (1)', () => {
    assert.strictEqual(getWebSocketStateName(WebSocketReadyState.OPEN), 'Open')
  })

  await it('should return "Closing" for WebSocketReadyState.CLOSING (2)', () => {
    assert.strictEqual(getWebSocketStateName(WebSocketReadyState.CLOSING), 'Closing')
  })

  await it('should return "Closed" for WebSocketReadyState.CLOSED (3)', () => {
    assert.strictEqual(getWebSocketStateName(WebSocketReadyState.CLOSED), 'Closed')
  })

  await it('should return undefined for unknown state (99)', () => {
    assert.strictEqual(getWebSocketStateName(99), undefined)
  })

  await it('should return undefined for undefined input', () => {
    assert.strictEqual(getWebSocketStateName(undefined), undefined)
  })
})
