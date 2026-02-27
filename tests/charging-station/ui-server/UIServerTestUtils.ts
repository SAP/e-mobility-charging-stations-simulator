// Copyright Jerome Benoit. 2024-2025. All Rights Reserved.

import type { IncomingMessage } from 'node:http'

import { EventEmitter } from 'node:events'

import type {
  ChargingStationData,
  ProtocolRequest,
  ProtocolResponse,
  RequestPayload,
  UIServerConfiguration,
  UUIDv4,
} from '../../../src/types/index.js'

import {
  ApplicationProtocol,
  ApplicationProtocolVersion,
  AuthenticationType,
  ProcedureName,
  ResponseStatus,
} from '../../../src/types/index.js'
import { waitForCondition } from '../helpers/StationHelpers.js'
import { MockWebSocket as BaseMockWebSocket } from '../mocks/MockWebSocket.js'

// Re-export waitForCondition for backward compatibility
export { waitForCondition }

export const createMockUIServerConfiguration = (
  overrides?: Partial<UIServerConfiguration>
): UIServerConfiguration => {
  return {
    enabled: true,
    options: {
      host: 'localhost',
      port: 8080,
    },
    type: ApplicationProtocol.WS,
    version: ApplicationProtocolVersion.VERSION_11,
    ...overrides,
  }
}

export const createMockUIServerConfigurationWithAuth = (
  overrides?: Partial<UIServerConfiguration>
): UIServerConfiguration => {
  return createMockUIServerConfiguration({
    authentication: {
      enabled: true,
      password: 'test-password',
      type: AuthenticationType.BASIC_AUTH,
      username: 'test-user',
    },
    ...overrides,
  })
}

export class MockServerResponse extends EventEmitter {
  public body?: string
  public bodyBuffer?: Buffer
  public ended = false
  public headers: Record<string, string> = {}
  public statusCode?: number
  private chunks: Buffer[] = []

  public end (data?: string): this {
    if (data != null) {
      this.body = data
    } else if (this.chunks.length > 0) {
      this.bodyBuffer = Buffer.concat(this.chunks)
      this.body = this.bodyBuffer.toString('binary')
    }
    this.ended = true
    this.emit('finish')
    return this
  }

  public getResponsePayload (): ProtocolResponse | undefined {
    if (this.body == null) {
      return undefined
    }
    return JSON.parse(this.body) as ProtocolResponse
  }

  public write (chunk: Buffer | string): boolean {
    if (typeof chunk === 'string') {
      this.chunks.push(Buffer.from(chunk))
    } else {
      this.chunks.push(chunk)
    }
    return true
  }

  public writeHead (statusCode: number, headers?: Record<string, string>): this {
    this.statusCode = statusCode
    if (headers != null) {
      this.headers = headers
    }
    return this
  }
}

/**
 * MockWebSocket for UI protocol testing
 *
 * Extends base MockWebSocket with UI-specific helper methods.
 * Uses 'ui0.0.1' protocol by default.
 */
export class MockWebSocket extends BaseMockWebSocket {
  constructor () {
    super('ws://localhost:8080/ui')
    this.protocol = 'ui0.0.1'
  }

  /**
   * Get last sent message parsed as ProtocolResponse
   * @returns Parsed ProtocolResponse or undefined if no messages
   */
  public getLastSentMessageAsResponse (): ProtocolResponse | undefined {
    const lastMsg = this.getLastSentMessage()
    if (lastMsg == null) {
      return undefined
    }
    return JSON.parse(lastMsg) as ProtocolResponse
  }
}

export const createMockIncomingMessage = (
  overrides?: Partial<IncomingMessage>
): IncomingMessage => {
  return {
    headers: {},
    method: 'POST',
    url: '/ui',
    ...overrides,
  } as IncomingMessage
}

export const createMockChargingStationData = (
  hashId: string,
  overrides?: Partial<ChargingStationData>
): ChargingStationData => {
  return {
    hashId,
    started: true,
    stationInfo: {
      chargingStationId: hashId,
      hashId,
    },
    timestamp: Date.now(),
    ...overrides,
  } as ChargingStationData
}

export const createProtocolRequest = (
  uuid: UUIDv4,
  procedureName: ProcedureName,
  payload: RequestPayload = {}
): ProtocolRequest => {
  return [uuid, procedureName, payload]
}

export const createValidAuthorizeRequest = (uuid: UUIDv4, hashId: string): string => {
  return JSON.stringify(
    createProtocolRequest(uuid, ProcedureName.AUTHORIZE, {
      hashIds: [hashId],
      idTag: 'test-id-tag',
    })
  )
}

export const createValidListRequest = (uuid: UUIDv4): string => {
  return JSON.stringify(createProtocolRequest(uuid, ProcedureName.LIST_CHARGING_STATIONS, {}))
}

export const createInvalidRequest = (): string => {
  return '{"invalid": "json"'
}

export const createMalformedRequest = (): string => {
  return JSON.stringify({ not: 'an array' })
}

export const createMockBroadcastResponse = (
  uuid: string,
  hashId: string,
  status: ResponseStatus = ResponseStatus.SUCCESS
): [string, { hashId: string; status: ResponseStatus }] => {
  return [uuid, { hashId, status }]
}

export class MockUIServiceBroadcast {
  requestHandler (): Promise<undefined> {
    return Promise.resolve(undefined)
  }
}

export class MockUIServiceError {
  requestHandler (): Promise<never> {
    return Promise.reject(new Error('Request handler error'))
  }
}

export class MockUIServiceNonBroadcast {
  requestHandler (request: ProtocolRequest): Promise<ProtocolResponse> {
    return Promise.resolve([request[0], { status: ResponseStatus.SUCCESS }])
  }
}

export const waitForStreamFlush = async (delayMs: number): Promise<void> => {
  await new Promise(resolve => {
    setTimeout(resolve, delayMs)
  })
}
