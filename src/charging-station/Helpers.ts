import type { EventEmitter } from 'node:events'

import { basename, dirname, isAbsolute, join, parse, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { ChargingStation } from './ChargingStation.js'

import { BaseError } from '../exception/index.js'
import {
  AmpereUnits,
  type ChargingStationConfiguration,
  type ChargingStationInfo,
  type ChargingStationOptions,
  type ChargingStationTemplate,
  type ChargingStationWorkerMessageEvents,
  ConnectorPhaseRotation,
  type ConnectorStatus,
  CurrentType,
  type EvseTemplate,
  OCPPVersion,
  PowerUnits,
  StandardParametersKey,
  type SupportedFeatureProfiles,
  Voltage,
} from '../types/index.js'
import { clone, isEmpty, isNotEmptyArray, logger, secureRandom } from '../utils/index.js'
import { getConfigurationKey } from './ConfigurationKeyUtils.js'

const moduleName = 'Helpers'

export const buildTemplateName = (templateFile: string): string => {
  if (isAbsolute(templateFile)) {
    templateFile = relative(
      resolve(join(dirname(fileURLToPath(import.meta.url)), 'assets', 'station-templates')),
      templateFile
    )
  }
  const templateFileParsedPath = parse(templateFile)
  return join(templateFileParsedPath.dir, templateFileParsedPath.name)
}

export {
  canProceedChargingProfile,
  getChargingStationChargingProfilesLimit,
  getConnectorChargingProfiles,
  getConnectorChargingProfilesLimit,
  prepareChargingProfileKind,
} from './HelpersChargingProfile.js'
export {
  buildConnectorsMap,
  checkStationInfoConnectorStatus,
  getBootConnectorStatus,
  initializeConnectorsMapStatus,
  prepareConnectorStatus,
  resetAuthorizeConnectorStatus,
  resetConnectorStatus,
} from './HelpersConnectorStatus.js'
export {
  type ChargingStationNameTemplate,
  createSerialNumber,
  getChargingStationId,
  getHashId,
  propagateSerialNumber,
} from './HelpersId.js'
export {
  hasPendingReservation,
  hasPendingReservations,
  hasReservationExpired,
  removeExpiredReservations,
} from './HelpersReservation.js'

export const validateStationInfo = (chargingStation: ChargingStation): void => {
  if (chargingStation.stationInfo == null || isEmpty(chargingStation.stationInfo)) {
    throw new BaseError('Missing charging station information')
  }
  if (
    chargingStation.stationInfo.chargingStationId == null ||
    isEmpty(chargingStation.stationInfo.chargingStationId)
  ) {
    throw new BaseError('Missing chargingStationId in stationInfo properties')
  }
  const chargingStationId = chargingStation.stationInfo.chargingStationId
  if (
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    chargingStation.stationInfo.hashId == null ||
    isEmpty(chargingStation.stationInfo.hashId)
  ) {
    throw new BaseError(`${chargingStationId}: Missing hashId in stationInfo properties`)
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (chargingStation.stationInfo.templateIndex == null) {
    throw new BaseError(`${chargingStationId}: Missing templateIndex in stationInfo properties`)
  }
  if (chargingStation.stationInfo.templateIndex <= 0) {
    throw new BaseError(
      `${chargingStationId}: Invalid templateIndex value in stationInfo properties`
    )
  }
  if (
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    chargingStation.stationInfo.templateName == null ||
    isEmpty(chargingStation.stationInfo.templateName)
  ) {
    throw new BaseError(`${chargingStationId}: Missing templateName in stationInfo properties`)
  }
  if (chargingStation.stationInfo.maximumPower == null) {
    throw new BaseError(`${chargingStationId}: Missing maximumPower in stationInfo properties`)
  }
  if (chargingStation.stationInfo.maximumPower <= 0) {
    throw new RangeError(
      `${chargingStationId}: Invalid maximumPower value in stationInfo properties`
    )
  }
  if (chargingStation.stationInfo.maximumAmperage == null) {
    throw new BaseError(`${chargingStationId}: Missing maximumAmperage in stationInfo properties`)
  }
  if (chargingStation.stationInfo.maximumAmperage <= 0) {
    throw new RangeError(
      `${chargingStationId}: Invalid maximumAmperage value in stationInfo properties`
    )
  }
  switch (chargingStation.stationInfo.ocppVersion) {
    case OCPPVersion.VERSION_20:
    case OCPPVersion.VERSION_201:
      if (chargingStation.getNumberOfEvses() === 0) {
        throw new BaseError(
          `${chargingStationId}: OCPP ${chargingStation.stationInfo.ocppVersion} requires at least one EVSE defined in the charging station template/configuration`
        )
      }
  }
}

export const checkChargingStationState = (
  chargingStation: ChargingStation,
  logPrefix: string
): boolean => {
  if (!chargingStation.started && !chargingStation.starting) {
    logger.warn(
      `${logPrefix} ${moduleName}.checkChargingStationState: Charging station is stopped, cannot proceed`
    )
    return false
  }
  return true
}

export const getPhaseRotationValue = (
  connectorId: number,
  numberOfPhases: number
): string | undefined => {
  // AC/DC
  if (connectorId === 0 && numberOfPhases === 0) {
    return `${connectorId.toString()}.${ConnectorPhaseRotation.RST}`
  } else if (connectorId > 0 && numberOfPhases === 0) {
    return `${connectorId.toString()}.${ConnectorPhaseRotation.NotApplicable}`
    // AC
  } else if (connectorId >= 0 && numberOfPhases === 1) {
    return `${connectorId.toString()}.${ConnectorPhaseRotation.NotApplicable}`
  } else if (connectorId >= 0 && numberOfPhases === 3) {
    return `${connectorId.toString()}.${ConnectorPhaseRotation.RST}`
  }
  return undefined
}

export const getMaxNumberOfEvses = (evses: Record<string, EvseTemplate> | undefined): number => {
  if (evses == null) {
    return -1
  }
  return isEmpty(evses) ? 0 : Object.keys(evses).length
}

export const getDefaultConnectorMaximumPower = (
  stationTemplate: ChargingStationTemplate
): number | undefined => {
  let maximumPower: number | undefined
  if (isNotEmptyArray<number>(stationTemplate.power)) {
    const powerArrayRandomIndex = Math.floor(secureRandom() * stationTemplate.power.length)
    maximumPower =
      stationTemplate.powerUnit === PowerUnits.KILO_WATT
        ? stationTemplate.power[powerArrayRandomIndex] * 1000
        : stationTemplate.power[powerArrayRandomIndex]
  } else if (typeof stationTemplate.power === 'number') {
    maximumPower =
      stationTemplate.powerUnit === PowerUnits.KILO_WATT
        ? stationTemplate.power * 1000
        : stationTemplate.power
  }
  if (maximumPower == null) {
    return undefined
  }
  if (stationTemplate.powerSharedByConnectors === true) {
    return maximumPower
  }
  const staticCount =
    stationTemplate.Evses != null
      ? // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      getMaxNumberOfEvses(stationTemplate.Evses) - (stationTemplate.Evses['0'] != null ? 1 : 0)
      : getMaxNumberOfConnectors(stationTemplate.Connectors) -
        (stationTemplate.Connectors?.['0'] != null ? 1 : 0)
  return staticCount > 0 ? maximumPower / staticCount : undefined
}

export const getMaxNumberOfConnectors = (
  connectors: Record<string, ConnectorStatus> | undefined
): number => {
  if (connectors == null) {
    return -1
  }
  return isEmpty(connectors) ? 0 : Object.keys(connectors).length
}

export const checkConfiguration = (
  stationConfiguration: ChargingStationConfiguration | undefined,
  logPrefix: string,
  configurationFile: string
): void => {
  if (stationConfiguration == null) {
    const errorMsg = `Failed to read charging station configuration file ${configurationFile}`
    logger.error(`${logPrefix} ${moduleName}.checkConfiguration: ${errorMsg}`)
    throw new BaseError(errorMsg)
  }
  if (isEmpty(stationConfiguration)) {
    const errorMsg = `Empty charging station configuration from file ${configurationFile}`
    logger.error(`${logPrefix} ${moduleName}.checkConfiguration: ${errorMsg}`)
    throw new BaseError(errorMsg)
  }
}

export const setChargingStationOptions = (
  stationInfo: ChargingStationInfo,
  options?: ChargingStationOptions
): ChargingStationInfo => {
  if (options?.supervisionUrls != null) {
    stationInfo.supervisionUrls = options.supervisionUrls
  }
  if (options?.supervisionUser != null) {
    stationInfo.supervisionUser = options.supervisionUser
  }
  if (options?.supervisionPassword != null) {
    stationInfo.supervisionPassword = options.supervisionPassword
  }
  if (options?.persistentConfiguration != null) {
    stationInfo.stationInfoPersistentConfiguration = options.persistentConfiguration
    stationInfo.ocppPersistentConfiguration = options.persistentConfiguration
    stationInfo.automaticTransactionGeneratorPersistentConfiguration =
      options.persistentConfiguration
  }
  if (options?.autoStart != null) {
    stationInfo.autoStart = options.autoStart
  }
  if (options?.autoRegister != null) {
    stationInfo.autoRegister = options.autoRegister
  }
  if (options?.enableStatistics != null) {
    stationInfo.enableStatistics = options.enableStatistics
  }
  if (options?.ocppStrictCompliance != null) {
    stationInfo.ocppStrictCompliance = options.ocppStrictCompliance
  }
  if (options?.stopTransactionsOnStopped != null) {
    stationInfo.stopTransactionsOnStopped = options.stopTransactionsOnStopped
  }
  if (options?.baseName != null) {
    stationInfo.baseName = options.baseName
  }
  if (options?.fixedName != null) {
    stationInfo.fixedName = options.fixedName
  }
  if (options?.nameSuffix != null) {
    stationInfo.nameSuffix = options.nameSuffix
  }
  return stationInfo
}

export const stationTemplateToStationInfo = (
  stationTemplate: ChargingStationTemplate
): ChargingStationInfo => {
  stationTemplate = clone(stationTemplate)
  delete stationTemplate.power
  delete stationTemplate.powerUnit
  delete stationTemplate.Connectors
  delete stationTemplate.Evses
  delete stationTemplate.Configuration
  delete stationTemplate.AutomaticTransactionGenerator
  delete stationTemplate.numberOfConnectors
  delete stationTemplate.chargeBoxSerialNumberPrefix
  delete stationTemplate.chargePointSerialNumberPrefix
  delete stationTemplate.meterSerialNumberPrefix
  return stationTemplate as ChargingStationInfo
}

export const hasFeatureProfile = (
  chargingStation: ChargingStation,
  featureProfile: SupportedFeatureProfiles
): boolean => {
  return !!getConfigurationKey(
    chargingStation,
    StandardParametersKey.SupportedFeatureProfiles
  )?.value?.includes(featureProfile)
}

export const getAmperageLimitationUnitDivider = (stationInfo: ChargingStationInfo): number => {
  let unitDivider = 1
  switch (stationInfo.amperageLimitationUnit) {
    case AmpereUnits.CENTI_AMPERE:
      unitDivider = 100
      break
    case AmpereUnits.DECI_AMPERE:
      unitDivider = 10
      break
    case AmpereUnits.MILLI_AMPERE:
      unitDivider = 1000
      break
  }
  return unitDivider
}

export const getDefaultVoltageOut = (
  currentType: CurrentType,
  logPrefix: string,
  templateFile: string
): Voltage => {
  const errorMsg = `Unknown ${currentType} currentOutType in template file ${templateFile}, cannot define default voltage out`
  let defaultVoltageOut: number
  switch (currentType) {
    case CurrentType.AC:
      defaultVoltageOut = Voltage.VOLTAGE_230
      break
    case CurrentType.DC:
      defaultVoltageOut = Voltage.VOLTAGE_400
      break
    default:
      logger.error(`${logPrefix} ${moduleName}.getDefaultVoltageOut: ${errorMsg}`)
      throw new BaseError(errorMsg)
  }
  return defaultVoltageOut
}

export const getIdTagsFile = (stationInfo: ChargingStationInfo): string | undefined => {
  return stationInfo.idTagsFile != null
    ? join(dirname(fileURLToPath(import.meta.url)), 'assets', basename(stationInfo.idTagsFile))
    : undefined
}

export const getEvProfilesFile = (stationInfo: ChargingStationInfo): string | undefined => {
  return stationInfo.evProfilesFile != null
    ? join(dirname(fileURLToPath(import.meta.url)), 'assets', basename(stationInfo.evProfilesFile))
    : undefined
}

export const waitChargingStationEvents = async (
  emitter: EventEmitter,
  event: ChargingStationWorkerMessageEvents,
  eventsToWait: number
): Promise<number> => {
  return await new Promise<number>(resolve => {
    let events = 0
    if (eventsToWait === 0) {
      resolve(events)
      return
    }
    const handler = () => {
      ++events
      if (events === eventsToWait) {
        emitter.off(event, handler)
        resolve(events)
      }
    }
    emitter.on(event, handler)
  })
}

export const getConfiguredMaxNumberOfConnectors = (
  stationTemplate: ChargingStationTemplate
): number => {
  const picked = pickConfiguredNumberOfConnectors(stationTemplate.numberOfConnectors)
  if (picked != null) {
    return picked
  }
  let configuredMaxNumberOfConnectors = 0
  if (stationTemplate.Connectors != null && stationTemplate.Evses == null) {
    configuredMaxNumberOfConnectors =
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      stationTemplate.Connectors[0] != null
        ? getMaxNumberOfConnectors(stationTemplate.Connectors) - 1
        : getMaxNumberOfConnectors(stationTemplate.Connectors)
  } else if (stationTemplate.Evses != null && stationTemplate.Connectors == null) {
    for (const [evseId, evseTemplate] of Object.entries(stationTemplate.Evses)) {
      if (evseId === '0') continue
      configuredMaxNumberOfConnectors += getMaxNumberOfConnectors(evseTemplate.Connectors)
    }
  }
  return configuredMaxNumberOfConnectors
}

/**
 * Worst-case upper bound on the configured connector count from the
 * `numberOfConnectors` template field. Used at validation time to decide
 * whether `randomConnectors` must be auto-enabled (i.e. whether *any*
 * runtime random pick could exceed the connector definitions).
 * @param numberOfConnectors - Template `numberOfConnectors` field value
 * @returns Upper bound, or `undefined` when the field is not set
 */
export const getMaxConfiguredNumberOfConnectors = (
  numberOfConnectors: number | readonly number[] | undefined
): number | undefined => {
  if (isNotEmptyArray<number>(numberOfConnectors)) {
    return Math.max(...numberOfConnectors)
  }
  if (typeof numberOfConnectors === 'number') {
    return numberOfConnectors
  }
  return undefined
}

/**
 * Random pick from the `numberOfConnectors` template field. Used at
 * runtime to materialize the actual connector count for one station
 * instance.
 * @param numberOfConnectors - Template `numberOfConnectors` field value
 * @returns Picked count, or `undefined` when the field is not set
 */
export const pickConfiguredNumberOfConnectors = (
  numberOfConnectors: number | readonly number[] | undefined
): number | undefined => {
  if (isNotEmptyArray<number>(numberOfConnectors)) {
    return numberOfConnectors[Math.floor(secureRandom() * numberOfConnectors.length)]
  }
  if (typeof numberOfConnectors === 'number') {
    return numberOfConnectors
  }
  return undefined
}
