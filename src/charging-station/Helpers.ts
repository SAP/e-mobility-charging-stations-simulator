import { createHash, randomBytes } from 'node:crypto'
import type { EventEmitter } from 'node:events'
import { basename, dirname, isAbsolute, join, parse, relative, resolve } from 'node:path'
import { env } from 'node:process'
import { fileURLToPath } from 'node:url'

import chalk from 'chalk'
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
import { isEmpty } from 'rambda'

import { BaseError } from '../exception/index.js'
import {
  AmpereUnits,
  AvailabilityType,
  type BootNotificationRequest,
  BootReasonEnumType,
  type ChargingProfile,
  ChargingProfileKindType,
  ChargingProfilePurposeType,
  ChargingRateUnitType,
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
  type OCPP16BootNotificationRequest,
  type OCPP20BootNotificationRequest,
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
  isNotEmptyArray,
  isNotEmptyString,
  isValidDate,
  logger,
  secureRandom,
} from '../utils/index.js'
import type { ChargingStation } from './ChargingStation.js'
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

export const getChargingStationId = (
  index: number,
  stationTemplate: ChargingStationTemplate | undefined
): string => {
  if (stationTemplate == null) {
    return "Unknown 'chargingStationId'"
  }
  // In case of multiple instances: add instance index to charging station id
  const instanceIndex = env.CF_INSTANCE_INDEX ?? 0
  const idSuffix = stationTemplate.nameSuffix ?? ''
  const idStr = `000000000${index.toString()}`
  return stationTemplate.fixedName === true
    ? stationTemplate.baseName
    : `${stationTemplate.baseName}-${instanceIndex.toString()}${idStr.substring(
        idStr.length - 4
      )}${idSuffix}`
}

export const hasReservationExpired = (reservation: Reservation): boolean => {
  return isPast(reservation.expiryDate)
}

export const removeExpiredReservations = async (
  chargingStation: ChargingStation
): Promise<void> => {
  if (chargingStation.hasEvses) {
    for (const evseStatus of chargingStation.evses.values()) {
      for (const connectorStatus of evseStatus.connectors.values()) {
        if (
          connectorStatus.reservation != null &&
          hasReservationExpired(connectorStatus.reservation)
        ) {
          await chargingStation.removeReservation(
            connectorStatus.reservation,
            ReservationTerminationReason.EXPIRED
          )
        }
      }
    }
  } else {
    for (const connectorStatus of chargingStation.connectors.values()) {
      if (
        connectorStatus.reservation != null &&
        hasReservationExpired(connectorStatus.reservation)
      ) {
        await chargingStation.removeReservation(
          connectorStatus.reservation,
          ReservationTerminationReason.EXPIRED
        )
      }
    }
  }
}

export const getNumberOfReservableConnectors = (
  connectors: Map<number, ConnectorStatus>
): number => {
  let numberOfReservableConnectors = 0
  for (const [connectorId, connectorStatus] of connectors) {
    if (connectorId === 0) {
      continue
    }
    if (connectorStatus.status === ConnectorStatusEnum.Available) {
      ++numberOfReservableConnectors
    }
  }
  return numberOfReservableConnectors
}

export const getHashId = (index: number, stationTemplate: ChargingStationTemplate): string => {
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
  return createHash(Constants.DEFAULT_HASH_ALGORITHM)
    .update(`${JSON.stringify(chargingStationInfo)}${getChargingStationId(index, stationTemplate)}`)
    .digest('hex')
}

export const checkChargingStation = (
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
}

export const getMaxNumberOfEvses = (evses: Record<string, EvseTemplate> | undefined): number => {
  if (evses == null) {
    return -1
  }
  return Object.keys(evses).length
}

const getMaxNumberOfConnectors = (
  connectors: Record<string, ConnectorStatus> | undefined
): number => {
  if (connectors == null) {
    return -1
  }
  return Object.keys(connectors).length
}

export const getBootConnectorStatus = (
  chargingStation: ChargingStation,
  connectorId: number,
  connectorStatus: ConnectorStatus
): ConnectorStatusEnum => {
  let connectorBootStatus: ConnectorStatusEnum
  if (
    connectorStatus.status == null &&
    (!chargingStation.isChargingStationAvailable() ||
      !chargingStation.isConnectorAvailable(connectorId))
  ) {
    connectorBootStatus = ConnectorStatusEnum.Unavailable
  } else if (connectorStatus.status == null && connectorStatus.bootStatus != null) {
    // Set boot status in template at startup
    connectorBootStatus = connectorStatus.bootStatus
  } else if (connectorStatus.status != null) {
    // Set previous status at startup
    connectorBootStatus = connectorStatus.status
  } else {
    // Set default status
    connectorBootStatus = ConnectorStatusEnum.Available
  }
  return connectorBootStatus
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
  templateMaxConnectors: number
  templateMaxAvailableConnectors: number
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
    templateMaxConnectors,
    templateMaxAvailableConnectors,
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
  return stationInfo
}

export const buildConnectorsMap = (
  connectors: Record<string, ConnectorStatus>,
  logPrefix: string,
  templateFile: string
): Map<number, ConnectorStatus> => {
  const connectorsMap = new Map<number, ConnectorStatus>()
  if (getMaxNumberOfConnectors(connectors) > 0) {
    for (const connector in connectors) {
      const connectorStatus = connectors[connector]
      const connectorId = convertToInt(connector)
      checkStationInfoConnectorStatus(connectorId, connectorStatus, logPrefix, templateFile)
      connectorsMap.set(connectorId, clone<ConnectorStatus>(connectorStatus))
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
  for (const connectorId of connectors.keys()) {
    if (connectorId > 0 && connectors.get(connectorId)?.transactionStarted === true) {
      logger.warn(
        `${logPrefix} Connector id ${connectorId.toString()} at initialization has a transaction started with id ${
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          connectors.get(connectorId)?.transactionId?.toString()
        }`
      )
    }
    if (connectorId === 0) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      connectors.get(connectorId)!.availability = AvailabilityType.Operative
      if (connectors.get(connectorId)?.chargingProfiles == null) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        connectors.get(connectorId)!.chargingProfiles = []
      }
    } else if (connectorId > 0 && connectors.get(connectorId)?.transactionStarted == null) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      initializeConnectorStatus(connectors.get(connectorId)!)
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
  connectorStatus.transactionRemoteStarted = false
  connectorStatus.transactionStarted = false
  delete connectorStatus.transactionStart
  delete connectorStatus.transactionId
  delete connectorStatus.transactionIdTag
  connectorStatus.transactionEnergyActiveImportRegisterValue = 0
  delete connectorStatus.transactionBeginMeterValue
}

export const prepareConnectorStatus = (connectorStatus: ConnectorStatus): ConnectorStatus => {
  if (connectorStatus.reservation != null) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    connectorStatus.reservation.expiryDate = convertToDate(connectorStatus.reservation.expiryDate)!
  }
  if (isNotEmptyArray(connectorStatus.chargingProfiles)) {
    connectorStatus.chargingProfiles = connectorStatus.chargingProfiles
      .filter(
        chargingProfile =>
          chargingProfile.chargingProfilePurpose !== ChargingProfilePurposeType.TX_PROFILE
      )
      .map(chargingProfile => {
        chargingProfile.chargingSchedule.startSchedule = convertToDate(
          chargingProfile.chargingSchedule.startSchedule
        )
        chargingProfile.validFrom = convertToDate(chargingProfile.validFrom)
        chargingProfile.validTo = convertToDate(chargingProfile.validTo)
        return chargingProfile
      })
  }
  return connectorStatus
}

export const createBootNotificationRequest = (
  stationInfo: ChargingStationInfo,
  bootReason: BootReasonEnumType = BootReasonEnumType.PowerUp
): BootNotificationRequest | undefined => {
  const ocppVersion = stationInfo.ocppVersion
  switch (ocppVersion) {
    case OCPPVersion.VERSION_16:
      return {
        chargePointModel: stationInfo.chargePointModel,
        chargePointVendor: stationInfo.chargePointVendor,
        ...(stationInfo.chargeBoxSerialNumber != null && {
          chargeBoxSerialNumber: stationInfo.chargeBoxSerialNumber,
        }),
        ...(stationInfo.chargePointSerialNumber != null && {
          chargePointSerialNumber: stationInfo.chargePointSerialNumber,
        }),
        ...(stationInfo.firmwareVersion != null && {
          firmwareVersion: stationInfo.firmwareVersion,
        }),
        ...(stationInfo.iccid != null && { iccid: stationInfo.iccid }),
        ...(stationInfo.imsi != null && { imsi: stationInfo.imsi }),
        ...(stationInfo.meterSerialNumber != null && {
          meterSerialNumber: stationInfo.meterSerialNumber,
        }),
        ...(stationInfo.meterType != null && {
          meterType: stationInfo.meterType,
        }),
      } satisfies OCPP16BootNotificationRequest
    case OCPPVersion.VERSION_20:
    case OCPPVersion.VERSION_201:
      return {
        reason: bootReason,
        chargingStation: {
          model: stationInfo.chargePointModel,
          vendorName: stationInfo.chargePointVendor,
          ...(stationInfo.firmwareVersion != null && {
            firmwareVersion: stationInfo.firmwareVersion,
          }),
          ...(stationInfo.chargeBoxSerialNumber != null && {
            serialNumber: stationInfo.chargeBoxSerialNumber,
          }),
          ...((stationInfo.iccid != null || stationInfo.imsi != null) && {
            modem: {
              ...(stationInfo.iccid != null && { iccid: stationInfo.iccid }),
              ...(stationInfo.imsi != null && { imsi: stationInfo.imsi }),
            },
          }),
        },
      } satisfies OCPP20BootNotificationRequest
  }
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
  stationTemplate = clone<ChargingStationTemplate>(stationTemplate)
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
    randomSerialNumberUpperCase?: boolean
    randomSerialNumber?: boolean
  }
): void => {
  params = {
    ...{ randomSerialNumberUpperCase: true, randomSerialNumber: true },
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
): boolean | undefined => {
  return getConfigurationKey(
    chargingStation,
    StandardParametersKey.SupportedFeatureProfiles
  )?.value?.includes(featureProfile)
}

export const getAmperageLimitationUnitDivider = (stationInfo: ChargingStationInfo): number => {
  let unitDivider = 1
  switch (stationInfo.amperageLimitationUnit) {
    case AmpereUnits.DECI_AMPERE:
      unitDivider = 10
      break
    case AmpereUnits.CENTI_AMPERE:
      unitDivider = 100
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
      const chargingStationMaximumPower =
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        chargingStation.stationInfo!.maximumPower!
      if (limit > chargingStationMaximumPower) {
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.getChargingStationChargingProfilesLimit: Charging profile id ${
            chargingProfilesLimit.chargingProfile.chargingProfileId.toString()
          } limit ${limit.toString()} is greater than charging station maximum ${chargingStationMaximumPower.toString()}: %j`,
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
 * @returns connector charging profiles array
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
      const connectorMaximumPower =
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        chargingStation.stationInfo!.maximumPower! / chargingStation.powerDivider!
      if (limit > connectorMaximumPower) {
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.getConnectorChargingProfilesLimit: Charging profile id ${
            chargingProfilesLimit.chargingProfile.chargingProfileId.toString()
          } limit ${limit.toString()} is greater than connector ${connectorId.toString()} maximum ${connectorMaximumPower.toString()}: %j`,
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
  const { limit, chargingProfile } = chargingProfilesLimit
  switch (chargingStation.stationInfo?.currentOutType) {
    case CurrentType.AC:
      return chargingProfile.chargingSchedule.chargingRateUnit === ChargingRateUnitType.WATT
        ? limit
        : ACElectricUtils.powerTotal(
          chargingStation.getNumberOfPhases(),
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          chargingStation.stationInfo.voltageOut!,
          limit
        )
    case CurrentType.DC:
      return chargingProfile.chargingSchedule.chargingRateUnit === ChargingRateUnitType.WATT
        ? limit
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        : DCElectricUtils.power(chargingStation.stationInfo.voltageOut!, limit)
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
    emitter.on(event, () => {
      ++events
      if (events === eventsToWait) {
        resolve(events)
      }
    })
  })
}

const getConfiguredMaxNumberOfConnectors = (stationTemplate: ChargingStationTemplate): number => {
  let configuredMaxNumberOfConnectors = 0
  if (isNotEmptyArray(stationTemplate.numberOfConnectors)) {
    const numberOfConnectors = stationTemplate.numberOfConnectors
    configuredMaxNumberOfConnectors =
      numberOfConnectors[Math.floor(secureRandom() * numberOfConnectors.length)]
  } else if (stationTemplate.numberOfConnectors != null) {
    configuredMaxNumberOfConnectors = stationTemplate.numberOfConnectors
  } else if (stationTemplate.Connectors != null && stationTemplate.Evses == null) {
    configuredMaxNumberOfConnectors =
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      stationTemplate.Connectors[0] != null
        ? getMaxNumberOfConnectors(stationTemplate.Connectors) - 1
        : getMaxNumberOfConnectors(stationTemplate.Connectors)
  } else if (stationTemplate.Evses != null && stationTemplate.Connectors == null) {
    for (const evse in stationTemplate.Evses) {
      if (evse === '0') {
        continue
      }
      configuredMaxNumberOfConnectors += getMaxNumberOfConnectors(
        stationTemplate.Evses[evse].Connectors
      )
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
  if (connectorStatus.chargingProfiles == null) {
    connectorStatus.chargingProfiles = []
  }
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
    console.warn(`${chalk.green(logPrefix)} ${chalk.yellow(logMsg)}`)
  }
}

const convertDeprecatedTemplateKey = (
  template: ChargingStationTemplate,
  deprecatedKey: string,
  key?: string
): void => {
  if (template[deprecatedKey as keyof ChargingStationTemplate] != null) {
    if (key != null) {
      ;(template as unknown as Record<string, unknown>)[key] =
        template[deprecatedKey as keyof ChargingStationTemplate]
    }
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete template[deprecatedKey as keyof ChargingStationTemplate]
  }
}

interface ChargingProfilesLimit {
  limit: number
  chargingProfile: ChargingProfile
}

/**
 * Get the charging profiles limit for a connector
 * Charging profiles shall already be sorted by priorities
 * @param chargingStation -
 * @param connectorId -
 * @param chargingProfiles -
 * @returns ChargingProfilesLimit
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
    const chargingSchedule = chargingProfile.chargingSchedule
    if (chargingSchedule.startSchedule == null) {
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.getChargingProfilesLimit: Charging profile id ${chargingProfile.chargingProfileId.toString()} has no startSchedule defined. Trying to set it to the connector current transaction start date`
      )
      // OCPP specifies that if startSchedule is not defined, it should be relative to start of the connector transaction
      chargingSchedule.startSchedule = connectorStatus?.transactionStart
    }
    if (!isDate(chargingSchedule.startSchedule)) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.getChargingProfilesLimit: Charging profile id ${chargingProfile.chargingProfileId.toString()} startSchedule property is not a Date instance. Trying to convert it to a Date instance`
      )
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      chargingSchedule.startSchedule = convertToDate(chargingSchedule.startSchedule)!
    }
    if (chargingSchedule.duration == null) {
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.getChargingProfilesLimit: Charging profile id ${chargingProfile.chargingProfileId.toString()} has no duration defined and will be set to the maximum time allowed`
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
        start: chargingSchedule.startSchedule,
        end: addSeconds(chargingSchedule.startSchedule, chargingSchedule.duration),
      })
    ) {
      if (isNotEmptyArray(chargingSchedule.chargingSchedulePeriod)) {
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
            `${chargingStation.logPrefix()} ${moduleName}.getChargingProfilesLimit: Charging profile id ${chargingProfile.chargingProfileId.toString()} schedule periods are not sorted by start period`
          )
          chargingSchedule.chargingSchedulePeriod.sort(chargingSchedulePeriodCompareFn)
        }
        // Check if the first schedule period startPeriod property is equal to 0
        if (chargingSchedule.chargingSchedulePeriod[0].startPeriod !== 0) {
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.getChargingProfilesLimit: Charging profile id ${chargingProfile.chargingProfileId.toString()} first schedule period start period ${chargingSchedule.chargingSchedulePeriod[0].startPeriod.toString()} is not equal to 0`
          )
          continue
        }
        // Handle only one schedule period
        if (chargingSchedule.chargingSchedulePeriod.length === 1) {
          const chargingProfilesLimit: ChargingProfilesLimit = {
            limit: chargingSchedule.chargingSchedulePeriod[0].limit,
            chargingProfile,
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
              limit: previousChargingSchedulePeriod?.limit ?? chargingSchedulePeriod.limit,
              chargingProfile: previousActiveChargingProfile ?? chargingProfile,
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
              limit: chargingSchedulePeriod.limit,
              chargingProfile,
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
  currentDate: string | number | Date,
  logPrefix: string
): boolean => {
  switch (chargingProfile.chargingProfileKind) {
    case ChargingProfileKindType.RECURRING:
      if (!canProceedRecurringChargingProfile(chargingProfile, logPrefix)) {
        return false
      }
      prepareRecurringChargingProfile(chargingProfile, currentDate, logPrefix)
      break
    case ChargingProfileKindType.RELATIVE:
      if (chargingProfile.chargingSchedule.startSchedule != null) {
        logger.warn(
          `${logPrefix} ${moduleName}.prepareChargingProfileKind: Relative charging profile id ${chargingProfile.chargingProfileId.toString()} has a startSchedule property defined. It will be ignored or used if the connector has a transaction started`
        )
        delete chargingProfile.chargingSchedule.startSchedule
      }
      if (connectorStatus?.transactionStarted === true) {
        chargingProfile.chargingSchedule.startSchedule = connectorStatus.transactionStart
      }
      // FIXME: handle relative charging profile duration
      break
  }
  return true
}

export const canProceedChargingProfile = (
  chargingProfile: ChargingProfile,
  currentDate: string | number | Date,
  logPrefix: string
): boolean => {
  if (
    (isValidDate(chargingProfile.validFrom) && isBefore(currentDate, chargingProfile.validFrom)) ||
    (isValidDate(chargingProfile.validTo) && isAfter(currentDate, chargingProfile.validTo))
  ) {
    logger.debug(
      `${logPrefix} ${moduleName}.canProceedChargingProfile: Charging profile id ${
        chargingProfile.chargingProfileId.toString()
      } is not valid for the current date ${
        isDate(currentDate) ? currentDate.toISOString() : currentDate.toString()
      }`
    )
    return false
  }
  if (
    chargingProfile.chargingSchedule.startSchedule == null ||
    chargingProfile.chargingSchedule.duration == null
  ) {
    logger.error(
      `${logPrefix} ${moduleName}.canProceedChargingProfile: Charging profile id ${chargingProfile.chargingProfileId.toString()} has no startSchedule or duration defined`
    )
    return false
  }
  if (!isValidDate(chargingProfile.chargingSchedule.startSchedule)) {
    logger.error(
      `${logPrefix} ${moduleName}.canProceedChargingProfile: Charging profile id ${chargingProfile.chargingProfileId.toString()} has an invalid startSchedule date defined`
    )
    return false
  }
  if (!Number.isSafeInteger(chargingProfile.chargingSchedule.duration)) {
    logger.error(
      `${logPrefix} ${moduleName}.canProceedChargingProfile: Charging profile id ${chargingProfile.chargingProfileId.toString()} has non integer duration defined`
    )
    return false
  }
  return true
}

const canProceedRecurringChargingProfile = (
  chargingProfile: ChargingProfile,
  logPrefix: string
): boolean => {
  if (
    chargingProfile.chargingProfileKind === ChargingProfileKindType.RECURRING &&
    chargingProfile.recurrencyKind == null
  ) {
    logger.error(
      `${logPrefix} ${moduleName}.canProceedRecurringChargingProfile: Recurring charging profile id ${chargingProfile.chargingProfileId.toString()} has no recurrencyKind defined`
    )
    return false
  }
  if (
    chargingProfile.chargingProfileKind === ChargingProfileKindType.RECURRING &&
    chargingProfile.chargingSchedule.startSchedule == null
  ) {
    logger.error(
      `${logPrefix} ${moduleName}.canProceedRecurringChargingProfile: Recurring charging profile id ${chargingProfile.chargingProfileId.toString()} has no startSchedule defined`
    )
    return false
  }
  return true
}

/**
 * Adjust recurring charging profile startSchedule to the current recurrency time interval if needed
 * @param chargingProfile -
 * @param currentDate -
 * @param logPrefix -
 * @returns boolean
 */
const prepareRecurringChargingProfile = (
  chargingProfile: ChargingProfile,
  currentDate: string | number | Date,
  logPrefix: string
): boolean => {
  const chargingSchedule = chargingProfile.chargingSchedule
  let recurringIntervalTranslated = false
  let recurringInterval: Interval | undefined
  switch (chargingProfile.recurrencyKind) {
    case RecurrencyKindType.DAILY:
      recurringInterval = {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        start: chargingSchedule.startSchedule!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        end: addDays(chargingSchedule.startSchedule!, 1),
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
          start: chargingSchedule.startSchedule,
          end: addDays(chargingSchedule.startSchedule, 1),
        }
        recurringIntervalTranslated = true
      }
      break
    case RecurrencyKindType.WEEKLY:
      recurringInterval = {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        start: chargingSchedule.startSchedule!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        end: addWeeks(chargingSchedule.startSchedule!, 1),
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
          start: chargingSchedule.startSchedule,
          end: addWeeks(chargingSchedule.startSchedule, 1),
        }
        recurringIntervalTranslated = true
      }
      break
    default:
      logger.error(
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `${logPrefix} ${moduleName}.prepareRecurringChargingProfile: Recurring ${chargingProfile.recurrencyKind} charging profile id ${chargingProfile.chargingProfileId.toString()} is not supported`
      )
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  if (recurringIntervalTranslated && !isWithinInterval(currentDate, recurringInterval!)) {
    logger.error(
      `${logPrefix} ${moduleName}.prepareRecurringChargingProfile: Recurring ${
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        chargingProfile.recurrencyKind
      } charging profile id ${chargingProfile.chargingProfileId.toString()} recurrency time interval [${toDate(
        recurringInterval?.start as Date
      ).toISOString()}, ${toDate(
        recurringInterval?.end as Date
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
  if (chargingProfile.chargingSchedule.duration == null) {
    logger.warn(
      `${logPrefix} ${moduleName}.checkRecurringChargingProfileDuration: Recurring ${
        chargingProfile.chargingProfileKind
      } charging profile id ${
        chargingProfile.chargingProfileId.toString()
      } duration is not defined, set it to the recurrency time interval duration ${differenceInSeconds(
        interval.end,
        interval.start
      ).toString()}`
    )
    chargingProfile.chargingSchedule.duration = differenceInSeconds(interval.end, interval.start)
  } else if (
    chargingProfile.chargingSchedule.duration > differenceInSeconds(interval.end, interval.start)
  ) {
    logger.warn(
      `${logPrefix} ${moduleName}.checkRecurringChargingProfileDuration: Recurring ${
        chargingProfile.chargingProfileKind
      } charging profile id ${chargingProfile.chargingProfileId.toString()} duration ${
        chargingProfile.chargingSchedule.duration.toString()
      } is greater than the recurrency time interval duration ${differenceInSeconds(
        interval.end,
        interval.start
      ).toString()}`
    )
    chargingProfile.chargingSchedule.duration = differenceInSeconds(interval.end, interval.start)
  }
}

const getRandomSerialNumberSuffix = (params?: {
  randomBytesLength?: number
  upperCase?: boolean
}): string => {
  const randomSerialNumberSuffix = randomBytes(params.randomBytesLength ?? 16).toString('hex')
  if (params.upperCase) {
    return randomSerialNumberSuffix.toUpperCase()
  }
  return randomSerialNumberSuffix
}
