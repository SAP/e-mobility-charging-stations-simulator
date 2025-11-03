import { millisecondsToSeconds } from 'date-fns'

import type { ChargingStation } from '../src/charging-station/index.js'

import { IdTagsCache } from '../src/charging-station/IdTagsCache.js'
import {
  AvailabilityType,
  type BootNotificationResponse,
  type ChargingProfile,
  type ChargingStationConfiguration,
  type ChargingStationInfo,
  type ChargingStationTemplate,
  ConnectorStatusEnum,
  OCPP20OptionalVariableName,
  OCPPVersion,
  RegistrationStatusEnumType,
  type SampledValueTemplate,
} from '../src/types/index.js'
import { clone, Constants } from '../src/utils/index.js'

/**
 * Options to customize the construction of a ChargingStation test instance
 * @example createChargingStation({ connectorsCount: 2, ocppRequestService: mockService })
 */
export interface ChargingStationOptions {
  baseName?: string
  connectionTimeout?: number
  connectorDefaults?: {
    availability?: AvailabilityType
    status?: ConnectorStatusEnum
  }
  /** Number of connectors to create (default: 3 if EVSEs enabled, 0 otherwise) */
  connectorsCount?: number
  /** EVSE configuration for OCPP 2.0 - enables EVSE mode when present */
  evseConfiguration?: {
    evsesCount?: number
  }

  heartbeatInterval?: number
  ocppConfiguration?: ChargingStationConfiguration
  /** Custom OCPP incoming request service for test mocking */
  ocppIncomingRequestService?: unknown
  /** Custom OCPP request service for test mocking */
  ocppRequestService?: unknown
  started?: boolean
  starting?: boolean
  stationInfo?: Partial<ChargingStationInfo>
  websocketPingInterval?: number
}

const CHARGING_STATION_BASE_NAME = 'CS-TEST'

/**
 * Creates a ChargingStation instance for tests
 * @param options - Configuration options for the charging station
 * @returns ChargingStation instance configured for testing
 */
export function createChargingStation (options: ChargingStationOptions = {}): ChargingStation {
  const baseName = options.baseName ?? CHARGING_STATION_BASE_NAME
  const templateIndex = 1
  const connectionTimeout = options.connectionTimeout ?? Constants.DEFAULT_CONNECTION_TIMEOUT
  const heartbeatInterval = options.heartbeatInterval ?? Constants.DEFAULT_HEARTBEAT_INTERVAL
  const websocketPingInterval =
    options.websocketPingInterval ?? Constants.DEFAULT_WEBSOCKET_PING_INTERVAL
  const useEvses = determineEvseUsage(options)
  const connectorsCount = options.connectorsCount ?? (useEvses ? 3 : 0)
  const { connectors, evses } = createConnectorsConfiguration(options, connectorsCount, useEvses)

  const chargingStation = {
    bootNotificationResponse: {
      currentTime: new Date(),
      interval: heartbeatInterval,
      status: RegistrationStatusEnumType.ACCEPTED,
    } as BootNotificationResponse,
    connectors,
    emitChargingStationEvent: () => {
      /* no-op for tests */
    },
    evses,
    getConnectionTimeout: () => connectionTimeout,
    getConnectorStatus: (connectorId: number) => {
      if (chargingStation.hasEvses) {
        for (const evseStatus of chargingStation.evses.values()) {
          if (evseStatus.connectors.has(connectorId)) {
            return evseStatus.connectors.get(connectorId)
          }
        }
        return undefined
      }
      return chargingStation.connectors.get(connectorId)
    },
    getHeartbeatInterval: () => heartbeatInterval,
    getWebSocketPingInterval: () => websocketPingInterval,
    hasEvses: useEvses,
    idTagsCache: IdTagsCache.getInstance(),
    inAcceptedState: (): boolean => {
      return (
        chargingStation.bootNotificationResponse?.status === RegistrationStatusEnumType.ACCEPTED
      )
    },
    logPrefix: (): string => {
      const stationId =
        chargingStation.stationInfo?.chargingStationId ??
        `${baseName}-0000${templateIndex.toString()}`
      return `${stationId} |`
    },
    ocppConfiguration: {
      configurationKey: [
        {
          key: OCPP20OptionalVariableName.WebSocketPingInterval,
          value: websocketPingInterval.toString(),
        },
        {
          key: OCPP20OptionalVariableName.HeartbeatInterval,
          value: millisecondsToSeconds(heartbeatInterval).toString(),
        },
      ],
      ...options.ocppConfiguration,
    },
    ocppIncomingRequestService: options.ocppIncomingRequestService ?? {
      incomingRequestHandler: async () => {
        return await Promise.reject(
          new Error(
            'ocppIncomingRequestService.incomingRequestHandler not mocked. Define in createChargingStation options.'
          )
        )
      },
      stop: () => {
        throw new Error(
          'ocppIncomingRequestService.stop not mocked. Define in createChargingStation options.'
        )
      },
    },
    ocppRequestService: options.ocppRequestService ?? {
      requestHandler: async () => {
        return await Promise.reject(
          new Error(
            'ocppRequestService.requestHandler not mocked. Define in createChargingStation options.'
          )
        )
      },
      sendError: async () => {
        return await Promise.reject(
          new Error(
            'ocppRequestService.sendError not mocked. Define in createChargingStation options.'
          )
        )
      },
      sendResponse: async () => {
        return await Promise.reject(
          new Error(
            'ocppRequestService.sendResponse not mocked. Define in createChargingStation options.'
          )
        )
      },
    },
    restartHeartbeat: () => {
      /* no-op for tests */
    },
    restartWebSocketPing: () => {
      /* no-op for tests */
    },
    saveOcppConfiguration: () => {
      /* no-op for tests */
    },
    started: options.started ?? false,
    starting: options.starting ?? false,
    stationInfo: {
      baseName,
      chargingStationId: `${baseName}-00001`,
      hashId: 'test-hash-id',
      maximumAmperage: 16,
      maximumPower: 12000,
      ocppVersion: OCPPVersion.VERSION_16,
      templateIndex,
      templateName: 'test-template.json',
      ...options.stationInfo,
    } as ChargingStationInfo,
  } as unknown as ChargingStation

  return chargingStation
}

/**
 * Creates a ChargingStation template for tests
 * @param baseName - Base name for the charging station
 * @returns ChargingStation template for testing
 */
export function createChargingStationTemplate (
  baseName = CHARGING_STATION_BASE_NAME
): ChargingStationTemplate {
  return {
    baseName,
  } as ChargingStationTemplate
}

/**
 * Creates connector and EVSE configuration
 * @param options - Configuration options
 * @param connectorsCount - Number of connectors to create
 * @param useEvses - Whether to use EVSE mode
 * @returns Object containing connectors and evses maps
 */
function createConnectorsConfiguration (
  options: ChargingStationOptions,
  connectorsCount: number,
  useEvses: boolean
) {
  const connectors = new Map()
  const evses = new Map()

  if (connectorsCount === 0) {
    return { connectors, evses }
  }

  const createConnectorStatus = (connectorId: number) => {
    const baseStatus = {
      availability: options.connectorDefaults?.availability ?? AvailabilityType.Operative,
      chargingProfiles: [] as ChargingProfile[],
      energyActiveImportRegisterValue: 0,
      idTagAuthorized: false,
      idTagLocalAuthorized: false,
      MeterValues: [] as SampledValueTemplate[],
      status: options.connectorDefaults?.status ?? ConnectorStatusEnum.Available,
      transactionEnergyActiveImportRegisterValue: 0,
      transactionId: undefined,
      transactionIdTag: undefined,
      transactionRemoteStarted: false,
      transactionStart: undefined,
      transactionStarted: false,
    }

    return clone(baseStatus)
  }

  if (useEvses) {
    const evsesCount = options.evseConfiguration?.evsesCount ?? connectorsCount
    const connectorsCountPerEvse = Math.ceil(connectorsCount / evsesCount)

    const connector0 = createConnectorStatus(0)
    connectors.set(0, connector0)

    for (let evseId = 1; evseId <= evsesCount; evseId++) {
      const evseConnectors = new Map()
      const startConnectorId = (evseId - 1) * connectorsCountPerEvse + 1
      const endConnectorId = Math.min(
        startConnectorId + connectorsCountPerEvse - 1,
        connectorsCount
      )

      for (let connectorId = startConnectorId; connectorId <= endConnectorId; connectorId++) {
        const connectorStatus = createConnectorStatus(connectorId)
        connectors.set(connectorId, connectorStatus)
        evseConnectors.set(connectorId, clone(connectorStatus))
      }

      evses.set(evseId, {
        availability: AvailabilityType.Operative,
        connectors: evseConnectors,
      })
    }
  } else {
    for (let connectorId = 0; connectorId <= connectorsCount; connectorId++) {
      connectors.set(connectorId, createConnectorStatus(connectorId))
    }
  }

  return { connectors, evses }
}

/**
 * Determines whether EVSEs should be used based on configuration
 * @param options - Configuration options to check
 * @returns True if EVSEs should be used, false otherwise
 */
function determineEvseUsage (options: ChargingStationOptions): boolean {
  return options.evseConfiguration?.evsesCount != null ||
    options.stationInfo?.ocppVersion === OCPPVersion.VERSION_20 ||
    options.stationInfo?.ocppVersion === OCPPVersion.VERSION_201
}
