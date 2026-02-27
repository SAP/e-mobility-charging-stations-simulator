/**
 * Utilities for creating REAL ChargingStation instances in tests
 *
 * This file provides factory functions to instantiate actual ChargingStation
 * objects (not mocks) with properly isolated dependencies for testing.
 *
 * Key patterns:
 * - MockWebSocket: Captures sent messages for assertion
 * - Singleton mocking: Overrides getInstance() before ChargingStation import
 * - Cleanup utilities: Prevents test pollution via timer/listener cleanup
 * @see tests/ChargingStationFactory.ts for mock factory (creates mock objects)
 * @see tests/charging-station/ChargingStationTestConstants.ts for test constants
 */

import type { RawData } from 'ws'

import { EventEmitter } from 'node:events'

import type { ChargingStation } from '../../src/charging-station/ChargingStation.js'
import type {
  ChargingStationConfiguration,
  ChargingStationTemplate,
  ConnectorStatus,
  EvseStatus,
} from '../../src/types/index.js'

import {
  AvailabilityType,
  ConnectorStatusEnum,
  OCPPVersion,
  RegistrationStatusEnumType,
} from '../../src/types/index.js'
import {
  TEST_CHARGING_STATION_BASE_NAME,
  TEST_CHARGING_STATION_HASH_ID,
  TEST_HEARTBEAT_INTERVAL_SECONDS,
} from './ChargingStationTestConstants.js'

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
 * Collection of all mocks used in a real ChargingStation instance
 */
export interface ChargingStationMocks {
  /** Mock file system operations */
  fileSystem: {
    readFiles: Map<string, string>
    writtenFiles: Map<string, string>
  }

  /** Mock IdTagsCache */
  idTagsCache: MockIdTagsCache

  /** Mock parentPort messages */
  parentPortMessages: unknown[]

  /** Mock SharedLRUCache */
  sharedLRUCache: MockSharedLRUCache

  /** Mock WebSocket connection */
  webSocket: MockWebSocket
}

/**
 * Options for creating a real ChargingStation instance
 */
export interface RealChargingStationOptions {
  /** Auto-start the station on creation */
  autoStart?: boolean

  /** Station base name */
  baseName?: string

  /** Initial boot notification status */
  bootNotificationStatus?: RegistrationStatusEnumType

  /** Number of connectors (default: 2) */
  connectorsCount?: number

  /** Number of EVSEs (enables EVSE mode if > 0) */
  evsesCount?: number

  /** Heartbeat interval in seconds */
  heartbeatInterval?: number

  /** Station index (default: 1) */
  index?: number

  /** OCPP version (default: '1.6') */
  ocppVersion?: OCPPVersion

  /** Whether station is started */
  started?: boolean

  /** Template file path (mocked) */
  templateFile?: string
}

/**
 * Result of creating a real ChargingStation instance
 */
export interface RealChargingStationResult {
  /** All mocks used by the station for assertion */
  mocks: ChargingStationMocks

  /** The actual ChargingStation instance */
  station: ChargingStation
}

/**
 * Mock IdTagsCache for testing
 *
 * Provides mock RFID tag management without file system access.
 */
export class MockIdTagsCache {
  private static instance: MockIdTagsCache | null = null
  private readonly idTagsMap = new Map<string, string[]>()

  public static getInstance (): MockIdTagsCache {
    MockIdTagsCache.instance ??= new MockIdTagsCache()
    return MockIdTagsCache.instance
  }

  public static resetInstance (): void {
    MockIdTagsCache.instance = null
  }

  public clear (): void {
    this.idTagsMap.clear()
  }

  public deleteIdTags (file: string): boolean {
    return this.idTagsMap.delete(file)
  }

  public getIdTag (): string {
    return 'TEST-TAG-001'
  }

  public getIdTags (file: string): string[] | undefined {
    return this.idTagsMap.get(file)
  }

  public setIdTags (file: string, idTags: string[]): void {
    this.idTagsMap.set(file, idTags)
  }
}

/**
 * Mock SharedLRUCache for testing
 *
 * Provides in-memory caching without requiring Bootstrap initialization.
 */
export class MockSharedLRUCache {
  private static instance: MockSharedLRUCache | null = null
  private readonly configurations = new Map<string, ChargingStationConfiguration>()
  private readonly templates = new Map<string, ChargingStationTemplate>()

  public static getInstance (): MockSharedLRUCache {
    MockSharedLRUCache.instance ??= new MockSharedLRUCache()
    return MockSharedLRUCache.instance
  }

  public static resetInstance (): void {
    MockSharedLRUCache.instance = null
  }

  public clear (): void {
    this.templates.clear()
    this.configurations.clear()
  }

  public deleteChargingStationConfiguration (hash: string): void {
    this.configurations.delete(hash)
  }

  public deleteChargingStationTemplate (hash: string): void {
    this.templates.delete(hash)
  }

  public getChargingStationConfiguration (hash: string): ChargingStationConfiguration | undefined {
    return this.configurations.get(hash)
  }

  public getChargingStationTemplate (hash: string): ChargingStationTemplate | undefined {
    return this.templates.get(hash)
  }

  public hasChargingStationConfiguration (hash: string): boolean {
    return this.configurations.has(hash)
  }

  public hasChargingStationTemplate (hash: string): boolean {
    return this.templates.has(hash)
  }

  public setChargingStationConfiguration (config: ChargingStationConfiguration): void {
    if (config.configurationHash != null) {
      this.configurations.set(config.configurationHash, config)
    }
  }

  public setChargingStationTemplate (template: ChargingStationTemplate): void {
    if (template.templateHash != null) {
      this.templates.set(template.templateHash, template)
    }
  }
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
   * Ping the server (no-op in mock)
   */
  public ping (): void {
    // No-op for tests
  }

  /**
   * Pong response (no-op in mock)
   */
  public pong (): void {
    // No-op for tests
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

/**
 * Cleanup a ChargingStation instance to prevent test pollution
 *
 * Stops all timers, removes event listeners, and clears state.
 * Call this in test afterEach() hooks.
 * @param station - ChargingStation instance to clean up
 * @example
 * ```typescript
 * afterEach(() => {
 *   cleanupChargingStation(station)
 * })
 * ```
 */
export function cleanupChargingStation (station: ChargingStation): void {
  // Stop heartbeat timer
  if (station.heartbeatSetInterval != null) {
    clearInterval(station.heartbeatSetInterval)
    station.heartbeatSetInterval = undefined
  }

  // Close WebSocket connection
  if (station.wsConnection != null) {
    try {
      station.closeWSConnection()
    } catch {
      // Ignore errors during cleanup
    }
  }

  // Clear all event listeners
  try {
    station.removeAllListeners()
  } catch {
    // Ignore errors during cleanup
  }

  // Clear connector transaction state
  for (const connectorStatus of station.connectors.values()) {
    if (connectorStatus.transactionSetInterval != null) {
      clearInterval(connectorStatus.transactionSetInterval)
      connectorStatus.transactionSetInterval = undefined
    }
  }

  // Clear EVSE connector transaction state
  for (const evseStatus of station.evses.values()) {
    for (const connectorStatus of evseStatus.connectors.values()) {
      if (connectorStatus.transactionSetInterval != null) {
        clearInterval(connectorStatus.transactionSetInterval)
        connectorStatus.transactionSetInterval = undefined
      }
    }
  }

  // Clear requests map
  station.requests.clear()

  // Reset mock singleton instances
  MockSharedLRUCache.resetInstance()
  MockIdTagsCache.resetInstance()
}

/**
 * Create a mock template for testing
 * @param overrides - Template properties to override
 * @returns ChargingStationTemplate for testing
 */
export function createMockTemplate (
  overrides: Partial<ChargingStationTemplate> = {}
): ChargingStationTemplate {
  return {
    baseName: TEST_CHARGING_STATION_BASE_NAME,
    chargePointModel: 'Test Model',
    chargePointVendor: 'Test Vendor',
    numberOfConnectors: 2,
    ocppVersion: OCPPVersion.VERSION_16,
    ...overrides,
  } as ChargingStationTemplate
}

/**
 * Creates a minimal ChargingStation-like object for testing
 *
 * Due to the complexity of the ChargingStation class and its deep dependencies
 * (Bootstrap singleton, file system, WebSocket, worker threads), this factory
 * creates an object that implements the essential ChargingStation interface
 * without requiring the full initialization chain.
 *
 * This is useful for testing code that depends on ChargingStation methods
 * without needing the full OCPP protocol stack.
 * @param options - Configuration options for the charging station
 * @returns Object with station instance and mocks for assertion
 * @example
 * ```typescript
 * const { station, mocks } = createRealChargingStation({ connectorsCount: 2 })
 * expect(station.connectors.size).toBe(3) // 0 + 2 connectors
 * station.wsConnection = mocks.webSocket
 * mocks.webSocket.simulateMessage('["3","uuid",{}]')
 * ```
 */
export function createRealChargingStation (
  options: RealChargingStationOptions = {}
): RealChargingStationResult {
  const {
    autoStart = false,
    baseName = TEST_CHARGING_STATION_BASE_NAME,
    bootNotificationStatus = RegistrationStatusEnumType.ACCEPTED,
    connectorsCount = 2,
    evsesCount = 0,
    heartbeatInterval = TEST_HEARTBEAT_INTERVAL_SECONDS,
    index = 1,
    ocppVersion = OCPPVersion.VERSION_16,
    started = false,
    templateFile = 'test-template.json',
  } = options

  // Initialize mocks
  const mockWebSocket = new MockWebSocket(`ws://localhost:8080/${baseName}-${String(index)}`)
  const mockSharedLRUCache = MockSharedLRUCache.getInstance()
  const mockIdTagsCache = MockIdTagsCache.getInstance()
  const parentPortMessages: unknown[] = []
  const writtenFiles = new Map<string, string>()
  const readFiles = new Map<string, string>()

  // Create connectors map
  const connectors = new Map<number, ConnectorStatus>()
  const useEvses = evsesCount > 0

  // Connector 0 always exists
  connectors.set(0, createConnectorStatus(0))

  // Add numbered connectors
  for (let i = 1; i <= connectorsCount; i++) {
    connectors.set(i, createConnectorStatus(i))
  }

  // Create EVSEs map if applicable
  const evses = new Map<number, EvseStatus>()
  if (useEvses) {
    const connectorsPerEvse = Math.ceil(connectorsCount / evsesCount)
    for (let evseId = 1; evseId <= evsesCount; evseId++) {
      const evseConnectors = new Map<number, ConnectorStatus>()
      const startId = (evseId - 1) * connectorsPerEvse + 1
      const endId = Math.min(startId + connectorsPerEvse - 1, connectorsCount)

      for (let connId = startId; connId <= endId; connId++) {
        const connectorStatus = connectors.get(connId)
        if (connectorStatus != null) {
          evseConnectors.set(connId, connectorStatus)
        }
      }

      evses.set(evseId, {
        availability: AvailabilityType.Operative,
        connectors: evseConnectors,
      })
    }
  }

  // Create requests map
  const requests = new Map<string, unknown>()

  // Create the station object that mimics ChargingStation
  const station = {
    automaticTransactionGenerator: undefined,
    bootNotificationRequest: undefined,
    bootNotificationResponse: {
      currentTime: new Date(),
      interval: heartbeatInterval,
      status: bootNotificationStatus,
    },
    closeWSConnection (): void {
      if (this.wsConnection != null) {
        this.wsConnection.close()
        this.wsConnection = null
      }
    },
    connectors,
    delete (deleteConfiguration = true): void {
      if (this.started) {
        this.stop()
      }
      this.requests.clear()
      this.connectors.clear()
      this.evses.clear()
    },
    // Event emitter methods (minimal implementation)
    emit: () => true,
    // Empty implementations for interface compatibility
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    emitChargingStationEvent: () => {},
    evses,
    getAuthorizeRemoteTxRequests (): boolean {
      return false // Default to false in mock
    },
    getConnectionTimeout (): number {
      return 30000
    },
    // Methods
    getConnectorStatus (connectorId: number): ConnectorStatus | undefined {
      if (useEvses) {
        for (const evseStatus of evses.values()) {
          if (evseStatus.connectors.has(connectorId)) {
            return evseStatus.connectors.get(connectorId)
          }
        }
        return undefined
      }
      return connectors.get(connectorId)
    },
    getEvseIdByConnectorId (connectorId: number): number | undefined {
      if (!useEvses) {
        return undefined
      }
      for (const [evseId, evseStatus] of evses) {
        if (evseStatus.connectors.has(connectorId)) {
          return evseId
        }
      }
      return undefined
    },
    getEvseStatus (evseId: number): EvseStatus | undefined {
      return evses.get(evseId)
    },
    getHeartbeatInterval (): number {
      return heartbeatInterval * 1000 // Return in ms
    },
    getLocalAuthListEnabled (): boolean {
      return false // Default to false in mock
    },
    getNumberOfConnectors (): number {
      if (useEvses) {
        let numberOfConnectors = 0
        for (const [evseId, evseStatus] of evses) {
          if (evseId > 0) {
            numberOfConnectors += evseStatus.connectors.size
          }
        }
        return numberOfConnectors
      }
      return connectors.has(0) ? connectors.size - 1 : connectors.size
    },
    getNumberOfEvses (): number {
      return evses.has(0) ? evses.size - 1 : evses.size
    },
    hasConnector (connectorId: number): boolean {
      if (useEvses) {
        for (const evseStatus of evses.values()) {
          if (evseStatus.connectors.has(connectorId)) {
            return true
          }
        }
        return false
      }
      return connectors.has(connectorId)
    },
    // Getters
    get hasEvses (): boolean {
      return useEvses
    },
    heartbeatSetInterval: undefined as NodeJS.Timeout | undefined,

    idTagsCache: mockIdTagsCache as unknown,

    inAcceptedState (): boolean {
      return this.bootNotificationResponse.status === RegistrationStatusEnumType.ACCEPTED
    },

    // Core properties
    index,

    inPendingState (): boolean {
      return this.bootNotificationResponse.status === RegistrationStatusEnumType.PENDING
    },

    inRejectedState (): boolean {
      return this.bootNotificationResponse.status === RegistrationStatusEnumType.REJECTED
    },

    inUnknownState (): boolean {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      return this.bootNotificationResponse?.status == null
    },
    isChargingStationAvailable (): boolean {
      return this.getConnectorStatus(0)?.availability === AvailabilityType.Operative
    },

    isConnectorAvailable (connectorId: number): boolean {
      return (
        connectorId > 0 &&
        this.getConnectorStatus(connectorId)?.availability === AvailabilityType.Operative
      )
    },

    isWebSocketConnectionOpened (): boolean {
      return this.wsConnection?.readyState === WebSocketReadyState.OPEN
    },

    listenerCount: () => 0,

    logPrefix (): string {
      return `${this.stationInfo.chargingStationId} |`
    },

    ocppConfiguration: {
      configurationKey: [],
    },

    on: () => station,

    once: () => station,

    performanceStatistics: undefined,

    powerDivider: 1,

    removeAllListeners: () => station,

    removeListener: () => station,

    requests,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    restartHeartbeat: () => {},
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    restartWebSocketPing: () => {},
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    saveOcppConfiguration: () => {},
    start (): void {
      this.started = true
      this.starting = false
    },
    started,
    starting: false,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    startTxUpdatedInterval: () => {},
    // Station info
    stationInfo: {
      autoStart,
      baseName,
      chargingStationId: `${baseName}-${index.toString().padStart(5, '0')}`,
      hashId: TEST_CHARGING_STATION_HASH_ID,
      maximumAmperage: 32,
      maximumPower: 22000,
      ocppVersion,
      remoteAuthorization: true,
      templateIndex: index,
      templateName: templateFile,
    },
    stop (): void {
      if (this.started && !this.stopping) {
        this.stopping = true
        // Simulate real stop behavior
        this.closeWSConnection()
        delete this.bootNotificationResponse
        this.started = false
        this.stopping = false
      }
    },
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    stopMeterValues: () => {},
    stopping: false,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    stopTxUpdatedInterval: () => {},
    templateFile,
    wsConnection: null as MockWebSocket | null,
  }

  // Set up mock WebSocket connection
  station.wsConnection = mockWebSocket

  const mocks: ChargingStationMocks = {
    fileSystem: {
      readFiles,
      writtenFiles,
    },
    idTagsCache: mockIdTagsCache,
    parentPortMessages,
    sharedLRUCache: mockSharedLRUCache,
    webSocket: mockWebSocket,
  }

  return {
    mocks,
    station: station as unknown as ChargingStation,
  }
}

/**
 * Reset a ChargingStation to its initial state
 *
 * Resets all connector statuses, clears transactions, and restores defaults.
 * Useful between test cases when reusing a station instance.
 * @param station - ChargingStation instance to reset
 * @example
 * ```typescript
 * beforeEach(() => {
 *   resetChargingStationState(station)
 * })
 * ```
 */
export function resetChargingStationState (station: ChargingStation): void {
  // Reset station state
  station.started = false
  station.starting = false

  // Reset boot notification response
  if (station.bootNotificationResponse != null) {
    station.bootNotificationResponse.status = RegistrationStatusEnumType.ACCEPTED
    station.bootNotificationResponse.currentTime = new Date()
  }

  // Reset connector statuses
  for (const [connectorId, connectorStatus] of station.connectors) {
    resetConnectorStatus(connectorStatus, connectorId === 0)
  }

  // Reset EVSE connector statuses
  for (const evseStatus of station.evses.values()) {
    evseStatus.availability = AvailabilityType.Operative
    for (const connectorStatus of evseStatus.connectors.values()) {
      resetConnectorStatus(connectorStatus, false)
    }
  }

  // Clear requests
  station.requests.clear()

  // Clear WebSocket messages if using MockWebSocket
  const ws = station.wsConnection as unknown as MockWebSocket | null
  if (ws != null && 'clearMessages' in ws) {
    ws.clearMessages()
  }
}

/**
 * Wait for a condition to be true with timeout
 * @param condition - Function that returns true when condition is met
 * @param timeout - Maximum time to wait in milliseconds
 * @param interval - Check interval in milliseconds
 */
export async function waitForCondition (
  condition: () => boolean,
  timeout = 1000,
  interval = 10
): Promise<void> {
  const startTime = Date.now()
  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error('Timeout waiting for condition')
    }
    await new Promise(resolve => setTimeout(resolve, interval))
  }
}

/**
 * Create a connector status object with default values
 * @param connectorId - Connector ID
 * @returns Default connector status
 */
function createConnectorStatus (connectorId: number): ConnectorStatus {
  return {
    availability: AvailabilityType.Operative,
    bootStatus: ConnectorStatusEnum.Available,
    chargingProfiles: [],
    energyActiveImportRegisterValue: 0,
    idTagAuthorized: false,
    idTagLocalAuthorized: false,
    MeterValues: [],
    status: ConnectorStatusEnum.Available,
    transactionEnergyActiveImportRegisterValue: 0,
    transactionId: undefined,
    transactionIdTag: undefined,
    transactionRemoteStarted: false,
    transactionStart: undefined,
    transactionStarted: false,
  } as unknown as ConnectorStatus
}

/**
 * Reset a single connector status to default values
 * @param status - Connector status object to reset
 * @param isConnectorZero - Whether this is connector 0 (station-level)
 */
function resetConnectorStatus (status: ConnectorStatus, isConnectorZero: boolean): void {
  status.availability = AvailabilityType.Operative
  status.status = isConnectorZero ? undefined : ConnectorStatusEnum.Available
  status.transactionId = undefined
  status.transactionIdTag = undefined
  status.transactionStart = undefined
  status.transactionStarted = false
  status.transactionRemoteStarted = false
  status.idTagAuthorized = false
  status.idTagLocalAuthorized = false
  status.energyActiveImportRegisterValue = 0
  status.transactionEnergyActiveImportRegisterValue = 0

  // Clear transaction interval
  if (status.transactionSetInterval != null) {
    clearInterval(status.transactionSetInterval)
    status.transactionSetInterval = undefined
  }
}
