/**
 * @file Connector-status helpers for mock ChargingStation construction.
 */

import type { ConnectorStatus } from '../../../src/types/index.js'
import type {
  CreateConnectorStatusOptions,
  MockChargingStationOptions,
} from './StationHelpers.types.js'

import { AvailabilityType, ConnectorStatusEnum, OCPPVersion } from '../../../src/types/index.js'

/**
 * Create a connector status object with default values
 *
 * This is the canonical factory for creating ConnectorStatus objects in tests.
 * @param _connectorId - Connector ID (unused; factory creates default connector status)
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
  }
}

/**
 * Determines whether EVSEs should be used based on configuration
 * @param options - Configuration options to check
 * @returns True if EVSEs should be used, false otherwise
 */
export function determineEvseUsage (options: MockChargingStationOptions): boolean {
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
