/**
 * @file OCPP 2.0 test utilities
 * @description Shared helpers, mock factories, and fixtures for OCPP 2.0 test suites
 */
import { mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/ChargingStation.js'
import type { ChargingStationWithCertificateManager } from '../../../../src/charging-station/ocpp/2.0/OCPP20CertificateManager.js'
import type { ConfigurationKey } from '../../../../src/types/ChargingStationOcppConfiguration.js'
import type { EmptyObject } from '../../../../src/types/EmptyObject.js'
import type {
  CertificateHashDataChainType,
  CertificateHashDataType,
  GetCertificateIdUseEnumType,
  JsonType,
  OCPP20RequestCommand,
  OCSPRequestDataType,
} from '../../../../src/types/index.js'
import type {
  OCPP20IdTokenType,
  OCPP20TransactionContext,
} from '../../../../src/types/ocpp/2.0/Transaction.js'

import { OCPP20RequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20RequestService.js'
import { OCPP20ResponseService } from '../../../../src/charging-station/ocpp/2.0/OCPP20ResponseService.js'
import {
  ConnectorStatusEnum,
  DeleteCertificateStatusEnumType,
  HashAlgorithmEnumType,
  OCPP20RequiredVariableName,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { OCPP20IncomingRequestCommand } from '../../../../src/types/ocpp/2.0/Requests.js'
import { OCPP20IdTokenEnumType } from '../../../../src/types/ocpp/2.0/Transaction.js'
import { Constants } from '../../../../src/utils/index.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import {
  createMockChargingStation,
  type MockChargingStation,
} from '../../ChargingStationTestUtils.js'

// ============================================================================
// Testable Interfaces
// ============================================================================
// These interfaces provide type-safe access to private methods for testing
// purposes, eliminating the need for `as any` casts and eslint-disable comments.
// ============================================================================

/**
 * Interface representing a captured OCPP request for test verification.
 */
export interface CapturedOCPPRequest {
  /** The OCPP command name (e.g., 'TransactionEvent', 'Heartbeat') */
  command: string
  /** The request payload */
  payload: Record<string, unknown>
}

/**
 * Result of creating a mock station with request tracking.
 */
export interface MockStationWithTracking {
  /** The mock function used as request handler */
  requestHandlerMock: ReturnType<typeof mock.fn>
  /** Array that captures all sent requests */
  sentRequests: CapturedOCPPRequest[]
  /** Function to set the station's online status */
  setOnline: (online: boolean) => void
  /** The mock charging station instance */
  station: ChargingStation
}

/**
 * Result of creating an OCPP 2.0 request test context.
 * Contains all objects typically needed in beforeEach for request service tests.
 */
export interface OCPP20RequestTestContext {
  readonly requestService: OCPP20RequestService
  readonly station: ChargingStation
  readonly testableRequestService: TestableOCPP20RequestService
}

/**
 * Options for creating an OCPP 2.0 request test context.
 */
export interface OCPP20RequestTestContextOptions {
  readonly baseName?: string
  readonly stationInfo?: Record<string, unknown>
}

/**
 * Interface exposing private methods of OCPP20RequestService for testing.
 * This allows type-safe testing without `as any` casts.
 */
export interface TestableOCPP20RequestService {
  /**
   * Build a request payload for the given OCPP 2.0 command.
   * Exposes the private `buildRequestPayload` method for testing.
   * @param chargingStation - The charging station instance
   * @param commandName - The OCPP 2.0 request command
   * @param commandParams - Optional command parameters
   * @returns The built request payload
   */
  buildRequestPayload: (
    chargingStation: ChargingStation,
    commandName: OCPP20RequestCommand,
    commandParams?: JsonType
  ) => JsonType
}

/**
 * Create a mock ChargingStation with request tracking for testing OCPP request flows.
 * This is useful for tests that need to verify what requests were sent.
 * @returns Object containing the station, captured requests array, and control functions
 * @example
 * ```typescript
 * const { station, sentRequests, setOnline } = createMockStationWithRequestTracking()
 * await OCPP20ServiceUtils.sendTransactionEvent(station, ...)
 * expect(sentRequests.length).toBe(1)
 * expect(sentRequests[0].command).toBe('TransactionEvent')
 * ```
 */
export function createMockStationWithRequestTracking (): MockStationWithTracking {
  const sentRequests: CapturedOCPPRequest[] = []
  let isOnline = true

  const requestHandlerMock = mock.fn(async (...args: unknown[]) => {
    sentRequests.push({
      command: args[1] as string,
      payload: args[2] as Record<string, unknown>,
    })
    return Promise.resolve({} as EmptyObject)
  })

  const { station } = createMockChargingStation({
    baseName: TEST_CHARGING_STATION_BASE_NAME,
    connectorsCount: 3,
    evseConfiguration: { evsesCount: 3 },
    heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
    ocppRequestService: {
      requestHandler: requestHandlerMock,
    },
    stationInfo: {
      ocppStrictCompliance: true,
      ocppVersion: OCPPVersion.VERSION_201,
    },
    websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
  })

  station.isWebSocketConnectionOpened = () => isOnline

  resetLimits(station)

  return {
    requestHandlerMock,
    sentRequests,
    setOnline: (online: boolean) => {
      isOnline = online
    },
    station,
  }
}

/**
 * Create a standard OCPP 2.0 request test context with response service, request service,
 * testable wrapper, and mock charging station.
 *
 * Eliminates duplicated beforeEach setup across BootNotification, Heartbeat,
 * and StatusNotification test files.
 * @param options - Optional overrides for base name and station info
 * @returns OCPP20RequestTestContext with all objects needed for testing
 */
export function createOCPP20RequestTestContext (
  options: OCPP20RequestTestContextOptions = {}
): OCPP20RequestTestContext {
  const { baseName = TEST_CHARGING_STATION_BASE_NAME, stationInfo = {} } = options

  const mockResponseService = new OCPP20ResponseService()
  const requestService = new OCPP20RequestService(mockResponseService)
  const testableRequestService = createTestableOCPP20RequestService(requestService)
  const { station } = createMockChargingStation({
    baseName,
    connectorsCount: 3,
    evseConfiguration: { evsesCount: 3 },
    heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
    stationInfo: {
      ocppStrictCompliance: false,
      ocppVersion: OCPPVersion.VERSION_201,
      ...stationInfo,
    },
    websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
  })

  return { requestService, station, testableRequestService }
}

/**
 * Create a testable wrapper for OCPP20RequestService that exposes private methods.
 *
 * This function provides type-safe access to private methods that need to be tested,
 * following the pattern recommended in TEST_STYLE_GUIDE.md to avoid `as any` casts.
 * @param requestService - The OCPP20RequestService instance to wrap
 * @returns A testable interface with access to private methods
 * @example
 * ```typescript
 * const testable = createTestableOCPP20RequestService(requestService)
 * const payload = testable.buildRequestPayload(station, OCPP20RequestCommand.HEARTBEAT)
 * ```
 */
export function createTestableOCPP20RequestService (
  requestService: OCPP20RequestService
): TestableOCPP20RequestService {
  // Use type assertion at the boundary only, providing type-safe interface to tests
  const service = requestService as unknown as {
    buildRequestPayload: TestableOCPP20RequestService['buildRequestPayload']
  }
  return {
    buildRequestPayload: service.buildRequestPayload.bind(requestService),
  }
}

/**
 * Reset connector transaction state for all connectors in the charging station.
 * This ensures test isolation by clearing any transaction state from previous tests.
 * @param chargingStation Charging station instance whose connector state should be reset.
 */
export function resetConnectorTransactionState (chargingStation: ChargingStation): void {
  if (chargingStation.hasEvses) {
    for (const evseStatus of chargingStation.evses.values()) {
      for (const connectorStatus of evseStatus.connectors.values()) {
        connectorStatus.transactionStarted = false
        connectorStatus.transactionId = undefined
        connectorStatus.transactionIdTag = undefined
        connectorStatus.transactionStart = undefined
        connectorStatus.transactionEnergyActiveImportRegisterValue = 0
        connectorStatus.remoteStartId = undefined
        connectorStatus.status = ConnectorStatusEnum.Available
        connectorStatus.chargingProfiles = []
      }
    }
  } else {
    for (const [connectorId, connectorStatus] of chargingStation.connectors.entries()) {
      if (connectorId === 0) continue // Skip connector 0 (charging station itself)
      connectorStatus.transactionStarted = false
      connectorStatus.transactionId = undefined
      connectorStatus.transactionIdTag = undefined
      connectorStatus.transactionStart = undefined
      connectorStatus.transactionEnergyActiveImportRegisterValue = 0
      connectorStatus.remoteStartId = undefined
      connectorStatus.status = ConnectorStatusEnum.Available
      connectorStatus.chargingProfiles = []
    }
  }
}

/**
 * Reset message size and element limits to generous defaults after tests manipulating them.
 * Defaults chosen to exceed any test constructed payload sizes.
 * @param chargingStation Charging station test instance whose configuration limits are reset.
 */
export function resetLimits (chargingStation: ChargingStation) {
  upsertConfigurationKey(chargingStation, OCPP20RequiredVariableName.ItemsPerMessage, '100')
  upsertConfigurationKey(chargingStation, OCPP20RequiredVariableName.BytesPerMessage, '10000')
}

/**
 * Clear or enlarge ReportingValueSize to avoid side-effects for subsequent tests.
 * @param chargingStation Charging station test instance whose ReportingValueSize is adjusted.
 */
export function resetReportingValueSize (chargingStation: ChargingStation) {
  upsertConfigurationKey(
    chargingStation,
    OCPP20RequiredVariableName.ReportingValueSize,
    Constants.OCPP_VALUE_ABSOLUTE_MAX_LENGTH.toString()
  )
}

/**
 * Reset configuration/storage value size limits to generous defaults.
 * Applies both ConfigurationValueSize and ValueSize (DeviceDataCtrlr).
 * @param chargingStation Charging station instance.
 */
export function resetValueSizeLimits (chargingStation: ChargingStation) {
  upsertConfigurationKey(
    chargingStation,
    OCPP20RequiredVariableName.ConfigurationValueSize,
    Constants.OCPP_VALUE_ABSOLUTE_MAX_LENGTH.toString()
  )
  upsertConfigurationKey(
    chargingStation,
    OCPP20RequiredVariableName.ValueSize,
    Constants.OCPP_VALUE_ABSOLUTE_MAX_LENGTH.toString()
  )
}

/**
 * Set ConfigurationValueSize (used at set-time) to specified positive integer.
 * @param chargingStation Charging station instance.
 * @param size Effective configuration value size limit.
 */
export function setConfigurationValueSize (chargingStation: ChargingStation, size: number) {
  upsertConfigurationKey(
    chargingStation,
    OCPP20RequiredVariableName.ConfigurationValueSize,
    size.toString()
  )
}

/**
 * Set a small ReportingValueSize for truncation tests.
 * @param chargingStation Charging station instance.
 * @param size Desired reporting value size limit (positive integer).
 */
export function setReportingValueSize (chargingStation: ChargingStation, size: number) {
  upsertConfigurationKey(
    chargingStation,
    OCPP20RequiredVariableName.ReportingValueSize,
    size.toString()
  )
}

/**
 * Configure strict limits for ItemsPerMessage and BytesPerMessage.
 * @param chargingStation Charging station instance.
 * @param itemsLimit Maximum number of items per message.
 * @param bytesLimit Maximum number of bytes per message.
 */
export function setStrictLimits (
  chargingStation: ChargingStation,
  itemsLimit: number,
  bytesLimit: number
) {
  upsertConfigurationKey(
    chargingStation,
    OCPP20RequiredVariableName.ItemsPerMessage,
    itemsLimit.toString()
  )
  upsertConfigurationKey(
    chargingStation,
    OCPP20RequiredVariableName.BytesPerMessage,
    bytesLimit.toString()
  )
}

/**
 * Set ValueSize (applied before ReportingValueSize for get-time truncation and effective set-time limit computation).
 * @param chargingStation Charging station instance.
 * @param size Desired stored value size limit.
 */
export function setValueSize (chargingStation: ChargingStation, size: number) {
  upsertConfigurationKey(chargingStation, OCPP20RequiredVariableName.ValueSize, size.toString())
}

/**
 * Upsert a configuration key with provided value and readonly flag (default false).
 * @param chargingStation Charging station instance.
 * @param key Configuration key name.
 * @param value Configuration key value as string.
 * @param readonly Whether the key is read-only (default false).
 */
export function upsertConfigurationKey (
  chargingStation: ChargingStation,
  key: string,
  value: string,
  readonly = false
) {
  const configKeys = ensureConfig(chargingStation)
  const configKey = configKeys.find(k => k.key === key)
  if (configKey) {
    configKey.value = value
    if (readonly) configKey.readonly = readonly
  } else {
    configKeys.push({ key, readonly, value })
  }
}

/**
 * Ensure ocppConfiguration and configurationKey array are initialized and return the array.
 * @param chargingStation Charging station instance to initialize.
 * @returns Mutable array of configuration keys for the station.
 */
function ensureConfig (chargingStation: ChargingStation): ConfigurationKey[] {
  chargingStation.ocppConfiguration ??= { configurationKey: [] }
  chargingStation.ocppConfiguration.configurationKey ??= []
  return chargingStation.ocppConfiguration.configurationKey
}

// ============================================================================
// TransactionEvent Fixtures
// ============================================================================
// Pre-built fixtures for common transaction event testing patterns.
// ============================================================================

/**
 * Pre-built IdToken fixtures for common test scenarios.
 * Use these to avoid duplication of token creation across test files.
 */
export const IdTokenFixtures = {
  /**
   * Central (server-side) token.
   * @param idToken - The ID token string.
   * @returns An OCPP20IdTokenType with Central type.
   */
  central: (idToken = 'CENTRAL_TOKEN_001'): OCPP20IdTokenType => ({
    idToken,
    type: OCPP20IdTokenEnumType.Central,
  }),

  /**
   * eMAID contract identifier token.
   * @param idToken - The eMAID token string.
   * @returns An OCPP20IdTokenType with eMAID type.
   */
  emaid: (idToken = 'DE*ABC*E123456*1'): OCPP20IdTokenType => ({
    idToken,
    type: OCPP20IdTokenEnumType.eMAID,
  }),

  /**
   * ISO14443 RFID token (most common type).
   * @param idToken - The RFID token string.
   * @returns An OCPP20IdTokenType with ISO14443 type.
   */
  iso14443: (idToken = 'TEST_RFID_TOKEN_001'): OCPP20IdTokenType => ({
    idToken,
    type: OCPP20IdTokenEnumType.ISO14443,
  }),

  /**
   * ISO15693 RFID token.
   * @param idToken - The ISO15693 token string.
   * @returns An OCPP20IdTokenType with ISO15693 type.
   */
  iso15693: (idToken = 'TEST_ISO15693_001'): OCPP20IdTokenType => ({
    idToken,
    type: OCPP20IdTokenEnumType.ISO15693,
  }),

  /**
   * NoAuthorization token (free charging).
   * @returns An OCPP20IdTokenType with NoAuthorization type.
   */
  noAuth: (): OCPP20IdTokenType => ({
    idToken: '',
    type: OCPP20IdTokenEnumType.NoAuthorization,
  }),
} as const

/**
 * Pre-built TransactionContext factories for common flow patterns.
 * Use these to create standardized contexts for different transaction flows.
 */
export const TransactionContextFixtures = {
  // ===== Local Authorization Contexts =====

  /**
   * Abnormal condition (with optional condition type).
   * @param condition - The abnormal condition type.
   * @returns An OCPP20TransactionContext for abnormal conditions.
   */
  abnormalCondition: (condition = 'OverCurrent'): OCPP20TransactionContext => ({
    abnormalCondition: condition,
    source: 'abnormal_condition',
  }),

  /**
   * Cable plugged in (E02 cable-first start).
   * @returns An OCPP20TransactionContext for cable plugged in.
   */
  cablePluggedIn: (): OCPP20TransactionContext => ({
    cableState: 'plugged_in',
    source: 'cable_action',
  }),

  /**
   * Deauthorization (token revoked or invalid).
   * @returns An OCPP20TransactionContext for deauthorization.
   */
  deauthorized: (): OCPP20TransactionContext => ({
    authorizationMethod: 'idToken',
    isDeauthorized: true,
    source: 'local_authorization',
  }),

  // ===== Cable Action Contexts (E02 flow) =====

  /**
   * Energy limit reached.
   * @returns An OCPP20TransactionContext for energy limit reached.
   */
  energyLimitReached: (): OCPP20TransactionContext => ({
    source: 'energy_limit',
  }),

  /**
   * EV communication lost.
   * @returns An OCPP20TransactionContext for EV communication lost.
   */
  evCommunicationLost: (): OCPP20TransactionContext => ({
    source: 'system_event',
    systemEvent: 'ev_communication_lost',
  }),

  /**
   * EV connect timeout.
   * @returns An OCPP20TransactionContext for EV connect timeout.
   */
  evConnectTimeout: (): OCPP20TransactionContext => ({
    source: 'system_event',
    systemEvent: 'ev_connect_timeout',
  }),

  // ===== Remote Command Contexts =====

  /**
   * Cable unplugged / EV departed.
   * @returns An OCPP20TransactionContext for EV departure.
   */
  evDeparted: (): OCPP20TransactionContext => ({
    cableState: 'unplugged',
    source: 'cable_action',
  }),

  /**
   * EV detected after cable connection.
   * @returns An OCPP20TransactionContext for EV detection.
   */
  evDetected: (): OCPP20TransactionContext => ({
    cableState: 'detected',
    source: 'cable_action',
  }),

  /**
   * IdToken-first authorization (E03 flow start).
   * @param authorizationMethod - The authorization method used.
   * @returns An OCPP20TransactionContext for IdToken authorization.
   */
  idTokenAuthorized: (
    authorizationMethod: 'groupIdToken' | 'idToken' = 'idToken'
  ): OCPP20TransactionContext => ({
    authorizationMethod,
    source: 'local_authorization',
  }),

  /**
   * Clock-aligned meter value.
   * @returns An OCPP20TransactionContext for clock-aligned meter values.
   */
  meterValueClock: (): OCPP20TransactionContext => ({
    isPeriodicMeterValue: false,
    source: 'meter_value',
  }),

  /**
   * Periodic meter value (sampled interval).
   * @returns An OCPP20TransactionContext for periodic meter values.
   */
  meterValuePeriodic: (): OCPP20TransactionContext => ({
    isPeriodicMeterValue: true,
    source: 'meter_value',
  }),

  // ===== Meter Value Contexts =====

  /**
   * Remote start transaction request.
   * @returns An OCPP20TransactionContext for remote start.
   */
  remoteStart: (): OCPP20TransactionContext => ({
    command: OCPP20IncomingRequestCommand.REQUEST_START_TRANSACTION,
    source: 'remote_command',
  }),

  /**
   * Remote stop transaction request.
   * @returns An OCPP20TransactionContext for remote stop.
   */
  remoteStop: (): OCPP20TransactionContext => ({
    command: OCPP20IncomingRequestCommand.REQUEST_STOP_TRANSACTION,
    source: 'remote_command',
  }),

  /**
   * Reset command.
   * @returns An OCPP20TransactionContext for reset.
   */
  reset: (): OCPP20TransactionContext => ({
    command: OCPP20IncomingRequestCommand.RESET,
    source: 'remote_command',
  }),

  // ===== System Event Contexts =====

  /**
   * Signed data received.
   * @returns An OCPP20TransactionContext for signed data.
   */
  signedData: (): OCPP20TransactionContext => ({
    isSignedDataReceived: true,
    source: 'meter_value',
  }),

  /**
   * Stop authorized by local token presentation.
   * @returns An OCPP20TransactionContext for stop authorization.
   */
  stopAuthorized: (): OCPP20TransactionContext => ({
    authorizationMethod: 'stopAuthorized',
    source: 'local_authorization',
  }),

  // ===== Limit Contexts =====

  /**
   * Time limit reached.
   * @returns An OCPP20TransactionContext for time limit.
   */
  timeLimitReached: (): OCPP20TransactionContext => ({
    source: 'time_limit',
  }),

  /**
   * Trigger message command.
   * @returns An OCPP20TransactionContext for trigger message.
   */
  triggerMessage: (): OCPP20TransactionContext => ({
    command: OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
    source: 'remote_command',
  }),

  // ===== Abnormal Condition Contexts =====

  /**
   * Unlock connector command.
   * @returns An OCPP20TransactionContext for unlock connector.
   */
  unlockConnector: (): OCPP20TransactionContext => ({
    command: OCPP20IncomingRequestCommand.UNLOCK_CONNECTOR,
    source: 'remote_command',
  }),
} as const

/**
 * Pre-built mock station fixtures for Reset command testing.
 * These factories create properly configured MockChargingStation instances
 * with common configurations to avoid duplication across test files.
 */
export const ResetTestFixtures = {
  /**
   * Create a mock station without EVSE support for testing EVSE-specific rejection.
   * @returns MockChargingStation with hasEvses=false
   */
  createNonEvseStation: (): MockChargingStation => {
    const station = ResetTestFixtures.createStandardStation()
    Object.defineProperty(station, 'hasEvses', {
      configurable: true,
      value: false,
      writable: true,
    })
    return station
  },

  /**
   * Create a standard mock station for reset tests with no running transactions.
   * Default configuration: 3 connectors, 3 EVSEs, OCPP 2.0.1, 5s reset time.
   * @param runningTransactions - Number of running transactions to simulate (default: 0)
   * @returns MockChargingStation ready for reset testing
   */
  createStandardStation: (runningTransactions = 0): MockChargingStation => {
    const { station } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 3,
      evseConfiguration: { evsesCount: 3 },
      heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
      stationInfo: {
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
        resetTime: 5000,
      },
      websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
    })
    const mockStation = station as MockChargingStation
    mockStation.getNumberOfRunningTransactions = () => runningTransactions
    mockStation.reset = () => Promise.resolve()
    return mockStation
  },

  /**
   * Create a mock station with active transaction.
   * @returns MockChargingStation with 1 running transaction
   */
  createStationWithTransaction: (): MockChargingStation => {
    return ResetTestFixtures.createStandardStation(1)
  },
} as const

/**
 * Type representing a transaction flow pattern for parameterized testing.
 */
export interface TransactionFlowPattern {
  /** Human-readable description of the flow */
  description: string
  /** Expected trigger reason for Started event */
  expectedStartTrigger: string
  /** Whether to include idToken in Started event */
  includeIdToken: boolean
  /** Context to use for Started event (determines initial trigger reason) */
  startContext: OCPP20TransactionContext
}

/**
 * Pre-defined transaction flow patterns for parameterized testing.
 * Covers the main OCPP 2.0.1 transaction initiation scenarios.
 */
export const TransactionFlowPatterns: TransactionFlowPattern[] = [
  {
    description: 'E02 Cable-First: CablePluggedIn → Charging → EVDeparted',
    expectedStartTrigger: 'CablePluggedIn',
    includeIdToken: false,
    startContext: TransactionContextFixtures.cablePluggedIn(),
  },
  {
    description: 'E03 IdToken-First: Authorized → Cable → Charging → StopAuthorized',
    expectedStartTrigger: 'Authorized',
    includeIdToken: true,
    startContext: TransactionContextFixtures.idTokenAuthorized(),
  },
  {
    description: 'Remote Start: RemoteStart → Charging → RemoteStop',
    expectedStartTrigger: 'RemoteStart',
    includeIdToken: false,
    startContext: TransactionContextFixtures.remoteStart(),
  },
] as const

// ============================================================================
// ChargingStationWithCertificateManager Factory
// ============================================================================

/**
 * Options for configuring the mock certificate manager behavior.
 */
export interface MockCertificateManagerOptions {
  /** Error to throw when deleteCertificate is called */
  deleteCertificateError?: Error
  /** Result to return from deleteCertificate (default: { status: DeleteCertificateStatusEnumType.Accepted }) */
  deleteCertificateResult?: { status: DeleteCertificateStatusEnumType }
  /** Error to throw when getInstalledCertificates is called */
  getInstalledCertificatesError?: Error
  /** Result to return from getInstalledCertificates (default: []) */
  getInstalledCertificatesResult?: CertificateHashDataChainType[]
  /** Result to return from isChargingStationCertificateHash (default: false) */
  isChargingStationCertificateHashResult?: boolean
  /** Error to throw when storeCertificate is called */
  storeCertificateError?: Error
  /** Result to return from storeCertificate (default: { success: true }) */
  storeCertificateResult?: boolean
  /** Result to return from validateCertificateX509 (default: { valid: true }) */
  validateCertificateX509Result?: { reason?: string; valid: boolean }
}

// ============================================================================
// Certificate Manager Mock Factory
// ============================================================================

/**
 * Create mock certificate hash data for testing.
 * @param serialNumber - Optional serial number (default: '123456789')
 * @returns CertificateHashDataType object
 */
export function createMockCertificateHashData (serialNumber = '123456789'): CertificateHashDataType {
  return {
    hashAlgorithm: HashAlgorithmEnumType.SHA256,
    issuerKeyHash: 'abc123def456',
    issuerNameHash: 'xyz789uvw012',
    serialNumber,
  }
}

/**
 * Create mock certificate hash data chain for testing.
 * @param certificateType - The certificate type
 * @param serialNumber - Optional serial number (default: '123456789')
 * @returns CertificateHashDataChainType object
 */
export function createMockCertificateHashDataChain (
  certificateType: GetCertificateIdUseEnumType,
  serialNumber = '123456789'
): CertificateHashDataChainType {
  return {
    certificateHashData: createMockCertificateHashData(serialNumber),
    certificateType,
  }
}

// ============================================================================
// Certificate Test Data Factory Functions
// ============================================================================

/**
 * Create a mock certificate manager for OCPP 2.0 certificate operation testing.
 *
 * Configurable mock for DeleteCertificate, InstallCertificate, CertificateSigned,
 * and GetInstalledCertificateIds operations.
 * @param options - Configuration options for mock behavior
 * @returns Mock certificate manager with configurable behavior
 * @example
 * ```typescript
 * // Default behavior - all operations succeed
 * const certManager = createMockCertificateManager()
 *
 * // Configure delete to return NotFound
 * const certManager = createMockCertificateManager({
 *   deleteCertificateResult: { status: 'NotFound' }
 * })
 *
 * // Configure store to throw error
 * const certManager = createMockCertificateManager({
 *   storeCertificateError: new Error('Storage failed')
 * })
 *
 * // Configure getInstalledCertificates to return specific certificates
 * const certManager = createMockCertificateManager({
 *   getInstalledCertificatesResult: [certificateChain1, certificateChain2]
 * })
 * ```
 */
export function createMockCertificateManager (options: MockCertificateManagerOptions = {}) {
  return {
    deleteCertificate: mock.fn(() => {
      if (options.deleteCertificateError != null) {
        throw options.deleteCertificateError
      }
      return options.deleteCertificateResult ?? { status: DeleteCertificateStatusEnumType.Accepted }
    }),
    getInstalledCertificates: mock.fn(() => {
      if (options.getInstalledCertificatesError != null) {
        throw options.getInstalledCertificatesError
      }
      return {
        certificateHashDataChain: options.getInstalledCertificatesResult ?? [],
      }
    }),
    isChargingStationCertificateHash: mock.fn(() => {
      return options.isChargingStationCertificateHashResult ?? false
    }),
    storeCertificate: mock.fn(() => {
      if (options.storeCertificateError != null) {
        throw options.storeCertificateError
      }
      return { success: options.storeCertificateResult ?? true }
    }),
    validateCertificateFormat: mock.fn((cert: string) => {
      return (
        cert.includes('-----BEGIN CERTIFICATE-----') && cert.includes('-----END CERTIFICATE-----')
      )
    }),
    validateCertificateX509: mock.fn(() => {
      return options.validateCertificateX509Result ?? { valid: true }
    }),
  }
}

/**
 * Create mock OCSP request data for GetCertificateStatus tests.
 * @returns OCSPRequestDataType object with default test values
 */
export function createMockOCSPRequestData (): OCSPRequestDataType {
  return {
    hashAlgorithm: HashAlgorithmEnumType.SHA256,
    issuerKeyHash: 'abc123def456issuerkeyhash',
    issuerNameHash: 'abc123def456issuernamehash',
    responderURL: 'http://ocsp.example.com',
    serialNumber: '1234567890',
  }
}

/**
 * Create a mock OCPP 2.0 charging station with a spy requestHandler for listener tests.
 * @param baseName - Base name for the mock charging station
 * @returns The mock station and its request handler spy
 */
export function createOCPP20ListenerStation (baseName: string): {
  requestHandlerMock: ReturnType<typeof mock.fn>
  station: ChargingStation
} {
  const requestHandlerMock = mock.fn(async () => Promise.resolve({}))
  const { station } = createMockChargingStation({
    baseName,
    connectorsCount: 3,
    evseConfiguration: { evsesCount: 3 },
    heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
    ocppRequestService: {
      requestHandler: requestHandlerMock,
    },
    stationInfo: {
      ocppStrictCompliance: false,
      ocppVersion: OCPPVersion.VERSION_201,
    },
    websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
  })
  return { requestHandlerMock, station }
}

/**
 * Create a mock ChargingStation with certificate manager for testing.
 * This encapsulates the type casting pattern for ChargingStationWithCertificateManager.
 * @param baseStation - Optional base station to extend (creates new if not provided)
 * @param certificateManager - Certificate manager to attach
 * @returns ChargingStation with certificateManager property properly typed
 * @example
 * ```typescript
 * const { station } = createMockChargingStation({
 *   stationInfo: { ocppVersion: OCPPVersion.VERSION_201 }
 * })
 * const stationWithCerts = createStationWithCertificateManager(
 *   station,
 *   createMockCertificateManager()
 * )
 * ```
 */
export function createStationWithCertificateManager (
  baseStation: ChargingStation,
  certificateManager: ChargingStationWithCertificateManager['certificateManager']
): ChargingStationWithCertificateManager {
  const station = baseStation as ChargingStationWithCertificateManager
  station.certificateManager = certificateManager
  return station
}
