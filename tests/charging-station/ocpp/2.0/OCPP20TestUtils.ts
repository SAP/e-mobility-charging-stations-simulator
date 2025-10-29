import type { ChargingStation } from '../../../../src/charging-station/ChargingStation.js'
import type { ConfigurationKey } from '../../../../src/types/ChargingStationOcppConfiguration.js'

import { OCPP20RequiredVariableName } from '../../../../src/types/index.js'

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
  upsertConfigurationKey(chargingStation, OCPP20RequiredVariableName.ReportingValueSize, '2500')
}

/**
 * Reset configuration/storage value size limits to generous defaults.
 * Applies both ConfigurationValueSize and ValueSize (DeviceDataCtrlr).
 * @param chargingStation Charging station instance.
 */
export function resetValueSizeLimits (chargingStation: ChargingStation) {
  upsertConfigurationKey(chargingStation, OCPP20RequiredVariableName.ConfigurationValueSize, '2500')
  upsertConfigurationKey(chargingStation, OCPP20RequiredVariableName.ValueSize, '2500')
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
