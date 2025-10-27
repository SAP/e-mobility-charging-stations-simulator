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
  upsertConfigurationKey(chargingStation, OCPP20RequiredVariableName.ReportingValueSize, '1000')
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
  const existing = configKeys.find(k => k.key === key)
  if (existing) {
    existing.value = value
    if (readonly) existing.readonly = readonly
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
