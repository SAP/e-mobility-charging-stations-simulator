import type { EventEmitter } from 'node:events'

import {
  addDays,
  addSeconds,
  addWeeks,
  differenceInDays,
  differenceInSeconds,
  differenceInWeeks,
  type Interval,
  isAfter,
  isBefore,
  isDate,
  isPast,
  isWithinInterval,
  toDate,
} from 'date-fns'
import { maxTime } from 'date-fns/constants'
import { hash, randomBytes } from 'node:crypto'
import { basename, dirname, isAbsolute, join, parse, relative, resolve } from 'node:path'
import { env } from 'node:process'
import { fileURLToPath } from 'node:url'

import type { ChargingStation } from './ChargingStation.js'

import { BaseError } from '../exception/index.js'
import {
  AmpereUnits,
  AvailabilityType,
  type ChargingProfile,
  ChargingProfileKindType,
  ChargingProfilePurposeType,
  ChargingRateUnitType,
  type ChargingSchedule,
  type ChargingSchedulePeriod,
  type ChargingStationConfiguration,
  type ChargingStationInfo,
  type ChargingStationOptions,
  type ChargingStationTemplate,
  type ChargingStationWorkerMessageEvents,
  ConnectorPhaseRotation,
  type ConnectorStatus,
  ConnectorStatusEnum,
  CurrentType,
  type EvseTemplate,
  OCPPVersion,
  RecurrencyKindType,
  type Reservation,
  ReservationTerminationReason,
  StandardParametersKey,
  type SupportedFeatureProfiles,
  Voltage,
} from '../types/index.js'
import {
  ACElectricUtils,
  clone,
  Constants,
  convertToDate,
  convertToInt,
  DCElectricUtils,
  isArraySorted,
  isEmpty,
  isNotEmptyArray,
  isNotEmptyString,
  isValidDate,
  logger,
  secureRandom,
} from '../utils/index.js'
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

export type ChargingStationNameTemplate = Pick<ChargingStationTemplate, 'baseName' | 'fixedName' | 'nameSuffix'>

export const getChargingStationId = (
  index: number,
  nameTemplate: ChargingStationNameTemplate | undefined
): string => {
  if (nameTemplate == null) {
    return "Unknown 'chargingStationId'"
  }
  // In case of multiple instances: add instance index to charging station id
  const instanceIndex = env.CF_INSTANCE_INDEX ?? 0
  const idSuffix = nameTemplate.nameSuffix ?? ''
  const idStr = `000000000${index.toString()}`
  return nameTemplate.fixedName === true
    ? nameTemplate.baseName
    : `${nameTemplate.baseName}-${instanceIndex.toString()}${idStr.substring(
        idStr.length - 4
      )}${idSuffix}`
}

export const hasReservationExpired = (reservation: Reservation): boolean => {
  return isPast(reservation.expiryDate)
}

/**
 * Checks if a connector has a pending (non-expired) reservation.
 * @param connectorStatus - The connector status to check
 * @returns true if the connector has a pending reservation, false otherwise
 */
export const hasPendingReservation = (connectorStatus: ConnectorStatus): boolean => {
  return connectorStatus.reservation != null && !hasReservationExpired(connectorStatus.reservation)
}

/**
 * Checks if a charging station has any pending (non-expired) reservations.
 * @param chargingStation - The charging station to check
 * @returns true if any connector has a pending reservation, false otherwise
 */
export const hasPendingReservations = (chargingStation: ChargingStation): boolean => {
  for (const { connectorStatus } of chargingStation.iterateConnectors()) {
    if (hasPendingReservation(connectorStatus)) {
      return true
    }
  }
  return false
}

export const removeExpiredReservations = async (
  chargingStation: ChargingStation
): Promise<void> => {
  const reservations: Reservation[] = []
  for (const { connectorStatus } of chargingStation.iterateConnectors()) {
    if (connectorStatus.reservation != null && hasReservationExpired(connectorStatus.reservation)) {
      reservations.push(connectorStatus.reservation)
    }
  }
  const results = await Promise.allSettled(
    reservations.map(reservation =>
      chargingStation.removeReservation(reservation, ReservationTerminationReason.EXPIRED)
    )
  )
  let failureCount = 0
  for (const result of results) {
    if (result.status === 'rejected') {
      ++failureCount
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.removeExpiredReservations: reservation removal failed: ${String(result.reason)}`
      )
    }
  }
  if (failureCount > 0) {
    logger.error(
      `${chargingStation.logPrefix()} ${moduleName}.removeExpiredReservations: ${failureCount.toString()}/${reservations.length.toString()} expired reservation removal(s) failed`
    )
  }
}

export const getHashId = (
  index: number,
  stationTemplate: ChargingStationTemplate,
  chargingStationIdOverride?: string
): string => {
  const chargingStationInfo = {
    chargePointModel: stationTemplate.chargePointModel,
    chargePointVendor: stationTemplate.chargePointVendor,
    ...(stationTemplate.chargeBoxSerialNumberPrefix != null && {
      chargeBoxSerialNumber: stationTemplate.chargeBoxSerialNumberPrefix,
    }),
    ...(stationTemplate.chargePointSerialNumberPrefix != null && {
      chargePointSerialNumber: stationTemplate.chargePointSerialNumberPrefix,
    }),
    ...(stationTemplate.meterSerialNumberPrefix != null && {
      meterSerialNumber: stationTemplate.meterSerialNumberPrefix,
    }),
    ...(stationTemplate.meterType != null && {
      meterType: stationTemplate.meterType,
    }),
  }
  return hash(
    Constants.DEFAULT_HASH_ALGORITHM,
    `${JSON.stringify(chargingStationInfo)}${
      chargingStationIdOverride ?? getChargingStationId(index, stationTemplate)
    }`,
    'hex'
  )
}

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
    logger.warn(`${logPrefix} charging station is stopped, cannot proceed`)
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

const getMaxNumberOfConnectors = (
  connectors: Record<string, ConnectorStatus> | undefined
): number => {
  if (connectors == null) {
    return -1
  }
  return isEmpty(connectors) ? 0 : Object.keys(connectors).length
}

export const getBootConnectorStatus = (
  chargingStation: ChargingStation,
  connectorId: number,
  connectorStatus: ConnectorStatus
): ConnectorStatusEnum => {
  if (
    !chargingStation.isChargingStationAvailable() ||
    !chargingStation.isConnectorAvailable(connectorId)
  ) {
    return ConnectorStatusEnum.Unavailable
  }
  if (connectorStatus.transactionStarted === true && connectorStatus.status != null) {
    return connectorStatus.status
  }
  if (connectorStatus.bootStatus != null) {
    return connectorStatus.bootStatus
  }
  return ConnectorStatusEnum.Available
}

export const checkTemplate = (
  stationTemplate: ChargingStationTemplate | undefined,
  logPrefix: string,
  templateFile: string
): void => {
  if (stationTemplate == null) {
    const errorMsg = `Failed to read charging station template file ${templateFile}`
    logger.error(`${logPrefix} ${errorMsg}`)
    throw new BaseError(errorMsg)
  }
  if (isEmpty(stationTemplate)) {
    const errorMsg = `Empty charging station information from template file ${templateFile}`
    logger.error(`${logPrefix} ${errorMsg}`)
    throw new BaseError(errorMsg)
  }
  if (stationTemplate.idTagsFile == null || isEmpty(stationTemplate.idTagsFile)) {
    logger.warn(
      `${logPrefix} Missing id tags file in template file ${templateFile}. That can lead to issues with the Automatic Transaction Generator`
    )
  }
}

export const checkConfiguration = (
  stationConfiguration: ChargingStationConfiguration | undefined,
  logPrefix: string,
  configurationFile: string
): void => {
  if (stationConfiguration == null) {
    const errorMsg = `Failed to read charging station configuration file ${configurationFile}`
    logger.error(`${logPrefix} ${errorMsg}`)
    throw new BaseError(errorMsg)
  }
  if (isEmpty(stationConfiguration)) {
    const errorMsg = `Empty charging station configuration from file ${configurationFile}`
    logger.error(`${logPrefix} ${errorMsg}`)
    throw new BaseError(errorMsg)
  }
}

export const checkConnectorsConfiguration = (
  stationTemplate: ChargingStationTemplate,
  logPrefix: string,
  templateFile: string
): {
  configuredMaxConnectors: number
  templateMaxAvailableConnectors: number
  templateMaxConnectors: number
} => {
  const configuredMaxConnectors = getConfiguredMaxNumberOfConnectors(stationTemplate)
  checkConfiguredMaxConnectors(configuredMaxConnectors, logPrefix, templateFile)
  const templateMaxConnectors = getMaxNumberOfConnectors(stationTemplate.Connectors)
  checkTemplateMaxConnectors(templateMaxConnectors, logPrefix, templateFile)
  const templateMaxAvailableConnectors =
    stationTemplate.Connectors?.[0] != null ? templateMaxConnectors - 1 : templateMaxConnectors
  if (
    configuredMaxConnectors > templateMaxAvailableConnectors &&
    stationTemplate.randomConnectors !== true
  ) {
    logger.warn(
      `${logPrefix} Number of connectors exceeds the number of connector configurations in template ${templateFile}, forcing random connector configurations affectation`
    )
    stationTemplate.randomConnectors = true
  }
  return {
    configuredMaxConnectors,
    templateMaxAvailableConnectors,
    templateMaxConnectors,
  }
}

export const checkEvsesConfiguration = (
  stationTemplate: ChargingStationTemplate,
  logPrefix: string,
  templateFile: string
): void => {
  if (stationTemplate.Evses == null) {
    return
  }
  for (const evseKey in stationTemplate.Evses) {
    const evseId = convertToInt(evseKey)
    const connectorIds = Object.keys(stationTemplate.Evses[evseKey].Connectors).map(convertToInt)
    if (evseId === 0) {
      for (const connectorId of connectorIds) {
        if (connectorId !== 0) {
          throw new BaseError(
            `${logPrefix} Template ${templateFile} EVSE 0 has invalid connector id ${connectorId.toString()}, only connector id 0 is allowed (OCPP 2.0.1 §7.2)`
          )
        }
      }
    } else if (evseId > 0) {
      for (const connectorId of connectorIds) {
        if (connectorId < 1) {
          throw new BaseError(
            `${logPrefix} Template ${templateFile} EVSE ${evseId.toString()} has invalid connector id ${connectorId.toString()}, connector ids must start at 1 (OCPP 2.0.1 §7.2)`
          )
        }
      }
    }
  }
}

export const checkStationInfoConnectorStatus = (
  connectorId: number,
  connectorStatus: ConnectorStatus,
  logPrefix: string,
  templateFile: string
): void => {
  if (connectorStatus.status != null) {
    logger.warn(
      `${logPrefix} Charging station information from template ${templateFile} with connector id ${connectorId.toString()} status configuration defined, undefine it`
    )
    delete connectorStatus.status
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

export const buildConnectorsMap = (
  connectors: Record<string, ConnectorStatus>,
  logPrefix: string,
  templateFile: string
): Map<number, ConnectorStatus> => {
  const connectorsMap = new Map<number, ConnectorStatus>()
  if (getMaxNumberOfConnectors(connectors) > 0) {
    for (const [connectorKey, connectorStatus] of Object.entries(connectors)) {
      const connectorId = convertToInt(connectorKey)
      checkStationInfoConnectorStatus(connectorId, connectorStatus, logPrefix, templateFile)
      connectorsMap.set(connectorId, clone(connectorStatus))
    }
  } else {
    logger.warn(
      `${logPrefix} Charging station information from template ${templateFile} with no connectors, cannot build connectors map`
    )
  }
  return connectorsMap
}

export const initializeConnectorsMapStatus = (
  connectors: Map<number, ConnectorStatus>,
  logPrefix: string
): void => {
  for (const [connectorId, connectorStatus] of connectors) {
    if (connectorId > 0 && connectorStatus.transactionStarted === true) {
      logger.warn(
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `${logPrefix} Connector id ${connectorId.toString()} at initialization has a transaction started with id ${connectorStatus.transactionId?.toString()}`
      )
    }
    if (connectorId === 0) {
      connectorStatus.availability = AvailabilityType.Operative
      connectorStatus.chargingProfiles ??= []
    } else if (connectorId > 0 && connectorStatus.transactionStarted == null) {
      initializeConnectorStatus(connectorStatus)
    }
  }
}

export const resetAuthorizeConnectorStatus = (connectorStatus: ConnectorStatus): void => {
  connectorStatus.idTagLocalAuthorized = false
  connectorStatus.idTagAuthorized = false
  delete connectorStatus.localAuthorizeIdTag
  delete connectorStatus.authorizeIdTag
}

export const resetConnectorStatus = (connectorStatus: ConnectorStatus | undefined): void => {
  if (connectorStatus == null) {
    return
  }
  if (isNotEmptyArray(connectorStatus.chargingProfiles)) {
    connectorStatus.chargingProfiles = connectorStatus.chargingProfiles.filter(
      chargingProfile =>
        (chargingProfile.chargingProfilePurpose === ChargingProfilePurposeType.TX_PROFILE &&
          chargingProfile.transactionId != null &&
          connectorStatus.transactionId != null &&
          chargingProfile.transactionId !== connectorStatus.transactionId) ||
        chargingProfile.chargingProfilePurpose !== ChargingProfilePurposeType.TX_PROFILE
    )
  }
  resetAuthorizeConnectorStatus(connectorStatus)
  connectorStatus.transactionPending = false
  connectorStatus.transactionRemoteStarted = false
  connectorStatus.transactionStarted = false
  delete connectorStatus.transactionStart
  delete connectorStatus.transactionId
  delete connectorStatus.transactionIdTag
  delete connectorStatus.transactionGroupIdToken
  connectorStatus.transactionEnergyActiveImportRegisterValue = 0
  delete connectorStatus.transactionBeginMeterValue
  delete connectorStatus.transactionEndedMeterValues
  if (connectorStatus.transactionEndedMeterValuesSetInterval != null) {
    clearInterval(connectorStatus.transactionEndedMeterValuesSetInterval)
    delete connectorStatus.transactionEndedMeterValuesSetInterval
  }
  delete connectorStatus.transactionSeqNo
  delete connectorStatus.publicKeySentInTransaction
  delete connectorStatus.transactionEvseSent
  delete connectorStatus.transactionIdTokenSent
  delete connectorStatus.transactionDeauthorized
  delete connectorStatus.transactionDeauthorizedEnergyWh
}

export const prepareConnectorStatus = (connectorStatus: ConnectorStatus): ConnectorStatus => {
  if (connectorStatus.reservation != null) {
    const reservationExpiryDate = convertToDate(connectorStatus.reservation.expiryDate)
    if (reservationExpiryDate != null) {
      connectorStatus.reservation.expiryDate = reservationExpiryDate
    } else {
      delete connectorStatus.reservation
    }
  }
  if (isNotEmptyArray(connectorStatus.chargingProfiles)) {
    connectorStatus.chargingProfiles = connectorStatus.chargingProfiles
      .filter(
        chargingProfile =>
          chargingProfile.chargingProfilePurpose !== ChargingProfilePurposeType.TX_PROFILE
      )
      .map(chargingProfile => {
        const chargingSchedule = getSingleChargingSchedule(chargingProfile)
        if (chargingSchedule != null) {
          chargingSchedule.startSchedule =
            convertToDate(chargingSchedule.startSchedule) ?? new Date()
        }
        chargingProfile.validFrom = convertToDate(chargingProfile.validFrom)
        chargingProfile.validTo = convertToDate(chargingProfile.validTo)
        return chargingProfile
      })
  }
  return connectorStatus
}

export const warnTemplateKeysDeprecation = (
  stationTemplate: ChargingStationTemplate,
  logPrefix: string,
  templateFile: string
): void => {
  const templateKeys: { deprecatedKey: string; key?: string }[] = [
    { deprecatedKey: 'supervisionUrl', key: 'supervisionUrls' },
    { deprecatedKey: 'authorizationFile', key: 'idTagsFile' },
    { deprecatedKey: 'payloadSchemaValidation', key: 'ocppStrictCompliance' },
    { deprecatedKey: 'mustAuthorizeAtRemoteStart', key: 'remoteAuthorization' },
  ]
  for (const templateKey of templateKeys) {
    warnDeprecatedTemplateKey(
      stationTemplate,
      templateKey.deprecatedKey,
      logPrefix,
      templateFile,
      templateKey.key != null ? `Use '${templateKey.key}' instead` : undefined
    )
    convertDeprecatedTemplateKey(stationTemplate, templateKey.deprecatedKey, templateKey.key)
  }
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

export const createSerialNumber = (
  stationTemplate: ChargingStationTemplate,
  stationInfo: ChargingStationInfo,
  params?: {
    randomSerialNumber?: boolean
    randomSerialNumberUpperCase?: boolean
  }
): void => {
  params = {
    ...{ randomSerialNumber: true, randomSerialNumberUpperCase: true },
    ...params,
  }
  const serialNumberSuffix = params.randomSerialNumber
    ? getRandomSerialNumberSuffix({
      upperCase: params.randomSerialNumberUpperCase,
    })
    : ''
  isNotEmptyString(stationTemplate.chargePointSerialNumberPrefix) &&
    (stationInfo.chargePointSerialNumber = `${stationTemplate.chargePointSerialNumberPrefix}${serialNumberSuffix}`)
  isNotEmptyString(stationTemplate.chargeBoxSerialNumberPrefix) &&
    (stationInfo.chargeBoxSerialNumber = `${stationTemplate.chargeBoxSerialNumberPrefix}${serialNumberSuffix}`)
  isNotEmptyString(stationTemplate.meterSerialNumberPrefix) &&
    (stationInfo.meterSerialNumber = `${stationTemplate.meterSerialNumberPrefix}${serialNumberSuffix}`)
}

export const propagateSerialNumber = (
  stationTemplate: ChargingStationTemplate | undefined,
  stationInfoSrc: ChargingStationInfo | undefined,
  stationInfoDst: ChargingStationInfo
): void => {
  if (stationInfoSrc == null || stationTemplate == null) {
    throw new BaseError(
      'Missing charging station template or existing configuration to propagate serial number'
    )
  }
  stationTemplate.chargePointSerialNumberPrefix != null &&
  stationInfoSrc.chargePointSerialNumber != null
    ? (stationInfoDst.chargePointSerialNumber = stationInfoSrc.chargePointSerialNumber)
    : stationInfoDst.chargePointSerialNumber != null &&
      delete stationInfoDst.chargePointSerialNumber
  stationTemplate.chargeBoxSerialNumberPrefix != null &&
  stationInfoSrc.chargeBoxSerialNumber != null
    ? (stationInfoDst.chargeBoxSerialNumber = stationInfoSrc.chargeBoxSerialNumber)
    : stationInfoDst.chargeBoxSerialNumber != null && delete stationInfoDst.chargeBoxSerialNumber
  stationTemplate.meterSerialNumberPrefix != null && stationInfoSrc.meterSerialNumber != null
    ? (stationInfoDst.meterSerialNumber = stationInfoSrc.meterSerialNumber)
    : stationInfoDst.meterSerialNumber != null && delete stationInfoDst.meterSerialNumber
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

const getChargingStationChargingProfiles = (
  chargingStation: ChargingStation
): ChargingProfile[] => {
  return (chargingStation.getConnectorStatus(0)?.chargingProfiles ?? [])
    .filter(
      chargingProfile =>
        chargingProfile.chargingProfilePurpose ===
        ChargingProfilePurposeType.CHARGE_POINT_MAX_PROFILE
    )
    .sort((a, b) => b.stackLevel - a.stackLevel)
}

export const getChargingStationChargingProfilesLimit = (
  chargingStation: ChargingStation
): number | undefined => {
  const chargingProfiles = getChargingStationChargingProfiles(chargingStation)
  if (isNotEmptyArray(chargingProfiles)) {
    const chargingProfilesLimit = getChargingProfilesLimit(chargingStation, 0, chargingProfiles)
    if (chargingProfilesLimit != null) {
      const limit = buildChargingProfilesLimit(chargingStation, chargingProfilesLimit)
      const chargingStationMaximumPower = chargingStation.stationInfo?.maximumPower
      if (chargingStationMaximumPower == null) {
        return limit
      }
      if (limit > chargingStationMaximumPower) {
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.getChargingStationChargingProfilesLimit: Charging profile id ${getChargingProfileId(chargingProfilesLimit.chargingProfile)} limit ${limit.toString()} is greater than charging station maximum ${chargingStationMaximumPower.toString()}: %j`,
          chargingProfilesLimit
        )
        return chargingStationMaximumPower
      }
      return limit
    }
  }
}

/**
 * Gets the connector charging profiles relevant for power limitation shallow cloned
 * and sorted by priorities
 * @param chargingStation - Charging station
 * @param connectorId - Connector id
 * @returns Connector charging profiles array
 */
export const getConnectorChargingProfiles = (
  chargingStation: ChargingStation,
  connectorId: number
): ChargingProfile[] => {
  return (chargingStation.getConnectorStatus(connectorId)?.chargingProfiles ?? [])
    .slice()
    .sort((a, b) => {
      if (
        a.chargingProfilePurpose === ChargingProfilePurposeType.TX_PROFILE &&
        b.chargingProfilePurpose === ChargingProfilePurposeType.TX_DEFAULT_PROFILE
      ) {
        return -1
      } else if (
        a.chargingProfilePurpose === ChargingProfilePurposeType.TX_DEFAULT_PROFILE &&
        b.chargingProfilePurpose === ChargingProfilePurposeType.TX_PROFILE
      ) {
        return 1
      }
      return b.stackLevel - a.stackLevel
    })
    .concat(
      (chargingStation.getConnectorStatus(0)?.chargingProfiles ?? [])
        .filter(
          chargingProfile =>
            chargingProfile.chargingProfilePurpose === ChargingProfilePurposeType.TX_DEFAULT_PROFILE
        )
        .sort((a, b) => b.stackLevel - a.stackLevel)
    )
}

export const getConnectorChargingProfilesLimit = (
  chargingStation: ChargingStation,
  connectorId: number
): number | undefined => {
  const chargingProfiles = getConnectorChargingProfiles(chargingStation, connectorId)
  if (isNotEmptyArray(chargingProfiles)) {
    const chargingProfilesLimit = getChargingProfilesLimit(
      chargingStation,
      connectorId,
      chargingProfiles
    )
    if (chargingProfilesLimit != null) {
      const limit = buildChargingProfilesLimit(chargingStation, chargingProfilesLimit)
      const maximumPower = chargingStation.stationInfo?.maximumPower
      if (maximumPower == null) {
        return limit
      }
      const connectorMaximumPower = maximumPower / (chargingStation.powerDivider ?? 1)
      if (limit > connectorMaximumPower) {
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.getConnectorChargingProfilesLimit: Charging profile id ${getChargingProfileId(chargingProfilesLimit.chargingProfile)} limit ${limit.toString()} is greater than connector ${connectorId.toString()} maximum ${connectorMaximumPower.toString()}: %j`,
          chargingProfilesLimit
        )
        return connectorMaximumPower
      }
      return limit
    }
  }
}

const buildChargingProfilesLimit = (
  chargingStation: ChargingStation,
  chargingProfilesLimit: ChargingProfilesLimit
): number => {
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  const errorMsg = `Unknown ${chargingStation.stationInfo?.currentOutType} currentOutType in charging station information, cannot build charging profiles limit`
  const { chargingProfile, limit } = chargingProfilesLimit
  const chargingSchedule = getSingleChargingSchedule(
    chargingProfile,
    chargingStation.logPrefix(),
    'buildChargingProfilesLimit'
  )
  if (chargingSchedule == null) {
    return limit
  }
  switch (chargingStation.stationInfo?.currentOutType) {
    case CurrentType.AC:
      return chargingSchedule.chargingRateUnit === ChargingRateUnitType.WATT
        ? limit
        : ACElectricUtils.powerTotal(
          chargingStation.getNumberOfPhases(),
          chargingStation.getVoltageOut(),
          limit
        )
    case CurrentType.DC:
      return chargingSchedule.chargingRateUnit === ChargingRateUnitType.WATT
        ? limit
        : DCElectricUtils.power(chargingStation.getVoltageOut(), limit)
    default:
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.buildChargingProfilesLimit: ${errorMsg}`
      )
      throw new BaseError(errorMsg)
  }
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
      logger.error(`${logPrefix} ${errorMsg}`)
      throw new BaseError(errorMsg)
  }
  return defaultVoltageOut
}

export const getIdTagsFile = (stationInfo: ChargingStationInfo): string | undefined => {
  return stationInfo.idTagsFile != null
    ? join(dirname(fileURLToPath(import.meta.url)), 'assets', basename(stationInfo.idTagsFile))
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

const getConfiguredMaxNumberOfConnectors = (stationTemplate: ChargingStationTemplate): number => {
  let configuredMaxNumberOfConnectors = 0
  if (isNotEmptyArray<number>(stationTemplate.numberOfConnectors)) {
    const numberOfConnectors = stationTemplate.numberOfConnectors
    configuredMaxNumberOfConnectors =
      numberOfConnectors[Math.floor(secureRandom() * numberOfConnectors.length)]
  } else if (typeof stationTemplate.numberOfConnectors === 'number') {
    configuredMaxNumberOfConnectors = stationTemplate.numberOfConnectors
  } else if (stationTemplate.Connectors != null && stationTemplate.Evses == null) {
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

const checkConfiguredMaxConnectors = (
  configuredMaxConnectors: number,
  logPrefix: string,
  templateFile: string
): void => {
  if (configuredMaxConnectors <= 0) {
    logger.warn(
      `${logPrefix} Charging station information from template ${templateFile} with ${configuredMaxConnectors.toString()} connectors`
    )
  }
}

const checkTemplateMaxConnectors = (
  templateMaxConnectors: number,
  logPrefix: string,
  templateFile: string
): void => {
  if (templateMaxConnectors === 0) {
    logger.warn(
      `${logPrefix} Charging station information from template ${templateFile} with empty connectors configuration`
    )
  } else if (templateMaxConnectors < 0) {
    logger.error(
      `${logPrefix} Charging station information from template ${templateFile} with no connectors configuration defined`
    )
  }
}

const initializeConnectorStatus = (connectorStatus: ConnectorStatus): void => {
  connectorStatus.availability = AvailabilityType.Operative
  connectorStatus.idTagLocalAuthorized = false
  connectorStatus.idTagAuthorized = false
  connectorStatus.transactionRemoteStarted = false
  connectorStatus.transactionStarted = false
  connectorStatus.energyActiveImportRegisterValue = 0
  connectorStatus.transactionEnergyActiveImportRegisterValue = 0
  connectorStatus.chargingProfiles ??= []
}

const warnDeprecatedTemplateKey = (
  template: ChargingStationTemplate,
  key: string,
  logPrefix: string,
  templateFile: string,
  logMsgToAppend = ''
): void => {
  if (template[key as keyof ChargingStationTemplate] != null) {
    const logMsg = `Deprecated template key '${key}' usage in file '${templateFile}'${
      isNotEmptyString(logMsgToAppend) ? `. ${logMsgToAppend}` : ''
    }`
    logger.warn(`${logPrefix} ${logMsg}`)
  }
}

const convertDeprecatedTemplateKey = (
  template: ChargingStationTemplate,
  deprecatedKey: string,
  key?: string
): void => {
  const templateRecord = template as unknown as Record<string, unknown>
  if (templateRecord[deprecatedKey] != null) {
    if (key != null) {
      templateRecord[key] = templateRecord[deprecatedKey]
    }
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete templateRecord[deprecatedKey]
  }
}

interface ChargingProfilesLimit {
  chargingProfile: ChargingProfile
  limit: number
}

const getChargingProfileId = (chargingProfile: ChargingProfile): string => {
  const id = chargingProfile.chargingProfileId ?? chargingProfile.id
  return typeof id === 'number' ? id.toString() : 'unknown'
}

const getSingleChargingSchedule = (
  chargingProfile: ChargingProfile,
  logPrefix?: string,
  methodName?: string
): ChargingSchedule | undefined => {
  if (!Array.isArray(chargingProfile.chargingSchedule)) {
    return chargingProfile.chargingSchedule
  }
  if (logPrefix != null && methodName != null) {
    logger.debug(
      `${logPrefix} ${moduleName}.${methodName}: Charging profile id ${getChargingProfileId(chargingProfile)} has an OCPP 2.0 chargingSchedule array and is skipped`
    )
  }
}

/**
 * Get the charging profiles limit for a connector
 * Charging profiles shall already be sorted by priorities
 * @param chargingStation - The charging station instance
 * @param connectorId - The connector identifier
 * @param chargingProfiles - Array of charging profiles
 * @returns Charging profiles limit or undefined if no valid limit found
 */
const getChargingProfilesLimit = (
  chargingStation: ChargingStation,
  connectorId: number,
  chargingProfiles: ChargingProfile[]
): ChargingProfilesLimit | undefined => {
  const debugLogMsg = `${chargingStation.logPrefix()} ${moduleName}.getChargingProfilesLimit: Charging profiles limit found: %j`
  const currentDate = new Date()
  const connectorStatus = chargingStation.getConnectorStatus(connectorId)
  let previousActiveChargingProfile: ChargingProfile | undefined
  for (const chargingProfile of chargingProfiles) {
    const chargingProfileId = getChargingProfileId(chargingProfile)
    const chargingSchedule = getSingleChargingSchedule(
      chargingProfile,
      chargingStation.logPrefix(),
      'getChargingProfilesLimit'
    )
    if (chargingSchedule == null) {
      continue
    }
    if (chargingSchedule.startSchedule == null) {
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.getChargingProfilesLimit: Charging profile id ${chargingProfileId} has no startSchedule defined. Trying to set it to the connector current transaction start date`
      )
      // OCPP specifies that if startSchedule is not defined, it should be relative to start of the connector transaction
      chargingSchedule.startSchedule = connectorStatus?.transactionStart
    }
    if (!isDate(chargingSchedule.startSchedule)) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.getChargingProfilesLimit: Charging profile id ${chargingProfileId} startSchedule property is not a Date instance. Trying to convert it to a Date instance`
      )
      chargingSchedule.startSchedule = convertToDate(chargingSchedule.startSchedule) ?? new Date()
    }
    if (chargingSchedule.duration == null) {
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.getChargingProfilesLimit: Charging profile id ${chargingProfileId} has no duration defined and will be set to the maximum time allowed`
      )
      // OCPP specifies that if duration is not defined, it should be infinite

      chargingSchedule.duration = differenceInSeconds(maxTime, chargingSchedule.startSchedule)
    }
    if (
      !prepareChargingProfileKind(
        connectorStatus,
        chargingProfile,
        currentDate,
        chargingStation.logPrefix()
      )
    ) {
      continue
    }
    if (!canProceedChargingProfile(chargingProfile, currentDate, chargingStation.logPrefix())) {
      continue
    }
    // Check if the charging profile is active
    if (
      isWithinInterval(currentDate, {
        end: addSeconds(chargingSchedule.startSchedule, chargingSchedule.duration),

        start: chargingSchedule.startSchedule,
      })
    ) {
      if (isNotEmptyArray<ChargingSchedulePeriod>(chargingSchedule.chargingSchedulePeriod)) {
        const chargingSchedulePeriodCompareFn = (
          a: ChargingSchedulePeriod,
          b: ChargingSchedulePeriod
        ): number => a.startPeriod - b.startPeriod
        if (
          !isArraySorted<ChargingSchedulePeriod>(
            chargingSchedule.chargingSchedulePeriod,
            chargingSchedulePeriodCompareFn
          )
        ) {
          logger.warn(
            `${chargingStation.logPrefix()} ${moduleName}.getChargingProfilesLimit: Charging profile id ${chargingProfileId} schedule periods are not sorted by start period`
          )

          chargingSchedule.chargingSchedulePeriod.sort(chargingSchedulePeriodCompareFn)
        }
        // Check if the first schedule period startPeriod property is equal to 0

        if (chargingSchedule.chargingSchedulePeriod[0].startPeriod !== 0) {
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.getChargingProfilesLimit: Charging profile id ${chargingProfileId} first schedule period start period ${chargingSchedule.chargingSchedulePeriod[0].startPeriod.toString()} is not equal to 0`
          )
          continue
        }
        // Handle only one schedule period

        if (chargingSchedule.chargingSchedulePeriod.length === 1) {
          const chargingProfilesLimit: ChargingProfilesLimit = {
            chargingProfile,

            limit: chargingSchedule.chargingSchedulePeriod[0].limit,
          }
          logger.debug(debugLogMsg, chargingProfilesLimit)
          return chargingProfilesLimit
        }
        let previousChargingSchedulePeriod: ChargingSchedulePeriod | undefined
        // Search for the right schedule period
        for (const [
          index,
          chargingSchedulePeriod,
        ] of chargingSchedule.chargingSchedulePeriod.entries()) {
          // Find the right schedule period
          if (
            isAfter(
              addSeconds(chargingSchedule.startSchedule, chargingSchedulePeriod.startPeriod),
              currentDate
            )
          ) {
            // Found the schedule period: previous is the correct one
            const chargingProfilesLimit: ChargingProfilesLimit = {
              chargingProfile: previousActiveChargingProfile ?? chargingProfile,

              limit: previousChargingSchedulePeriod?.limit ?? chargingSchedulePeriod.limit,
            }
            logger.debug(debugLogMsg, chargingProfilesLimit)
            return chargingProfilesLimit
          }
          // Handle the last schedule period within the charging profile duration
          if (
            index === chargingSchedule.chargingSchedulePeriod.length - 1 ||
            (index < chargingSchedule.chargingSchedulePeriod.length - 1 &&
              differenceInSeconds(
                addSeconds(
                  chargingSchedule.startSchedule,

                  chargingSchedule.chargingSchedulePeriod[index + 1].startPeriod
                ),

                chargingSchedule.startSchedule
              ) > chargingSchedule.duration)
          ) {
            const chargingProfilesLimit: ChargingProfilesLimit = {
              chargingProfile,

              limit: chargingSchedulePeriod.limit,
            }
            logger.debug(debugLogMsg, chargingProfilesLimit)
            return chargingProfilesLimit
          }
          // Keep a reference to previous charging schedule period

          previousChargingSchedulePeriod = chargingSchedulePeriod
        }
      }
      // Keep a reference to previous active charging profile
      previousActiveChargingProfile = chargingProfile
    }
  }
}

export const prepareChargingProfileKind = (
  connectorStatus: ConnectorStatus | undefined,
  chargingProfile: ChargingProfile,
  currentDate: Date | number | string,
  logPrefix: string
): boolean => {
  const chargingProfileId = getChargingProfileId(chargingProfile)
  const chargingSchedule = getSingleChargingSchedule(
    chargingProfile,
    logPrefix,
    'prepareChargingProfileKind'
  )
  if (chargingSchedule == null) {
    return false
  }
  switch (chargingProfile.chargingProfileKind) {
    case ChargingProfileKindType.RECURRING:
      if (!canProceedRecurringChargingProfile(chargingProfile, logPrefix)) {
        return false
      }
      prepareRecurringChargingProfile(chargingProfile, currentDate, logPrefix)
      break
    case ChargingProfileKindType.RELATIVE:
      if (chargingSchedule.startSchedule != null) {
        logger.warn(
          `${logPrefix} ${moduleName}.prepareChargingProfileKind: Relative charging profile id ${chargingProfileId} has a startSchedule property defined. It will be ignored or used if the connector has a transaction started`
        )
        delete chargingSchedule.startSchedule
      }
      if (connectorStatus?.transactionStarted !== true) {
        logger.debug(
          `${logPrefix} ${moduleName}.prepareChargingProfileKind: Relative charging profile id ${chargingProfileId} has no active transaction, cannot be evaluated`
        )
        return false
      }
      chargingSchedule.startSchedule = connectorStatus.transactionStart
      if (chargingSchedule.startSchedule == null) {
        logger.warn(
          `${logPrefix} ${moduleName}.prepareChargingProfileKind: Relative charging profile id ${chargingProfileId} has active transaction without start date`
        )
        return false
      }
      if (chargingSchedule.duration != null) {
        const elapsedSeconds = differenceInSeconds(currentDate, chargingSchedule.startSchedule)
        if (elapsedSeconds > chargingSchedule.duration) {
          logger.debug(
            `${logPrefix} ${moduleName}.prepareChargingProfileKind: Relative charging profile id ${chargingProfileId} duration ${chargingSchedule.duration.toString()}s exceeded (elapsed: ${elapsedSeconds.toString()}s)`
          )
          return false
        }
      }
      break
  }
  return true
}

export const canProceedChargingProfile = (
  chargingProfile: ChargingProfile,
  currentDate: Date | number | string,
  logPrefix: string
): boolean => {
  const chargingProfileId = getChargingProfileId(chargingProfile)
  const chargingSchedule = getSingleChargingSchedule(
    chargingProfile,
    logPrefix,
    'canProceedChargingProfile'
  )
  if (chargingSchedule == null) {
    return false
  }
  if (
    (isValidDate(chargingProfile.validFrom) && isBefore(currentDate, chargingProfile.validFrom)) ||
    (isValidDate(chargingProfile.validTo) && isAfter(currentDate, chargingProfile.validTo))
  ) {
    logger.debug(
      `${logPrefix} ${moduleName}.canProceedChargingProfile: Charging profile id ${chargingProfileId} is not valid for the current date ${
        isDate(currentDate) ? currentDate.toISOString() : currentDate.toString()
      }`
    )
    return false
  }
  if (chargingSchedule.startSchedule == null || chargingSchedule.duration == null) {
    logger.error(
      `${logPrefix} ${moduleName}.canProceedChargingProfile: Charging profile id ${chargingProfileId} has no startSchedule or duration defined`
    )
    return false
  }

  if (!isValidDate(chargingSchedule.startSchedule)) {
    logger.error(
      `${logPrefix} ${moduleName}.canProceedChargingProfile: Charging profile id ${chargingProfileId} has an invalid startSchedule date defined`
    )
    return false
  }
  if (!Number.isSafeInteger(chargingSchedule.duration)) {
    logger.error(
      `${logPrefix} ${moduleName}.canProceedChargingProfile: Charging profile id ${chargingProfileId} has non integer duration defined`
    )
    return false
  }
  return true
}

const canProceedRecurringChargingProfile = (
  chargingProfile: ChargingProfile,
  logPrefix: string
): boolean => {
  const chargingProfileId = getChargingProfileId(chargingProfile)
  const chargingSchedule = getSingleChargingSchedule(
    chargingProfile,
    logPrefix,
    'canProceedRecurringChargingProfile'
  )
  if (chargingSchedule == null) {
    return false
  }
  if (
    chargingProfile.chargingProfileKind === ChargingProfileKindType.RECURRING &&
    chargingProfile.recurrencyKind == null
  ) {
    logger.error(
      `${logPrefix} ${moduleName}.canProceedRecurringChargingProfile: Recurring charging profile id ${chargingProfileId} has no recurrencyKind defined`
    )
    return false
  }
  if (
    chargingProfile.chargingProfileKind === ChargingProfileKindType.RECURRING &&
    chargingSchedule.startSchedule == null
  ) {
    logger.error(
      `${logPrefix} ${moduleName}.canProceedRecurringChargingProfile: Recurring charging profile id ${chargingProfileId} has no startSchedule defined`
    )
    return false
  }
  return true
}

/**
 * Adjust recurring charging profile startSchedule to the current recurrency time interval if needed
 * @param chargingProfile - The charging profile to adjust
 * @param currentDate - The current date/time
 * @param logPrefix - Prefix for logging messages
 * @returns Whether the charging profile is active at the given date
 */
const prepareRecurringChargingProfile = (
  chargingProfile: ChargingProfile,
  currentDate: Date | number | string,
  logPrefix: string
): boolean => {
  const chargingProfileId = getChargingProfileId(chargingProfile)
  const chargingSchedule = getSingleChargingSchedule(
    chargingProfile,
    logPrefix,
    'prepareRecurringChargingProfile'
  )
  if (chargingSchedule == null) {
    return false
  }
  let recurringIntervalTranslated = false
  let recurringInterval: Interval | undefined
  switch (chargingProfile.recurrencyKind) {
    case RecurrencyKindType.DAILY: {
      const startSchedule = chargingSchedule.startSchedule ?? new Date()
      recurringInterval = {
        end: addDays(startSchedule, 1),
        start: startSchedule,
      }
      checkRecurringChargingProfileDuration(chargingProfile, recurringInterval, logPrefix)
      if (
        !isWithinInterval(currentDate, recurringInterval) &&
        isBefore(recurringInterval.end, currentDate)
      ) {
        chargingSchedule.startSchedule = addDays(
          recurringInterval.start,
          differenceInDays(currentDate, recurringInterval.start)
        )
        recurringInterval = {
          end: addDays(chargingSchedule.startSchedule, 1),

          start: chargingSchedule.startSchedule,
        }
        recurringIntervalTranslated = true
      }
      break
    }
    case RecurrencyKindType.WEEKLY: {
      const startSchedule = chargingSchedule.startSchedule ?? new Date()
      recurringInterval = {
        end: addWeeks(startSchedule, 1),
        start: startSchedule,
      }
      checkRecurringChargingProfileDuration(chargingProfile, recurringInterval, logPrefix)
      if (
        !isWithinInterval(currentDate, recurringInterval) &&
        isBefore(recurringInterval.end, currentDate)
      ) {
        chargingSchedule.startSchedule = addWeeks(
          recurringInterval.start,
          differenceInWeeks(currentDate, recurringInterval.start)
        )
        recurringInterval = {
          end: addWeeks(chargingSchedule.startSchedule, 1),

          start: chargingSchedule.startSchedule,
        }
        recurringIntervalTranslated = true
      }
      break
    }
    default:
      logger.error(
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `${logPrefix} ${moduleName}.prepareRecurringChargingProfile: Recurring ${chargingProfile.recurrencyKind} charging profile id ${chargingProfileId} is not supported`
      )
  }
  if (
    recurringIntervalTranslated &&
    recurringInterval != null &&
    !isWithinInterval(currentDate, recurringInterval)
  ) {
    logger.error(
      `${logPrefix} ${moduleName}.prepareRecurringChargingProfile: Recurring ${
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        chargingProfile.recurrencyKind
      } charging profile id ${chargingProfileId} recurrency time interval [${toDate(
        recurringInterval.start as Date
      ).toISOString()}, ${toDate(
        recurringInterval.end as Date
      ).toISOString()}] has not been properly translated to current date ${
        isDate(currentDate) ? currentDate.toISOString() : currentDate.toString()
      } `
    )
  }
  return recurringIntervalTranslated
}

const checkRecurringChargingProfileDuration = (
  chargingProfile: ChargingProfile,
  interval: Interval,
  logPrefix: string
): void => {
  const chargingProfileId = getChargingProfileId(chargingProfile)
  const chargingSchedule = getSingleChargingSchedule(
    chargingProfile,
    logPrefix,
    'checkRecurringChargingProfileDuration'
  )
  if (chargingSchedule == null) {
    return
  }
  if (chargingSchedule.duration == null) {
    logger.warn(
      `${logPrefix} ${moduleName}.checkRecurringChargingProfileDuration: Recurring ${
        chargingProfile.chargingProfileKind
      } charging profile id ${chargingProfileId} duration is not defined, set it to the recurrency time interval duration ${differenceInSeconds(
        interval.end,
        interval.start
      ).toString()}`
    )
    chargingSchedule.duration = differenceInSeconds(interval.end, interval.start)
  } else if (chargingSchedule.duration > differenceInSeconds(interval.end, interval.start)) {
    logger.warn(
      `${logPrefix} ${moduleName}.checkRecurringChargingProfileDuration: Recurring ${
        chargingProfile.chargingProfileKind
      } charging profile id ${chargingProfileId} duration ${chargingSchedule.duration.toString()} is greater than the recurrency time interval duration ${differenceInSeconds(
        interval.end,
        interval.start
      ).toString()}`
    )
    chargingSchedule.duration = differenceInSeconds(interval.end, interval.start)
  }
}

const getRandomSerialNumberSuffix = (params?: {
  randomBytesLength?: number
  upperCase?: boolean
}): string => {
  const randomSerialNumberSuffix = randomBytes(params?.randomBytesLength ?? 16).toString('hex')
  if (params?.upperCase) {
    return randomSerialNumberSuffix.toUpperCase()
  }
  return randomSerialNumberSuffix
}
