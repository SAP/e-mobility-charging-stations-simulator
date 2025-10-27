import type { ConfigurationKey, ConfigurationKeyType } from '../types/index.js'
import type { ChargingStation } from './ChargingStation.js'

import { logger } from '../utils/index.js'

interface AddConfigurationKeyParams {
  caseInsensitive?: boolean
  overwrite?: boolean
  save?: boolean
}
interface ConfigurationKeyOptions {
  readonly?: boolean
  reboot?: boolean
  visible?: boolean
}
interface DeleteConfigurationKeyParams {
  caseInsensitive?: boolean
  save?: boolean
}

export const getConfigurationKey = (
  chargingStation: ChargingStation,
  key: ConfigurationKeyType,
  caseInsensitive = false
): ConfigurationKey | undefined => {
  if (!Array.isArray(chargingStation.ocppConfiguration?.configurationKey)) return undefined
  return chargingStation.ocppConfiguration.configurationKey.find(configElement =>
    caseInsensitive
      ? configElement.key.toLowerCase() === key.toLowerCase()
      : configElement.key === key
  )
}

const getConfigurationKeyIndex = (
  chargingStation: ChargingStation,
  key: ConfigurationKeyType,
  caseInsensitive = false
): number => {
  if (!Array.isArray(chargingStation.ocppConfiguration?.configurationKey)) {
    return -1
  }
  return chargingStation.ocppConfiguration.configurationKey.findIndex(configElement =>
    caseInsensitive
      ? configElement.key.toLowerCase() === key.toLowerCase()
      : configElement.key === key
  )
}

export const addConfigurationKey = (
  chargingStation: ChargingStation,
  key: ConfigurationKeyType,
  value: string,
  options?: ConfigurationKeyOptions,
  params?: AddConfigurationKeyParams
): void => {
  options = {
    ...{
      readonly: false,
      reboot: false,
      visible: true,
    },
    ...options,
  }
  params = { ...{ caseInsensitive: false, overwrite: false, save: false }, ...params }
  if (!Array.isArray(chargingStation.ocppConfiguration?.configurationKey)) {
    return
  }
  const keyIndex = getConfigurationKeyIndex(chargingStation, key, params.caseInsensitive)
  if (keyIndex !== -1) {
    if (params.overwrite) {
      chargingStation.ocppConfiguration.configurationKey[keyIndex] = {
        ...chargingStation.ocppConfiguration.configurationKey[keyIndex],
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        readonly: options.readonly!,
        reboot: options.reboot,
        value,
        visible: options.visible,
      }
    } else {
      // Allow metadata update (e.g. reboot flag) without overwriting value when overwrite=false
      const existing = chargingStation.ocppConfiguration.configurationKey[keyIndex]
      if (options.reboot && existing.reboot !== options.reboot) {
        existing.reboot = options.reboot
      }
      if (options.readonly != null && existing.readonly !== options.readonly) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        existing.readonly = options.readonly!
      }
      if (options.visible != null && existing.visible !== options.visible) {
        existing.visible = options.visible
      }
      logger.error(
        `${chargingStation.logPrefix()} Trying to add an already existing configuration key: %j`,
        chargingStation.ocppConfiguration.configurationKey[keyIndex]
      )
      return
    }
  } else {
    chargingStation.ocppConfiguration.configurationKey.push({
      key,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      readonly: options.readonly!,
      reboot: options.reboot,
      value,
      visible: options.visible,
    })
  }
  params.save && chargingStation.saveOcppConfiguration()
}

export const setConfigurationKeyValue = (
  chargingStation: ChargingStation,
  key: ConfigurationKeyType,
  value: string,
  caseInsensitive = false
): ConfigurationKey | undefined => {
  if (!Array.isArray(chargingStation.ocppConfiguration?.configurationKey)) {
    return undefined
  }
  const keyIndex = getConfigurationKeyIndex(chargingStation, key, caseInsensitive)
  if (keyIndex !== -1) {
    const keyFound = chargingStation.ocppConfiguration.configurationKey[keyIndex]
    keyFound.value = value
    chargingStation.saveOcppConfiguration()
    return keyFound
  }
  logger.error(
    `${chargingStation.logPrefix()} Trying to set a value on a non existing configuration key: %j`,
    { key, value }
  )
  return undefined
}

export const deleteConfigurationKey = (
  chargingStation: ChargingStation,
  key: ConfigurationKeyType,
  params?: DeleteConfigurationKeyParams
): ConfigurationKey[] | undefined => {
  params = { ...{ caseInsensitive: false, save: true }, ...params }
  if (!Array.isArray(chargingStation.ocppConfiguration?.configurationKey)) {
    return undefined
  }
  const keyIndex = getConfigurationKeyIndex(chargingStation, key, params.caseInsensitive)
  if (keyIndex !== -1) {
    const deletedConfigurationKey = chargingStation.ocppConfiguration.configurationKey.splice(
      keyIndex,
      1
    )
    params.save && chargingStation.saveOcppConfiguration()
    return deletedConfigurationKey
  }
  return undefined
}

export const validateConfigurationValue = (
  variableName: string,
  value: string
): { additionalInfo?: string; valid: boolean } => {
  // Generic maximum length safeguard (OpenSpec tests expect oversize rejection ~1000 chars)
  if (value.length > 1000) {
    return { additionalInfo: 'Value exceeds maximum length (1000)', valid: false }
  }
  const positiveIntegerVariables = [
    'TxUpdatedInterval',
    'HeartbeatInterval',
    'EVConnectionTimeOut',
    'MessageTimeout',
  ]
  if (positiveIntegerVariables.includes(variableName)) {
    if (!/^[0-9]+$/.test(value) || parseInt(value, 10) <= 0) {
      return { additionalInfo: 'Positive integer > 0 required', valid: false }
    }
  }
  if (variableName === 'WebSocketPingInterval') {
    if (!/^[0-9]+$/.test(value) || parseInt(value, 10) < 0) {
      return { additionalInfo: 'Integer >= 0 required', valid: false }
    }
  }
  if (variableName === 'ConnectionUrl') {
    try {
      const url = new URL(value)
      if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) {
        return { additionalInfo: 'Unsupported URL scheme', valid: false }
      }
    } catch {
      return { additionalInfo: 'Invalid URL format', valid: false }
    }
  }
  return { valid: true }
}
