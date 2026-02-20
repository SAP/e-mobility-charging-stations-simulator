import type { ChargingStation } from '../../../../src/charging-station/ChargingStation.js'
import type { ConfigurationKey } from '../../../../src/types/ChargingStationOcppConfiguration.js'

import { ConnectorStatusEnum, OCPP20RequiredVariableName } from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'

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
