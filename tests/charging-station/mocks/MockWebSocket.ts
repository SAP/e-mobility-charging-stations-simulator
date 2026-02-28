/**
 * WebSocket mock for testing
 *
 * Simulates a WebSocket connection for testing without actual network I/O.
 * Captures all sent messages for assertion in tests.
 */

import type { RawData } from 'ws'

import { EventEmitter } from 'node:events'

/**
 * WebSocket ready states matching ws module
 */
export enum WebSocketReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
}

/**
 * MockWebSocket class with message capture capability
 *
 * Simulates a WebSocket connection for testing without actual network I/O.
 * Captures all sent messages for assertion in tests.
 * @example
 * ```typescript
 * const mockWs = new MockWebSocket('ws://localhost:8080')
 * mockWs.send('["2","uuid","BootNotification",{}]')
 * expect(mockWs.sentMessages).toContain('["2","uuid","BootNotification",{}]')
 * ```
 */
export class MockWebSocket extends EventEmitter {
  /** Close code received */
  public closeCode?: number

  /** Close reason received */
  public closeReason?: string

  /** Negotiated protocol */
  public protocol = 'ocpp1.6'

  /** WebSocket ready state */
  public readyState: WebSocketReadyState = WebSocketReadyState.OPEN

  /** Binary messages sent via send() */
  public sentBinaryMessages: Buffer[] = []

  /** All messages sent via send() */
  public sentMessages: string[] = []

  /** URL this socket was connected to */
  public readonly url: string

  constructor (url: string | URL, _protocols?: string | string[]) {
    super()
    this.url = typeof url === 'string' ? url : url.toString()
  }

  /**
   * Clear all captured messages
   */
  public clearMessages (): void {
    this.sentMessages = []
    this.sentBinaryMessages = []
  }

  /**
   * Close the WebSocket connection
   * @param code - Close status code
   * @param reason - Close reason string
   */
  public close (code?: number, reason?: string): void {
    this.closeCode = code
    this.closeReason = reason
    this.readyState = WebSocketReadyState.CLOSING
    // Emit close event asynchronously like real WebSocket
    setImmediate(() => {
      this.readyState = WebSocketReadyState.CLOSED
      this.emit('close', code ?? 1000, Buffer.from(reason ?? ''))
    })
  }

  /**
   * Get the last message sent
   * @returns The last sent message or undefined if none
   */
  public getLastSentMessage (): string | undefined {
    return this.sentMessages[this.sentMessages.length - 1]
  }

  /**
   * Get all sent messages parsed as JSON
   * @returns Array of parsed JSON messages
   */
  public getSentMessagesAsJson (): unknown[] {
    return this.sentMessages.map(msg => JSON.parse(msg) as unknown)
  }

  /**
   * Send a message through the WebSocket
   * @param data - Message to send
   */
  public send (data: Buffer | string): void {
    if (this.readyState !== WebSocketReadyState.OPEN) {
      throw new Error('WebSocket is not open')
    }
    if (typeof data === 'string') {
      this.sentMessages.push(data)
    } else {
      this.sentBinaryMessages.push(data)
    }
  }

  /**
   * Simulate connection close from server
   * @param code - Close code
   * @param reason - Close reason
   */
  public simulateClose (code = 1000, reason = ''): void {
    this.readyState = WebSocketReadyState.CLOSED
    this.emit('close', code, Buffer.from(reason))
  }

  /**
   * Simulate a WebSocket error
   * @param error - Error to emit
   */
  public simulateError (error: Error): void {
    this.emit('error', error)
  }

  /**
   * Simulate receiving a message from the server
   * @param data - Message data to receive
   */
  public simulateMessage (data: RawData | string): void {
    const buffer = typeof data === 'string' ? Buffer.from(data) : data
    this.emit('message', buffer, false)
  }

  /**
   * Simulate the connection opening
   */
  public simulateOpen (): void {
    this.readyState = WebSocketReadyState.OPEN
    this.emit('open')
  }

  /**
   * Simulate a ping from the server
   * @param data - Optional ping data buffer
   */
  public simulatePing (data?: Buffer): void {
    this.emit('ping', data ?? Buffer.alloc(0))
  }

  /**
   * Simulate a pong from the server
   * @param data - Optional pong data buffer
   */
  public simulatePong (data?: Buffer): void {
    this.emit('pong', data ?? Buffer.alloc(0))
  }

  /**
   * Terminate the connection immediately
   */
  public terminate (): void {
    this.readyState = WebSocketReadyState.CLOSED
    this.emit('close', 1006, Buffer.from('Connection terminated'))
  }
}
