import type { ChargingStation } from './ChargingStation.js'

import {
  type ConfigurationKey,
  type ConfigurationKeyType,
  OCPPVersion,
  StandardParametersKey,
} from '../types/index.js'
import { logger } from '../utils/index.js'

const OCPP2_PARAMETER_KEY_MAP: Partial<Record<ConfigurationKeyType, ConfigurationKeyType>> = {
  [StandardParametersKey.AuthorizeRemoteTxRequests]: StandardParametersKey.AuthorizeRemoteStart,
  [StandardParametersKey.ConnectionTimeOut]: StandardParametersKey.EVConnectionTimeOut,
  [StandardParametersKey.LocalAuthorizeOffline]: StandardParametersKey.LocalAuthorizationOffline,
  [StandardParametersKey.LocalPreAuthorize]: StandardParametersKey.LocalPreAuthorization,
  [StandardParametersKey.MeterValueSampleInterval]: StandardParametersKey.TxUpdatedInterval,
  [StandardParametersKey.MeterValuesSampledData]: StandardParametersKey.TxUpdatedMeasurands,
}

const resolveKey = (
  chargingStation: ChargingStation,
  key: ConfigurationKeyType
): ConfigurationKeyType => {
  const version = chargingStation.stationInfo?.ocppVersion
  if (version === OCPPVersion.VERSION_20 || version === OCPPVersion.VERSION_201) {
    return OCPP2_PARAMETER_KEY_MAP[key] ?? key
  }
  return key
}

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

const matchesConfigurationKey = (
  configElement: ConfigurationKey,
  key: ConfigurationKeyType,
  caseInsensitive: boolean
): boolean =>
  caseInsensitive
    ? configElement.key.toLowerCase() === key.toLowerCase()
    : configElement.key === key

export const getConfigurationKey = (
  chargingStation: ChargingStation,
  key: ConfigurationKeyType,
  caseInsensitive = false
): ConfigurationKey | undefined => {
  if (!Array.isArray(chargingStation.ocppConfiguration?.configurationKey)) return undefined
  const resolvedKey = resolveKey(chargingStation, key)
  return chargingStation.ocppConfiguration.configurationKey.find(configElement =>
    matchesConfigurationKey(configElement, resolvedKey, caseInsensitive)
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
  const resolvedKey = resolveKey(chargingStation, key)
  return chargingStation.ocppConfiguration.configurationKey.findIndex(configElement =>
    matchesConfigurationKey(configElement, resolvedKey, caseInsensitive)
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
      const configurationKey = chargingStation.ocppConfiguration.configurationKey[keyIndex]
      if (options.reboot != null && configurationKey.reboot !== options.reboot) {
        configurationKey.reboot = options.reboot
      }
      if (options.readonly != null && configurationKey.readonly !== options.readonly) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        configurationKey.readonly = options.readonly!
      }
      if (options.visible != null && configurationKey.visible !== options.visible) {
        configurationKey.visible = options.visible
      }
      logger.error(
        `${chargingStation.logPrefix()} Trying to add an already existing configuration key: %j`,
        chargingStation.ocppConfiguration.configurationKey[keyIndex]
      )
      return
    }
  } else {
    chargingStation.ocppConfiguration.configurationKey.push({
      key: resolveKey(chargingStation, key),
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
