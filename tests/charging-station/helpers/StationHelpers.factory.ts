/**
 * @file Factory to construct a mock ChargingStation instance for tests.
 */

import type { ChargingStation, CoherentSession } from '../../../src/charging-station/index.js'
import type {
  ConnectorEntry,
  ConnectorStatus,
  EvseEntry,
  EvseStatus,
  Reservation,
  ReservationKey,
  StopTransactionReason,
} from '../../../src/types/index.js'
import type {
  ChargingStationMocks,
  CreateConnectorStatusOptions,
  MockChargingStationOptions,
  MockChargingStationResult,
} from './StationHelpers.types.js'

import { getConfigurationKey } from '../../../src/charging-station/index.js'
import {
  AvailabilityType,
  CurrentType,
  OCPPVersion,
  RegistrationStatusEnumType,
  StandardParametersKey,
} from '../../../src/types/index.js'
import { convertToBoolean } from '../../../src/utils/index.js'
import {
  TEST_CHARGING_STATION_BASE_NAME,
  TEST_CHARGING_STATION_HASH_ID,
  TEST_HEARTBEAT_INTERVAL_SECONDS,
} from '../ChargingStationTestConstants.js'
import { MockIdTagsCache, MockSharedLRUCache } from '../mocks/MockCaches.js'
import { MockWebSocket, WebSocketReadyState } from '../mocks/MockWebSocket.js'
import { createConnectorStatus, determineEvseUsage } from './StationHelpers.connector.js'

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
 * station.getNumberOfConnectors() // 2 (excludes connector 0)
 * station.wsConnection = mocks.webSocket
 * mocks.webSocket.simulateMessage('["3","uuid",{}]')
 * ```
 */
export function createMockChargingStation(
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

    __injectCoherentSession(transactionId: number | string, session: CoherentSession): void {
      this.coherentSessions.set(transactionId, session)
    },
    addReservation(reservation: Record<string, unknown>): void {
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
    bufferMessage(message: string): void {
      this.messageQueue.push(message)
    },
    closeWSConnection(): void {
      if (this.wsConnection != null) {
        this.wsConnection.close()
        this.wsConnection = null
      }
    },
    // Coherent MeterValues session store (real class uses a private Map).
    coherentSessions: new Map<number | string, CoherentSession>(),

    connectors,
    createCoherentSession(
      _transactionId: number | string,
      _connectorId: number
    ): CoherentSession | undefined {
      // Mock: never auto-create; tests inject sessions directly when needed.
      return undefined
    },
    async delete(deleteConfiguration = true): Promise<void> {
      if (this.started) {
        await this.stop()
      }
      this.requests.clear()
      this.connectors.clear()
      this.evses.clear()
      // Note: deleteConfiguration controls file deletion in real implementation
      // Mock doesn't have file system access, so parameter is unused
    },

    destroyCoherentSession(transactionId: number | string | undefined): boolean {
      if (transactionId == null) {
        return false
      }
      return this.coherentSessions.delete(transactionId)
    },
    // Event emitter methods (minimal implementation)
    emit: () => true,
    // Empty implementations for interface compatibility
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    emitChargingStationEvent: () => {},
    evses,
    getAuthorizeRemoteTxRequests(): boolean {
      return false // Default to false in mock
    },
    getCoherentSession(transactionId: number | string): CoherentSession | undefined {
      return this.coherentSessions.get(transactionId)
    },
    getConnectionTimeout(): number {
      return connectionTimeout
    },
    getConnectorIdByEvseId(evseId: number): number | undefined {
      return this.iterateConnectors().find(({ evseId: id }) => id === evseId)?.connectorId
    },
    getConnectorIdByTransactionId(transactionId: number | string | undefined): number | undefined {
      if (transactionId == null) {
        return undefined
      }
      return this.iterateConnectors().find(
        ({ connectorStatus }) => connectorStatus.transactionId === transactionId
      )?.connectorId
    },
    getConnectorMaximumAvailablePower(_connectorId: number): number {
      return stationInfoOverrides?.maximumPower ?? 22000
    },
    getConnectorStatus(connectorId: number): ConnectorStatus | undefined {
      return this.iterateConnectors().find(({ connectorId: id }) => id === connectorId)
        ?.connectorStatus
    },
    getEnergyActiveImportRegisterByConnectorId(connectorId: number, rounded = false): number {
      const connectorStatus = this.getConnectorStatus(connectorId)
      if (connectorStatus == null) {
        return 0
      }
      const value = connectorStatus.transactionEnergyActiveImportRegisterValue ?? 0
      return rounded ? Math.round(value) : value
    },
    getEnergyActiveImportRegisterByTransactionId(
      transactionId: number | string | undefined,
      rounded = false
    ): number {
      const connectorId = this.getConnectorIdByTransactionId(transactionId)
      if (connectorId == null) {
        return 0
      }
      return this.getEnergyActiveImportRegisterByConnectorId(connectorId, rounded)
    },
    getEvseIdByConnectorId(connectorId: number): number | undefined {
      return this.iterateConnectors().find(({ connectorId: id }) => id === connectorId)?.evseId
    },
    getEvseIdByTransactionId(transactionId: number | string | undefined): number | undefined {
      if (transactionId == null) {
        return undefined
      }
      return this.iterateConnectors().find(
        ({ connectorStatus }) => connectorStatus.transactionId === transactionId
      )?.evseId
    },
    getEvseStatus(evseId: number): EvseStatus | undefined {
      return evses.get(evseId)
    },
    getHeartbeatInterval(): number {
      return heartbeatInterval * 1000 // Return in ms
    },
    getLocalAuthListEnabled(): boolean {
      const key = getConfigurationKey(
        this as unknown as ChargingStation,
        StandardParametersKey.LocalAuthListEnabled
      )
      return key?.value != null ? convertToBoolean(key.value) : false
    },
    getNumberOfConnectors(): number {
      return this.iterateConnectors(true).reduce(count => count + 1, 0)
    },
    getNumberOfEvses(): number {
      return evses.has(0) ? evses.size - 1 : evses.size
    },
    getNumberOfPhases(): number {
      return stationInfoOverrides?.numberOfPhases ?? 3
    },
    getNumberOfRunningTransactions(): number {
      return this.iterateConnectors(true).reduce(
        (count, { connectorStatus }) =>
          connectorStatus.transactionStarted === true ? count + 1 : count,
        0
      )
    },
    getReservationBy(filterKey: ReservationKey, value: number | string): Reservation | undefined {
      return this.iterateConnectors().find(
        ({ connectorStatus }) => connectorStatus.reservation?.[filterKey] === value
      )?.connectorStatus.reservation
    },
    getTransactionIdTag(transactionId: number): string | undefined {
      return this.iterateConnectors().find(
        ({ connectorStatus }) => connectorStatus.transactionId === transactionId
      )?.connectorStatus.transactionIdTag
    },
    getVoltageOut(): number {
      return stationInfoOverrides?.voltageOut ?? 230
    },
    getWebSocketPingInterval(): number {
      return websocketPingInterval
    },

    hasConnector(connectorId: number): boolean {
      return this.iterateConnectors().some(({ connectorId: id }) => id === connectorId)
    },

    hasEvse(evseId: number): boolean {
      return evses.has(evseId)
    },

    // Getters
    get hasEvses(): boolean {
      return useEvses
    },

    heartbeatSetInterval: undefined as NodeJS.Timeout | undefined,

    idTagsCache: mockIdTagsCache as unknown,

    inAcceptedState(): boolean {
      return this.bootNotificationResponse?.status === RegistrationStatusEnumType.ACCEPTED
    },

    // Core properties
    index,
    inPendingState(): boolean {
      return this.bootNotificationResponse?.status === RegistrationStatusEnumType.PENDING
    },

    inRejectedState(): boolean {
      return this.bootNotificationResponse?.status === RegistrationStatusEnumType.REJECTED
    },

    inUnknownState(): boolean {
      return this.bootNotificationResponse?.status == null
    },

    isChargingStationAvailable(): boolean {
      return this.getConnectorStatus(0)?.availability === AvailabilityType.Operative
    },

    isConnectorAvailable(connectorId: number): boolean {
      return (
        connectorId > 0 &&
        this.getConnectorStatus(connectorId)?.availability === AvailabilityType.Operative
      )
    },

    isConnectorReservable(reservationId: number, idTag?: string, connectorId?: number): boolean {
      if (connectorId === 0) {
        return false
      }
      const reservation = this.getReservationBy('reservationId', reservationId)
      return reservation == null
    },

    isWebSocketConnectionOpened(): boolean {
      return this.wsConnection?.readyState === WebSocketReadyState.OPEN
    },

    *iterateConnectors(skipZero = false): Generator<ConnectorEntry> {
      if (useEvses) {
        for (const [evseId, evseStatus] of evses) {
          if (skipZero && evseId === 0) continue
          for (const [connectorId, connectorStatus] of evseStatus.connectors) {
            if (skipZero && connectorId === 0) continue
            yield { connectorId, connectorStatus, evseId }
          }
        }
      } else {
        for (const [connectorId, connectorStatus] of connectors) {
          if (skipZero && connectorId === 0) continue
          yield { connectorId, connectorStatus, evseId: undefined }
        }
      }
    },

    *iterateEvses(skipZero = false): Generator<EvseEntry> {
      for (const [evseId, evseStatus] of evses) {
        if (skipZero && evseId === 0) continue
        yield { evseId, evseStatus }
      }
    },

    listenerCount: () => 0,

    lockConnector(connectorId: number): void {
      if (connectorId === 0) {
        return
      }
      if (!this.hasConnector(connectorId)) {
        return
      }
      const connectorStatus = this.getConnectorStatus(connectorId)
      if (connectorStatus == null) {
        return
      }
      connectorStatus.locked = true
    },

    logPrefix(): string {
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

    removeReservation(reservation: Record<string, unknown>, _reason?: string): void {
      const connectorStatus = this.getConnectorStatus(reservation.connectorId as number)
      if (connectorStatus != null) {
        delete connectorStatus.reservation
      }
    },
    requests,

    restartHeartbeat(): void {
      this.stopHeartbeat()
      this.startHeartbeat()
    },

    restartWebSocketPing(): void {
      /* empty */
    },

    saveOcppConfiguration(): void {
      /* empty */
    },
    start(): void {
      this.started = true
      this.starting = false
    },
    started,

    startHeartbeat(): void {
      this.heartbeatSetInterval ??= setInterval(() => {
        /* empty */
      }, 30000)
    },
    starting,

    startWebSocketPing(): void {
      /* empty */
    },
    stationInfo: {
      autoStart,
      baseName,
      chargingStationId: `${baseName}-${index.toString().padStart(5, '0')}`,
      currentOutType: CurrentType.AC,
      hashId: TEST_CHARGING_STATION_HASH_ID,
      maximumAmperage: 32,
      maximumPower: 22000,
      numberOfPhases: 3,
      ocppVersion: stationInfoOverrides?.ocppVersion ?? ocppVersion,
      remoteAuthorization: true,
      templateIndex: index,
      templateName: templateFile,
      voltageOut: 230,
      ...stationInfoOverrides,
    },

    async stop(reason?: StopTransactionReason, stopTransactions?: boolean): Promise<void> {
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

    stopHeartbeat(): void {
      if (this.heartbeatSetInterval != null) {
        clearInterval(this.heartbeatSetInterval)
        delete this.heartbeatSetInterval
      }
    },
    stopping: false,

    templateFile,

    unlockConnector(connectorId: number): void {
      if (connectorId === 0) {
        return
      }
      if (!this.hasConnector(connectorId)) {
        return
      }
      const connectorStatus = this.getConnectorStatus(connectorId)
      if (connectorStatus == null) {
        return
      }
      connectorStatus.locked = false
    },

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
