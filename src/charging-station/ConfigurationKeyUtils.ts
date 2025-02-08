import type { ConfigurationKey, ConfigurationKeyType } from '../types/index.js'
import type { ChargingStation } from './ChargingStation.js'

import { logger } from '../utils/index.js'

interface AddConfigurationKeyParams {
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
  return chargingStation.ocppConfiguration?.configurationKey?.find(configElement => {
    if (caseInsensitive) {
      return configElement.key.toLowerCase() === key.toLowerCase()
    }
    return configElement.key === key
  })
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
  params = { ...{ overwrite: false, save: false }, ...params }
  let keyFound = getConfigurationKey(chargingStation, key)
  if (keyFound != null && params.overwrite) {
    deleteConfigurationKey(chargingStation, keyFound.key, {
      save: false,
    })
    keyFound = undefined
  }
  if (keyFound == null) {
    chargingStation.ocppConfiguration?.configurationKey?.push({
      key,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      readonly: options.readonly!,
      reboot: options.reboot,
      value,
      visible: options.visible,
    })
    params.save && chargingStation.saveOcppConfiguration()
  } else {
    logger.error(
      `${chargingStation.logPrefix()} Trying to add an already existing configuration key: %j`,
      keyFound
    )
  }
}

export const setConfigurationKeyValue = (
  chargingStation: ChargingStation,
  key: ConfigurationKeyType,
  value: string,
  caseInsensitive = false
): ConfigurationKey | undefined => {
  const keyFound = getConfigurationKey(chargingStation, key, caseInsensitive)
  if (keyFound != null) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    chargingStation.ocppConfiguration!.configurationKey![
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      chargingStation.ocppConfiguration!.configurationKey!.indexOf(keyFound)
    ].value = value
    chargingStation.saveOcppConfiguration()
  } else {
    logger.error(
      `${chargingStation.logPrefix()} Trying to set a value on a non existing configuration key: %j`,
      { key, value }
    )
  }
  return keyFound
}

export const deleteConfigurationKey = (
  chargingStation: ChargingStation,
  key: ConfigurationKeyType,
  params?: DeleteConfigurationKeyParams
): ConfigurationKey[] | undefined => {
  params = { ...{ caseInsensitive: false, save: true }, ...params }
  const keyFound = getConfigurationKey(chargingStation, key, params.caseInsensitive)
  if (keyFound != null) {
    const deletedConfigurationKey = chargingStation.ocppConfiguration?.configurationKey?.splice(
      chargingStation.ocppConfiguration.configurationKey.indexOf(keyFound),
      1
    )
    params.save && chargingStation.saveOcppConfiguration()
    return deletedConfigurationKey
  }
}
