/**
 * @file Shared types for StationHelpers modular files (mocks, options, result).
 */

import type { ChargingStation } from '../../../src/charging-station/index.js'
import type {
  ChargingStationInfo,
  ChargingStationOcppConfiguration,
} from '../../../src/types/index.js'
import type {
  AvailabilityType,
  ConnectorStatusEnum,
  OCPPVersion,
  RegistrationStatusEnumType,
} from '../../../src/types/index.js'
import type { MockIdTagsCache, MockSharedLRUCache } from '../mocks/MockCaches.js'
import type { MockWebSocket } from '../mocks/MockWebSocket.js'

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
  requestHandler: (...args: unknown[]) => Promise<unknown>
  sendError: (...args: unknown[]) => Promise<unknown>
  sendResponse: (...args: unknown[]) => Promise<unknown>
}
