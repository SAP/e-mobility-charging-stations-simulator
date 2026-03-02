/**
 * Station helper functions for testing
 *
 * Factory functions to create mock ChargingStation instances with isolated dependencies.
 */

import type { ChargingStation } from '../../../src/charging-station/ChargingStation.js'
import type {
  ChargingStationInfo,
  ChargingStationOcppConfiguration,
  ChargingStationTemplate,
  ConnectorStatus,
  EvseStatus,
  Reservation,
  StopTransactionReason,
} from '../../../src/types/index.js'

import {
  AvailabilityType,
  ConnectorStatusEnum,
  OCPPVersion,
  RegistrationStatusEnumType,
} from '../../../src/types/index.js'
import {
  TEST_CHARGING_STATION_BASE_NAME,
  TEST_CHARGING_STATION_HASH_ID,
  TEST_HEARTBEAT_INTERVAL_SECONDS,
} from '../ChargingStationTestConstants.js'
import { MockIdTagsCache, MockSharedLRUCache } from '../mocks/MockCaches.js'
import { MockWebSocket, WebSocketReadyState } from '../mocks/MockWebSocket.js'

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
 * Options for customizing connector status creation
 */
export interface CreateConnectorStatusOptions {
  /** Override availability (default: AvailabilityType.Operative) */
  availability?: AvailabilityType
  /** Override status (default: ConnectorStatusEnum.Available) */
  status?: ConnectorStatusEnum
}

/**
 * Mock type combining ChargingStation with optional test-specific properties.
 */
export type MockChargingStation = ChargingStation & {
  getNumberOfRunningTransactions?: () => number
  reset?: () => Promise<void>
}

/**
 * Options for creating a mock ChargingStation instance
 */
export interface MockChargingStationOptions {
  /** Auto-start the station on creation */
  autoStart?: boolean

  /** Station base name */
  baseName?: string

  /** Initial boot notification status */
  bootNotificationStatus?: RegistrationStatusEnumType

  /** Connection timeout in milliseconds */
  connectionTimeout?: number

  /** Default connector status overrides */
  connectorDefaults?: {
    availability?: AvailabilityType
    status?: ConnectorStatusEnum
  }

  /** Number of connectors (default: 2) */
  connectorsCount?: number

  /** EVSE configuration for OCPP 2.0 - enables EVSE mode when present */
  evseConfiguration?: {
    evsesCount?: number
  }

  /** Heartbeat interval in seconds */
  heartbeatInterval?: number

  /** Station index (default: 1) */
  index?: number

  /** OCPP configuration with configuration keys */
  ocppConfiguration?: ChargingStationOcppConfiguration

  /** Custom OCPP incoming request service for test mocking */
  ocppIncomingRequestService?: Partial<MockOCPPIncomingRequestService>

  /** Custom OCPP request service for test mocking */
  ocppRequestService?: Partial<MockOCPPRequestService>

  /** OCPP version (default: '1.6') */
  ocppVersion?: OCPPVersion

  /** Whether station is started */
  started?: boolean

  /** Whether station is starting */
  starting?: boolean

  /** Station info overrides */
  stationInfo?: Partial<ChargingStationInfo>

  /** Template file path (mocked) */
  templateFile?: string

  /** WebSocket ping interval in seconds */
  websocketPingInterval?: number
}

/**
 * Result of creating a mock ChargingStation instance
 */
export interface MockChargingStationResult {
  /** All mocks used by the station for assertion */
  mocks: ChargingStationMocks

  /** The actual ChargingStation instance */
  station: ChargingStation
}

/**
 * Mock OCPP incoming request service interface for testing
 * Provides typed access to mock handlers without eslint-disable comments
 */
export interface MockOCPPIncomingRequestService {
  incomingRequestHandler: () => Promise<unknown>
  stop: () => void
}

/**
 * Mock OCPP request service interface for testing
 * Provides typed access to mock handlers without eslint-disable comments
 */
export interface MockOCPPRequestService {
  requestHandler: () => Promise<unknown>
  sendError: () => Promise<unknown>
  sendResponse: () => Promise<unknown>
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

  // Stop WebSocket ping timer (private, accessed for cleanup via typed cast)
  const stationWithWsTimer = station as unknown as { wsPingSetInterval?: NodeJS.Timeout }
  if (stationWithWsTimer.wsPingSetInterval != null) {
    clearInterval(stationWithWsTimer.wsPingSetInterval)
    stationWithWsTimer.wsPingSetInterval = undefined
  }

  // Stop message buffer flush timer (private, accessed for cleanup via typed cast)
  const stationWithFlushTimer = station as unknown as {
    flushMessageBufferSetInterval?: NodeJS.Timeout
  }
  if (stationWithFlushTimer.flushMessageBufferSetInterval != null) {
    clearInterval(stationWithFlushTimer.flushMessageBufferSetInterval)
    stationWithFlushTimer.flushMessageBufferSetInterval = undefined
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

  // Clear connector transaction state and timers
  for (const connectorStatus of station.connectors.values()) {
    if (connectorStatus.transactionSetInterval != null) {
      clearInterval(connectorStatus.transactionSetInterval)
      connectorStatus.transactionSetInterval = undefined
    }
    if (connectorStatus.transactionTxUpdatedSetInterval != null) {
      clearInterval(connectorStatus.transactionTxUpdatedSetInterval)
      connectorStatus.transactionTxUpdatedSetInterval = undefined
    }
  }

  // Clear EVSE connector transaction state and timers
  for (const evseStatus of station.evses.values()) {
    for (const connectorStatus of evseStatus.connectors.values()) {
      if (connectorStatus.transactionSetInterval != null) {
        clearInterval(connectorStatus.transactionSetInterval)
        connectorStatus.transactionSetInterval = undefined
      }
      if (connectorStatus.transactionTxUpdatedSetInterval != null) {
        clearInterval(connectorStatus.transactionTxUpdatedSetInterval)
        connectorStatus.transactionTxUpdatedSetInterval = undefined
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
 * Create a connector status object with default values
 *
 * This is the canonical factory for creating ConnectorStatus objects in tests.
 * @param _connectorId - Connector ID (unused, kept for API consistency)
 * @param options - Optional overrides for default values
 * @returns ConnectorStatus with default or customized values
 * @example
 * ```typescript
 * // Default connector status
 * const status = createConnectorStatus(1)
 *
 * // Customized connector status
 * const status = createConnectorStatus(1, { availability: AvailabilityType.Inoperative })
 * ```
 */
export function createConnectorStatus (
  _connectorId: number,
  options: CreateConnectorStatusOptions = {}
): ConnectorStatus {
  return {
    availability: options.availability ?? AvailabilityType.Operative,
    bootStatus: ConnectorStatusEnum.Available,
    chargingProfiles: [],
    energyActiveImportRegisterValue: 0,
    idTagAuthorized: false,
    idTagLocalAuthorized: false,
    MeterValues: [],
    status: options.status ?? ConnectorStatusEnum.Available,
    transactionEnergyActiveImportRegisterValue: 0,
    transactionId: undefined,
    transactionIdTag: undefined,
    transactionRemoteStarted: false,
    transactionStart: undefined,
    transactionStarted: false,
  } as unknown as ConnectorStatus
}

/**
 * Creates a minimal mock ChargingStation-like object for testing
 *
 * Due to the complexity of the ChargingStation class and its deep dependencies
 * (Bootstrap singleton, file system, WebSocket, worker threads), this factory
 * creates a lightweight stub that implements the essential ChargingStation interface
 * without requiring the full initialization chain.
 *
 * This is useful for testing code that depends on ChargingStation methods
 * without needing the full OCPP protocol stack.
 * @param options - Configuration options for the mock charging station
 * @returns Object with mock station instance and mocks for assertion
 * @example
 * ```typescript
 * const { station, mocks } = createMockChargingStation({ connectorsCount: 2 })
 * expect(station.connectors.size).toBe(3) // 0 + 2 connectors
 * station.wsConnection = mocks.webSocket
 * mocks.webSocket.simulateMessage('["3","uuid",{}]')
 * ```
 */
export function createMockChargingStation (
  options: MockChargingStationOptions = {}
): MockChargingStationResult {
  const {
    autoStart = false,
    baseName = TEST_CHARGING_STATION_BASE_NAME,
    bootNotificationStatus = RegistrationStatusEnumType.ACCEPTED,
    connectionTimeout = 30000,
    connectorDefaults,
    connectorsCount = 2,
    evseConfiguration,
    heartbeatInterval = TEST_HEARTBEAT_INTERVAL_SECONDS,
    index = 1,
    ocppConfiguration,
    ocppIncomingRequestService,
    ocppRequestService,
    ocppVersion = OCPPVersion.VERSION_16,
    started = false,
    starting = false,
    stationInfo: stationInfoOverrides,
    templateFile = 'test-template.json',
    websocketPingInterval = 30,
  } = options

  // Determine EVSE usage: explicit config OR OCPP 2.0/2.0.1 auto-detection
  const useEvses = determineEvseUsage(options)
  const effectiveEvsesCount = evseConfiguration?.evsesCount ?? 0

  // Initialize mocks
  const mockWebSocket = new MockWebSocket(`ws://localhost:8080/${baseName}-${String(index)}`)
  const mockSharedLRUCache = MockSharedLRUCache.getInstance()
  const mockIdTagsCache = MockIdTagsCache.getInstance()
  const parentPortMessages: unknown[] = []
  const writtenFiles = new Map<string, string>()
  const readFiles = new Map<string, string>()

  // Helper to create connector status with options defaults
  const connectorStatusOptions: CreateConnectorStatusOptions = {
    availability: connectorDefaults?.availability,
    status: connectorDefaults?.status,
  }

  // Create connectors map
  const connectors = new Map<number, ConnectorStatus>()

  // Connector 0 always exists
  connectors.set(0, createConnectorStatus(0, connectorStatusOptions))

  // Add numbered connectors
  for (let i = 1; i <= connectorsCount; i++) {
    connectors.set(i, createConnectorStatus(i, connectorStatusOptions))
  }

  // Create EVSEs map if applicable
  const evses = new Map<number, EvseStatus>()
  if (useEvses) {
    const resolvedEvsesCount = effectiveEvsesCount > 0 ? effectiveEvsesCount : connectorsCount
    // EVSE 0 contains connector 0 (station-level status for availability checks)
    const evse0Connectors = new Map<number, ConnectorStatus>()
    const connector0Status = connectors.get(0)
    if (connector0Status != null) {
      evse0Connectors.set(0, connector0Status)
    }
    evses.set(0, {
      availability: AvailabilityType.Operative,
      connectors: evse0Connectors,
    })

    // Create EVSEs 1..N with their respective connectors
    const connectorsPerEvse = Math.ceil(connectorsCount / resolvedEvsesCount)
    for (let evseId = 1; evseId <= resolvedEvsesCount; evseId++) {
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
    // Reservation methods (mock implementations - eslint disabled for test utilities)

    addReservation (reservation: Record<string, unknown>): void {
      // Check if reservation with same ID exists and remove it
      const existingReservation = this.getReservationBy(
        'reservationId',
        (reservation as Record<string, number>).reservationId
      )
      if (existingReservation != null) {
        this.removeReservation(existingReservation, 'REPLACE_EXISTING')
      }
      const connectorStatus = this.getConnectorStatus(reservation.connectorId as number)
      if (connectorStatus != null) {
        connectorStatus.reservation = reservation as unknown as Reservation
      }
    },
    automaticTransactionGenerator: undefined,
    bootNotificationRequest: undefined,

    bootNotificationResponse: {
      currentTime: new Date(),
      interval: heartbeatInterval,
      status: bootNotificationStatus,
    } as
      | undefined
      | {
        currentTime: Date
        interval: number
        status: RegistrationStatusEnumType
      },

    bufferMessage (message: string): void {
      this.messageQueue.push(message)
    },
    closeWSConnection (): void {
      if (this.wsConnection != null) {
        this.wsConnection.close()
        this.wsConnection = null
      }
    },
    connectors,

    async delete (deleteConfiguration = true): Promise<void> {
      if (this.started) {
        await this.stop()
      }
      this.requests.clear()
      this.connectors.clear()
      this.evses.clear()
      // Note: deleteConfiguration controls file deletion in real implementation
      // Mock doesn't have file system access, so parameter is unused
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
      return connectionTimeout
    },
    getConnectorIdByTransactionId (transactionId: number | string | undefined): number | undefined {
      if (transactionId == null) {
        return undefined
      } else if (useEvses) {
        for (const evseStatus of evses.values()) {
          for (const [connectorId, connectorStatus] of evseStatus.connectors) {
            if (connectorStatus.transactionId === transactionId) {
              return connectorId
            }
          }
        }
      } else {
        for (const connectorId of connectors.keys()) {
          if (this.getConnectorStatus(connectorId)?.transactionId === transactionId) {
            return connectorId
          }
        }
      }
      return undefined
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
    getEnergyActiveImportRegisterByConnectorId (connectorId: number, rounded = false): number {
      const connectorStatus = this.getConnectorStatus(connectorId)
      if (connectorStatus == null) {
        return 0
      }
      const value = connectorStatus.transactionEnergyActiveImportRegisterValue ?? 0
      return rounded ? Math.round(value) : value
    },
    getEnergyActiveImportRegisterByTransactionId (
      transactionId: number | string | undefined,
      rounded = false
    ): number {
      const connectorId = this.getConnectorIdByTransactionId(transactionId)
      if (connectorId == null) {
        return 0
      }
      return this.getEnergyActiveImportRegisterByConnectorId(connectorId, rounded)
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
    getEvseIdByTransactionId (transactionId: number | string | undefined): number | undefined {
      if (transactionId == null) {
        return undefined
      } else if (useEvses) {
        for (const [evseId, evseStatus] of evses) {
          for (const connectorStatus of evseStatus.connectors.values()) {
            if (connectorStatus.transactionId === transactionId) {
              return evseId
            }
          }
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
    getNumberOfRunningTransactions (): number {
      let numberOfRunningTransactions = 0
      if (useEvses) {
        for (const [evseId, evseStatus] of evses) {
          if (evseId === 0) {
            continue
          }
          for (const connectorStatus of evseStatus.connectors.values()) {
            if (connectorStatus.transactionStarted === true) {
              ++numberOfRunningTransactions
            }
          }
        }
      } else {
        for (const connectorId of connectors.keys()) {
          if (
            connectorId > 0 &&
            this.getConnectorStatus(connectorId)?.transactionStarted === true
          ) {
            ++numberOfRunningTransactions
          }
        }
      }
      return numberOfRunningTransactions
    },
    getReservationBy (filterKey: string, value: unknown): Record<string, unknown> | undefined {
      if (useEvses) {
        for (const evseStatus of evses.values()) {
          for (const connectorStatus of evseStatus.connectors.values()) {
            if (connectorStatus.reservation?.[filterKey] === value) {
              return connectorStatus.reservation
            }
          }
        }
      } else {
        for (const connectorStatus of connectors.values()) {
          if (connectorStatus.reservation?.[filterKey] === value) {
            return connectorStatus.reservation
          }
        }
      }
      return undefined
    },
    getTransactionIdTag (transactionId: number): string | undefined {
      if (useEvses) {
        for (const evseStatus of evses.values()) {
          for (const connectorStatus of evseStatus.connectors.values()) {
            if (connectorStatus.transactionId === transactionId) {
              return connectorStatus.transactionIdTag
            }
          }
        }
      } else {
        for (const connectorId of connectors.keys()) {
          if (this.getConnectorStatus(connectorId)?.transactionId === transactionId) {
            return this.getConnectorStatus(connectorId)?.transactionIdTag
          }
        }
      }
      return undefined
    },
    getWebSocketPingInterval (): number {
      return websocketPingInterval
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
      return this.bootNotificationResponse?.status === RegistrationStatusEnumType.ACCEPTED
    },

    // Core properties
    index,

    inPendingState (): boolean {
      return this.bootNotificationResponse?.status === RegistrationStatusEnumType.PENDING
    },
    inRejectedState (): boolean {
      return this.bootNotificationResponse?.status === RegistrationStatusEnumType.REJECTED
    },

    inUnknownState (): boolean {
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

    isConnectorReservable (reservationId: number, idTag?: string, connectorId?: number): boolean {
      if (connectorId === 0) {
        return false
      }
      const reservation = this.getReservationBy('reservationId', reservationId)
      return reservation == null
    },

    isWebSocketConnectionOpened (): boolean {
      return this.wsConnection?.readyState === WebSocketReadyState.OPEN
    },

    listenerCount: () => 0,

    logPrefix (): string {
      return `${this.stationInfo.chargingStationId} |`
    },

    messageQueue: [] as string[],

    ocppConfiguration: ocppConfiguration ?? {
      configurationKey: [],
    },

    ocppIncomingRequestService: {
      incomingRequestHandler: async () => {
        return await Promise.reject(
          new Error(
            'ocppIncomingRequestService.incomingRequestHandler not mocked. Define in createMockChargingStation options.'
          )
        )
      },
      stop: (): void => {
        throw new Error(
          'ocppIncomingRequestService.stop not mocked. Define in createMockChargingStation options.'
        )
      },
      ...ocppIncomingRequestService,
    },

    ocppRequestService: {
      requestHandler: async () => {
        return await Promise.reject(
          new Error(
            'ocppRequestService.requestHandler not mocked. Define in createMockChargingStation options.'
          )
        )
      },
      sendError: async () => {
        return await Promise.reject(
          new Error(
            'ocppRequestService.sendError not mocked. Define in createMockChargingStation options.'
          )
        )
      },
      sendResponse: async () => {
        return await Promise.reject(
          new Error(
            'ocppRequestService.sendResponse not mocked. Define in createMockChargingStation options.'
          )
        )
      },
      ...ocppRequestService,
    },

    on: () => station,

    once: () => station,

    performanceStatistics: undefined,

    powerDivider: 1,

    removeAllListeners: () => station,

    removeListener: () => station,

    removeReservation (reservation: Record<string, unknown>, _reason?: string): void {
      const connectorStatus = this.getConnectorStatus(reservation.connectorId as number)
      if (connectorStatus != null) {
        delete connectorStatus.reservation
      }
    },
    requests,

    restartHeartbeat (): void {
      this.stopHeartbeat()
      this.startHeartbeat()
    },

    restartMeterValues (connectorId: number, interval: number): void {
      this.stopMeterValues(connectorId)
      this.startMeterValues(connectorId, interval)
    },

    restartWebSocketPing (): void {
      /* empty */
    },

    saveOcppConfiguration (): void {
      /* empty */
    },
    start (): void {
      this.started = true
      this.starting = false
    },
    started,

    startHeartbeat (): void {
      this.heartbeatSetInterval ??= setInterval(() => {
        /* empty */
      }, 30000)
    },
    starting,

    startMeterValues (connectorId: number, interval: number): void {
      const connector = this.getConnectorStatus(connectorId)
      if (connector != null) {
        connector.transactionSetInterval = setInterval(() => {
          /* empty */
        }, interval)
      }
    },

    startTxUpdatedInterval (connectorId: number, interval: number): void {
      if (
        this.stationInfo.ocppVersion === OCPPVersion.VERSION_20 ||
        this.stationInfo.ocppVersion === OCPPVersion.VERSION_201
      ) {
        const connector = this.getConnectorStatus(connectorId)
        if (connector != null) {
          connector.transactionTxUpdatedSetInterval = setInterval(() => {
            /* empty */
          }, interval)
        }
      }
    },

    startWebSocketPing (): void {
      /* empty */
    },
    stationInfo: {
      autoStart,
      baseName,
      chargingStationId: `${baseName}-${index.toString().padStart(5, '0')}`,
      hashId: TEST_CHARGING_STATION_HASH_ID,
      maximumAmperage: 32,
      maximumPower: 22000,
      ocppVersion: stationInfoOverrides?.ocppVersion ?? ocppVersion,
      remoteAuthorization: true,
      templateIndex: index,
      templateName: templateFile,
      ...stationInfoOverrides,
    },

    async stop (reason?: StopTransactionReason, stopTransactions?: boolean): Promise<void> {
      if (this.started && !this.stopping) {
        this.stopping = true
        // Simulate async stop behavior (immediate resolution for tests)
        await Promise.resolve()
        this.closeWSConnection()
        this.bootNotificationResponse = undefined
        this.started = false
        this.stopping = false
      }
    },

    stopHeartbeat (): void {
      if (this.heartbeatSetInterval != null) {
        clearInterval(this.heartbeatSetInterval)
        delete this.heartbeatSetInterval
      }
    },
    stopMeterValues (connectorId: number): void {
      const connector = this.getConnectorStatus(connectorId)
      if (connector?.transactionSetInterval != null) {
        clearInterval(connector.transactionSetInterval)
        delete connector.transactionSetInterval
      }
    },
    stopping: false,

    stopTxUpdatedInterval (connectorId: number): void {
      const connector = this.getConnectorStatus(connectorId)
      if (connector?.transactionTxUpdatedSetInterval != null) {
        clearInterval(connector.transactionTxUpdatedSetInterval)
        delete connector.transactionTxUpdatedSetInterval
      }
    },
    templateFile,
    wsConnection: null as MockWebSocket | null,
    wsConnectionRetryCount: 0,
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

  const typedStation: ChargingStation = station as unknown as ChargingStation

  return {
    mocks,
    station: typedStation,
  }
}

/**
 * Create a mock charging station template for testing
 * @param baseName - Base name for the template
 * @returns ChargingStationTemplate with minimal required properties for testing
 */
export function createMockChargingStationTemplate (
  baseName: string = TEST_CHARGING_STATION_BASE_NAME
): ChargingStationTemplate {
  return {
    baseName,
  } as ChargingStationTemplate
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
 * Determines whether EVSEs should be used based on configuration
 * @param options - Configuration options to check
 * @returns True if EVSEs should be used, false otherwise
 */
function determineEvseUsage (options: MockChargingStationOptions): boolean {
  // If explicitly set to 0, don't use EVSEs
  if (options.evseConfiguration?.evsesCount === 0) {
    return false
  }
  // Get the ocppVersion from stationInfo overrides or options
  const effectiveOcppVersion = options.stationInfo?.ocppVersion ?? options.ocppVersion
  return (
    options.evseConfiguration?.evsesCount != null ||
    effectiveOcppVersion === OCPPVersion.VERSION_20 ||
    effectiveOcppVersion === OCPPVersion.VERSION_201
  )
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
