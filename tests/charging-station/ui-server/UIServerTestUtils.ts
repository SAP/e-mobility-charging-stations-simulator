/**
 * @file UIServerTestUtils
 * @description Test utilities for UI server testing
 */
import type { IncomingMessage } from 'node:http'

import { EventEmitter } from 'node:events'

import type { IBootstrap } from '../../../src/charging-station/IBootstrap.js'
import type {
  ChargingStationData,
  ProcedureName,
  ProtocolRequest,
  ProtocolResponse,
  ProtocolVersion,
  RequestPayload,
  UIServerConfiguration,
  UUIDv4,
} from '../../../src/types/index.js'

import { HttpMethod } from '../../../src/charging-station/ui-server/UIServerUtils.js'
import { UIWebSocketServer } from '../../../src/charging-station/ui-server/UIWebSocketServer.js'
import {
  ApplicationProtocol,
  ApplicationProtocolVersion,
  AuthenticationType,
  type OCPPVersion,
  ResponseStatus,
} from '../../../src/types/index.js'
import { MockWebSocket } from '../mocks/MockWebSocket.js'

/**
 * Create a mock IBootstrap for testing.
 * @returns Mock IBootstrap instance with no-op methods
 */
export const createMockBootstrap = (): IBootstrap => ({
  addChargingStation: () => Promise.resolve(undefined),
  getLastContiguousIndex: () => 0,
  getPerformanceStatistics: () => undefined,
  getState: () => ({ started: false, templateStatistics: new Map(), version: '0.0.0' }) as never,
  start: () => Promise.resolve(),
  stop: () => Promise.resolve(),
})

/**
 * Testable UIWebSocketServer that exposes protected members for testing.
 */
export class TestableUIWebSocketServer extends UIWebSocketServer {
  public constructor (config: UIServerConfiguration, bootstrap: IBootstrap = createMockBootstrap()) {
    super(config, bootstrap)
  }

  /**
   * Add a response handler for testing.
   * @param uuid - Unique identifier for the response handler
   * @param ws - WebSocket instance to associate with the handler
   */
  public addResponseHandler (uuid: UUIDv4, ws: MockWebSocket): void {
    this.responseHandlers.set(uuid, ws as never)
  }

  /**
   * Get the size of response handlers map.
   * @returns Number of response handlers currently registered
   */
  public getResponseHandlersSize (): number {
    return this.responseHandlers.size
  }

  /**
   * Get UI service by version.
   * @param version - Protocol version to look up
   * @returns UI service instance for the specified version
   */
  public getUIService (version: ProtocolVersion) {
    return this.uiServices.get(version)
  }

  /**
   * Register a mock UI service for testing.
   * @param version - Protocol version string to register
   * @param service - Mock service instance to register
   */
  public registerMockUIService (version: string, service: unknown): void {
    this.uiServices.set(version as never, service as never)
  }

  /**
   * Test helper to register protocol version UI service.
   * @param version - Protocol version to register
   */
  public testRegisterProtocolVersionUIService (version: ProtocolVersion): void {
    this.registerProtocolVersionUIService(version)
  }
}

/**
 * Create a MockWebSocket configured for UI protocol testing.
 * @param protocol - UI protocol version (default: 'ui0.0.1')
 * @returns MockWebSocket instance configured for UI testing
 */
export function createMockUIWebSocket (protocol = 'ui0.0.1'): MockWebSocket {
  const ws = new MockWebSocket('ws://localhost:8080/ui')
  ws.protocol = protocol
  return ws
}

/**
 * Create a mock UI server configuration with default values.
 * @param overrides - Partial configuration to merge with defaults
 * @returns Complete UIServerConfiguration for testing
 */
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

/**
 * Create a mock UI server configuration with basic authentication enabled.
 * @param overrides - Partial configuration to merge with auth defaults
 * @returns UIServerConfiguration with BASIC_AUTH enabled
 */
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
 * Create a mock HTTP IncomingMessage for testing.
 * @param overrides - Partial message properties to merge with defaults
 * @returns IncomingMessage configured for testing
 */
export const createMockIncomingMessage = (
  overrides?: Partial<IncomingMessage>
): IncomingMessage => {
  return {
    headers: {},
    method: HttpMethod.POST,
    url: '/ui',
    ...overrides,
  } as IncomingMessage
}

/**
 * Create mock charging station data for UI server tests.
 * @param hashId - Unique identifier for the charging station
 * @param overrides - Partial data properties to merge with defaults
 * @returns ChargingStationData configured for testing
 */
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

/**
 * Create a protocol request tuple for UI server testing.
 * @param uuid - Request identifier
 * @param procedureName - OCPP procedure name
 * @param payload - Request payload (defaults to empty object)
 * @returns Protocol request tuple [uuid, procedureName, payload]
 */
export const createProtocolRequest = (
  uuid: UUIDv4,
  procedureName: ProcedureName,
  payload: RequestPayload = {}
): ProtocolRequest => {
  return [uuid, procedureName, payload]
}

/**
 * Mock UI service behavior mode for testing different request handler scenarios.
 */
export enum MockUIServiceMode {
  /** Returns undefined (broadcast behavior - handler preserved until explicit deletion) */
  BROADCAST = 'broadcast',
  /** Throws an error (error behavior - handler preserved) */
  ERROR = 'error',
  /** Returns a response (non-broadcast behavior - handler deleted immediately) */
  NON_BROADCAST = 'non-broadcast',
}

/**
 * Mock UI service interface for testing UIWebSocketServer request handling.
 */
export interface MockUIService {
  requestHandler: (request?: ProtocolRequest) => Promise<ProtocolResponse | undefined>
}

/**
 * Create a mock UI service for testing UIWebSocketServer.
 *
 * Configurable mock that simulates different AbstractUIService behaviors:
 * broadcast responses, error responses, or direct (non-broadcast) responses.
 * @param mode - Service behavior mode (defaults to BROADCAST)
 * @returns Mock UI service with behavior based on mode
 * @example
 * ```typescript
 * // Broadcast mode - returns undefined, handler preserved
 * const broadcastService = createMockUIService(MockUIServiceMode.BROADCAST)
 *
 * // Error mode - throws error, handler preserved
 * const errorService = createMockUIService(MockUIServiceMode.ERROR)
 *
 * // Non-broadcast mode - returns response, handler deleted
 * const nonBroadcastService = createMockUIService(MockUIServiceMode.NON_BROADCAST)
 * ```
 */
export const createMockUIService = (
  mode: MockUIServiceMode = MockUIServiceMode.BROADCAST
): MockUIService => ({
  requestHandler: (request?: ProtocolRequest): Promise<ProtocolResponse | undefined> => {
    switch (mode) {
      case MockUIServiceMode.BROADCAST:
        return Promise.resolve(undefined)
      case MockUIServiceMode.ERROR:
        return Promise.reject(new Error('Request handler error'))
      case MockUIServiceMode.NON_BROADCAST:
        if (request == null) {
          return Promise.reject(new Error('Request required for non-broadcast mode'))
        }
        return Promise.resolve([request[0], { status: ResponseStatus.SUCCESS }])
    }
  },
})

/**
 * Wait for stream operations to flush.
 * @param delayMs - Delay in milliseconds to wait
 * @returns Promise that resolves after the delay
 */
export const waitForStreamFlush = async (delayMs: number): Promise<void> => {
  await new Promise(resolve => {
    setTimeout(resolve, delayMs)
  })
}

/**
 * Create mock charging station data with a specific OCPP version.
 * @param hashId - Unique identifier for the charging station
 * @param ocppVersion - OCPP protocol version
 * @returns ChargingStationData with the specified OCPP version
 */
export const createMockChargingStationDataWithVersion = (
  hashId: string,
  ocppVersion: OCPPVersion
): ChargingStationData =>
  createMockChargingStationData(hashId, {
    stationInfo: {
      baseName: 'test',
      chargePointModel: 'TestModel',
      chargePointVendor: 'TestVendor',
      chargingStationId: hashId,
      hashId,
      ocppVersion,
      templateIndex: 0,
      templateName: 'test-template',
    },
  })
