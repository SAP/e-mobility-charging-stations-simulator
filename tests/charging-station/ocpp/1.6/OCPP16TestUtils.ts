/**
 * @file OCPP 1.6 test utilities, fixtures, and mock helpers
 * @description Provides context factories, charging profile fixtures, reservation fixtures,
 *   and configuration key helpers for OCPP 1.6 unit and integration tests.
 */

import type { ChargingStation } from '../../../../src/charging-station/ChargingStation.js'
import type { ConfigurationKey } from '../../../../src/types/ChargingStationOcppConfiguration.js'
import type {
  OCPP16ChargingProfile,
  OCPP16ChargingSchedulePeriod,
} from '../../../../src/types/ocpp/1.6/ChargingProfile.js'

import {
  createTestableIncomingRequestService,
  createTestableOCPP16RequestService,
  type TestableOCPP16IncomingRequestService,
  type TestableOCPP16RequestService,
} from '../../../../src/charging-station/ocpp/1.6/__testable__/index.js'
import { OCPP16IncomingRequestService } from '../../../../src/charging-station/ocpp/1.6/OCPP16IncomingRequestService.js'
import { OCPP16RequestService } from '../../../../src/charging-station/ocpp/1.6/OCPP16RequestService.js'
import { OCPP16ResponseService } from '../../../../src/charging-station/ocpp/1.6/OCPP16ResponseService.js'
import {
  OCPP16ChargingProfilePurposeType,
  OCPP16ChargingRateUnitType,
  OCPP16StandardParametersKey,
  OCPPVersion,
} from '../../../../src/types/index.js'
import {
  OCPP16ChargingProfileKindType,
} from '../../../../src/types/ocpp/1.6/ChargingProfile.js'
import { Constants } from '../../../../src/utils/index.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import {
  createMockChargingStation,
  type MockChargingStation,
} from '../../ChargingStationTestUtils.js'

// ============================================================================
// Test Context Types
// ============================================================================

export interface OCPP16IncomingRequestTestContext {
  readonly incomingRequestService: OCPP16IncomingRequestService
  readonly station: ChargingStation
  readonly testableService: TestableOCPP16IncomingRequestService
}

export interface OCPP16IncomingRequestTestContextOptions {
  readonly baseName?: string
  readonly connectorsCount?: number
  readonly stationInfo?: Record<string, unknown>
}

export interface OCPP16RequestTestContext {
  readonly requestService: OCPP16RequestService
  readonly station: ChargingStation
  readonly testableRequestService: TestableOCPP16RequestService
}

export interface OCPP16RequestTestContextOptions {
  readonly baseName?: string
  readonly stationInfo?: Record<string, unknown>
}

export interface OCPP16ResponseTestContext {
  readonly responseService: OCPP16ResponseService
  readonly station: ChargingStation
}

export interface OCPP16ResponseTestContextOptions {
  readonly baseName?: string
  readonly stationInfo?: Record<string, unknown>
}

// ============================================================================
// Context Factories
// ============================================================================

/**
 * Create a standard OCPP 1.6 incoming request test context with service,
 * testable wrapper, and mock charging station.
 * @param options - Optional overrides for base name, connectors, and station info
 * @returns OCPP16IncomingRequestTestContext with all objects needed for testing
 */
export function createOCPP16IncomingRequestTestContext (
  options: OCPP16IncomingRequestTestContextOptions = {}
): OCPP16IncomingRequestTestContext {
  const {
    baseName = TEST_CHARGING_STATION_BASE_NAME,
    connectorsCount = 2,
    stationInfo = {},
  } = options

  const incomingRequestService = new OCPP16IncomingRequestService()
  const testableService = createTestableIncomingRequestService(incomingRequestService)
  const { station } = createMockChargingStation({
    baseName,
    connectorsCount,
    heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
    stationInfo: {
      ocppStrictCompliance: false,
      ocppVersion: OCPPVersion.VERSION_16,
      ...stationInfo,
    },
    websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
  })

  return { incomingRequestService, station, testableService }
}

/**
 * Create a standard OCPP 1.6 request test context with response service,
 * request service, testable wrapper, and mock charging station.
 * @param options - Optional overrides for base name and station info
 * @returns OCPP16RequestTestContext with all objects needed for testing
 */
export function createOCPP16RequestTestContext (
  options: OCPP16RequestTestContextOptions = {}
): OCPP16RequestTestContext {
  const { baseName = TEST_CHARGING_STATION_BASE_NAME, stationInfo = {} } = options

  const mockResponseService = new OCPP16ResponseService()
  const requestService = new OCPP16RequestService(mockResponseService)
  const testableRequestService = createTestableOCPP16RequestService(requestService)
  const { station } = createMockChargingStation({
    baseName,
    connectorsCount: 2,
    heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
    stationInfo: {
      ocppStrictCompliance: false,
      ocppVersion: OCPPVersion.VERSION_16,
      ...stationInfo,
    },
    websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
  })

  return { requestService, station, testableRequestService }
}

/**
 * Create a standard OCPP 1.6 response test context with response service
 * and mock charging station.
 * @param options - Optional overrides for base name and station info
 * @returns OCPP16ResponseTestContext with all objects needed for testing
 */
export function createOCPP16ResponseTestContext (
  options: OCPP16ResponseTestContextOptions = {}
): OCPP16ResponseTestContext {
  const { baseName = TEST_CHARGING_STATION_BASE_NAME, stationInfo = {} } = options

  const responseService = new OCPP16ResponseService()
  const { station } = createMockChargingStation({
    baseName,
    connectorsCount: 2,
    heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
    stationInfo: {
      ocppStrictCompliance: false,
      ocppVersion: OCPPVersion.VERSION_16,
      ...stationInfo,
    },
    websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
  })

  return { responseService, station }
}

/**
 * Create a pre-configured mock station for OCPP 1.6 tests.
 * Default configuration: 2 connectors, OCPP 1.6, 5s reset time.
 * @param options - Optional overrides for station configuration
 * @returns MockChargingStation ready for testing
 */
export function createStandardStation (
  options: OCPP16IncomingRequestTestContextOptions = {}
): MockChargingStation {
  const {
    baseName = TEST_CHARGING_STATION_BASE_NAME,
    connectorsCount = 2,
    stationInfo = {},
  } = options

  const { station } = createMockChargingStation({
    baseName,
    connectorsCount,
    heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
    stationInfo: {
      ocppStrictCompliance: false,
      ocppVersion: OCPPVersion.VERSION_16,
      resetTime: 5000,
      ...stationInfo,
    },
    websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
  })

  return station as MockChargingStation
}

// ============================================================================
// Connector Transaction State Helpers
// ============================================================================

/**
 * Reset connector transaction state for all connectors in the charging station.
 * Ensures test isolation by clearing any transaction state from previous tests.
 * @param chargingStation - Charging station instance whose connector state should be reset
 */
export function resetConnectorTransactionState (chargingStation: ChargingStation): void {
  for (const [connectorId, connectorStatus] of chargingStation.connectors.entries()) {
    if (connectorId === 0) continue
    connectorStatus.transactionStarted = false
    connectorStatus.transactionId = undefined
    connectorStatus.transactionIdTag = undefined
    connectorStatus.transactionStart = undefined
    connectorStatus.transactionEnergyActiveImportRegisterValue = 0
    connectorStatus.transactionRemoteStarted = false
    connectorStatus.chargingProfiles = []
  }
}

// ============================================================================
// Configuration Helpers
// ============================================================================

/**
 * Reset message size and element limits to generous defaults after tests manipulating them.
 * @param chargingStation - Charging station test instance whose configuration limits are reset
 */
export function resetLimits (chargingStation: ChargingStation) {
  upsertConfigurationKey(
    chargingStation,
    OCPP16StandardParametersKey.MeterValueSampleInterval,
    '60'
  )
  upsertConfigurationKey(
    chargingStation,
    OCPP16StandardParametersKey.HeartbeatInterval,
    Constants.DEFAULT_HEARTBEAT_INTERVAL.toString()
  )
}

/**
 * Upsert a configuration key with provided value and readonly flag (default false).
 * @param chargingStation - Charging station instance
 * @param key - Configuration key name
 * @param value - Configuration key value as string
 * @param readonly - Whether the key is read-only (default false)
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
 * Ensure configuration key array exists on the charging station.
 * @param chargingStation - Charging station instance to ensure configuration for
 * @returns The configuration key array
 */
function ensureConfig (chargingStation: ChargingStation): ConfigurationKey[] {
  chargingStation.ocppConfiguration ??= { configurationKey: [] }
  chargingStation.ocppConfiguration.configurationKey ??= []
  return chargingStation.ocppConfiguration.configurationKey
}

// ============================================================================
// Fixture Factories
// ============================================================================

export const ChargingProfileFixtures = {
  createChargePointMaxProfile: (
    chargingProfileId = 3,
    periods: OCPP16ChargingSchedulePeriod[] = [{ limit: 32, startPeriod: 0 }]
  ): OCPP16ChargingProfile => ({
    chargingProfileId,
    chargingProfileKind: OCPP16ChargingProfileKindType.ABSOLUTE,
    chargingProfilePurpose: OCPP16ChargingProfilePurposeType.CHARGE_POINT_MAX_PROFILE,
    chargingSchedule: {
      chargingRateUnit: OCPP16ChargingRateUnitType.AMPERE,
      chargingSchedulePeriod: periods,
    },
    stackLevel: 0,
  }),

  createTxDefaultProfile: (
    chargingProfileId = 1,
    stackLevel = 0
  ): OCPP16ChargingProfile => ({
    chargingProfileId,
    chargingProfileKind: OCPP16ChargingProfileKindType.ABSOLUTE,
    chargingProfilePurpose: OCPP16ChargingProfilePurposeType.TX_DEFAULT_PROFILE,
    chargingSchedule: {
      chargingRateUnit: OCPP16ChargingRateUnitType.AMPERE,
      chargingSchedulePeriod: [{ limit: 32, startPeriod: 0 }],
    },
    stackLevel,
  }),

  createTxProfile: (
    chargingProfileId = 2,
    transactionId?: number
  ): OCPP16ChargingProfile => ({
    chargingProfileId,
    chargingProfileKind: OCPP16ChargingProfileKindType.RELATIVE,
    chargingProfilePurpose: OCPP16ChargingProfilePurposeType.TX_PROFILE,
    chargingSchedule: {
      chargingRateUnit: OCPP16ChargingRateUnitType.AMPERE,
      chargingSchedulePeriod: [{ limit: 16, startPeriod: 0 }],
    },
    stackLevel: 0,
    ...(transactionId != null && { transactionId }),
  }),
} as const

export const ReservationFixtures = {
  createReservation: (
    connectorId = 1,
    reservationId = 1,
    idTag = 'TEST-TAG-001',
    expiryDate = new Date(Date.now() + 3600000)
  ) => ({
    connectorId,
    expiryDate,
    idTag,
    reservationId,
  }),
} as const

export const ResetFixtures = {
  createStandardStation: (runningTransactions = 0): MockChargingStation => {
    const station = createStandardStation({ stationInfo: { resetTime: 5000 } })
    station.getNumberOfRunningTransactions = () => runningTransactions
    station.reset = () => Promise.resolve()
    return station
  },

  createStationWithTransaction: (): MockChargingStation => {
    return ResetFixtures.createStandardStation(1)
  },
} as const

export const TransactionFixtures = {
  createStartTransactionParams: (
    connectorId = 1,
    idTag = 'TEST-TAG-001'
  ) => ({
    connectorId,
    idTag,
  }),

  createStopTransactionParams: (transactionId = 1) => ({
    transactionId,
  }),
} as const
