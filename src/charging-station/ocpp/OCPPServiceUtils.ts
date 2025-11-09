import type { ErrorObject, JSONSchemaType } from 'ajv'

import { isDate } from 'date-fns'
import { randomInt } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  type ChargingStation,
  getConfigurationKey,
  getIdTagsFile,
} from '../../charging-station/index.js'
import { BaseError, OCPPError } from '../../exception/index.js'
import {
  AuthorizationStatus,
  type AuthorizeRequest,
  type AuthorizeResponse,
  ChargePointErrorCode,
  ChargingStationEvents,
  type ConnectorStatus,
  ConnectorStatusEnum,
  CurrentType,
  ErrorType,
  FileType,
  IncomingRequestCommand,
  type JsonType,
  type MeasurandPerPhaseSampledValueTemplates,
  type MeasurandValues,
  MessageTrigger,
  MessageType,
  type MeterValue,
  MeterValueContext,
  MeterValueLocation,
  MeterValueMeasurand,
  MeterValuePhase,
  MeterValueUnit,
  type OCPP16ChargePointStatus,
  type OCPP16SampledValue,
  type OCPP16StatusNotificationRequest,
  type OCPP20ConnectorStatusEnumType,
  type OCPP20MeterValue,
  type OCPP20SampledValue,
  type OCPP20StatusNotificationRequest,
  OCPPVersion,
  RequestCommand,
  type SampledValue,
  type SampledValueTemplate,
  StandardParametersKey,
  type StatusNotificationRequest,
  type StatusNotificationResponse,
} from '../../types/index.js'
import {
  ACElectricUtils,
  Constants,
  convertToFloat,
  convertToInt,
  DCElectricUtils,
  getRandomFloatFluctuatedRounded,
  getRandomFloatRounded,
  handleFileException,
  isNotEmptyArray,
  isNotEmptyString,
  logger,
  logPrefix,
  max,
  min,
  roundTo,
} from '../../utils/index.js'
import { OCPP16Constants } from './1.6/OCPP16Constants.js'
import { OCPP20Constants } from './2.0/OCPP20Constants.js'
import { OCPPConstants } from './OCPPConstants.js'

interface MultiPhaseMeasurandData {
  perPhaseTemplates: MeasurandPerPhaseSampledValueTemplates
  template: SampledValueTemplate
  values: MeasurandValues
}

interface SingleValueMeasurandData {
  template: SampledValueTemplate
  value: number
}

export const getMessageTypeString = (messageType: MessageType | undefined): string => {
  switch (messageType) {
    case MessageType.CALL_ERROR_MESSAGE:
      return 'error'
    case MessageType.CALL_MESSAGE:
      return 'request'
    case MessageType.CALL_RESULT_MESSAGE:
      return 'response'
    default:
      return 'unknown'
  }
}

const buildStatusNotificationRequest = (
  chargingStation: ChargingStation,
  connectorId: number,
  status: ConnectorStatusEnum,
  evseId?: number
): StatusNotificationRequest => {
  switch (chargingStation.stationInfo?.ocppVersion) {
    case OCPPVersion.VERSION_16:
      return {
        connectorId,
        errorCode: ChargePointErrorCode.NO_ERROR,
        status: status as OCPP16ChargePointStatus,
      } satisfies OCPP16StatusNotificationRequest
    case OCPPVersion.VERSION_20:
    case OCPPVersion.VERSION_201:
      return {
        connectorId,
        connectorStatus: status as OCPP20ConnectorStatusEnumType,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        evseId: evseId ?? chargingStation.getEvseIdByConnectorId(connectorId)!,
        timestamp: new Date(),
      } satisfies OCPP20StatusNotificationRequest
    default:
      throw new OCPPError(
        ErrorType.INTERNAL_ERROR,
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Cannot build status notification payload: OCPP version ${chargingStation.stationInfo?.ocppVersion} not supported`,
        RequestCommand.STATUS_NOTIFICATION
      )
  }
}

export const isIdTagAuthorized = async (
  chargingStation: ChargingStation,
  connectorId: number,
  idTag: string
): Promise<boolean> => {
  if (
    !chargingStation.getLocalAuthListEnabled() &&
    chargingStation.stationInfo?.remoteAuthorization === false
  ) {
    logger.warn(
      `${chargingStation.logPrefix()} The charging station expects to authorize RFID tags but nor local authorization nor remote authorization are enabled. Misbehavior may occur`
    )
  }
  const connectorStatus = chargingStation.getConnectorStatus(connectorId)
  if (
    connectorStatus != null &&
    chargingStation.getLocalAuthListEnabled() &&
    isIdTagLocalAuthorized(chargingStation, idTag)
  ) {
    connectorStatus.localAuthorizeIdTag = idTag
    connectorStatus.idTagLocalAuthorized = true
    return true
  } else if (chargingStation.stationInfo?.remoteAuthorization === true) {
    return await isIdTagRemoteAuthorized(chargingStation, connectorId, idTag)
  }
  return false
}

const isIdTagLocalAuthorized = (chargingStation: ChargingStation, idTag: string): boolean => {
  return (
    chargingStation.hasIdTags() &&
    isNotEmptyString(
      chargingStation.idTagsCache
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        .getIdTags(getIdTagsFile(chargingStation.stationInfo!)!)
        ?.find(tag => tag === idTag)
    )
  )
}

const isIdTagRemoteAuthorized = async (
  chargingStation: ChargingStation,
  connectorId: number,
  idTag: string
): Promise<boolean> => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  chargingStation.getConnectorStatus(connectorId)!.authorizeIdTag = idTag
  return (
    (
      await chargingStation.ocppRequestService.requestHandler<AuthorizeRequest, AuthorizeResponse>(
        chargingStation,
        RequestCommand.AUTHORIZE,
        {
          idTag,
        }
      )
    ).idTagInfo.status === AuthorizationStatus.ACCEPTED
  )
}

export const sendAndSetConnectorStatus = async (
  chargingStation: ChargingStation,
  connectorId: number,
  status: ConnectorStatusEnum,
  evseId?: number,
  options?: { send: boolean }
): Promise<void> => {
  options = { send: true, ...options }
  const connectorStatus = chargingStation.getConnectorStatus(connectorId)
  if (connectorStatus == null) {
    return
  }
  if (options.send) {
    checkConnectorStatusTransition(chargingStation, connectorId, status)
    await chargingStation.ocppRequestService.requestHandler<
      StatusNotificationRequest,
      StatusNotificationResponse
    >(
      chargingStation,
      RequestCommand.STATUS_NOTIFICATION,
      buildStatusNotificationRequest(chargingStation, connectorId, status, evseId)
    )
  }
  connectorStatus.status = status
  chargingStation.emitChargingStationEvent(ChargingStationEvents.connectorStatusChanged, {
    connectorId,
    ...connectorStatus,
  })
}

export const restoreConnectorStatus = async (
  chargingStation: ChargingStation,
  connectorId: number,
  connectorStatus: ConnectorStatus | undefined
): Promise<void> => {
  if (
    connectorStatus?.reservation != null &&
    connectorStatus.status !== ConnectorStatusEnum.Reserved
  ) {
    await sendAndSetConnectorStatus(chargingStation, connectorId, ConnectorStatusEnum.Reserved)
  } else if (connectorStatus?.status !== ConnectorStatusEnum.Available) {
    await sendAndSetConnectorStatus(chargingStation, connectorId, ConnectorStatusEnum.Available)
  }
}

const checkConnectorStatusTransition = (
  chargingStation: ChargingStation,
  connectorId: number,
  status: ConnectorStatusEnum
): boolean => {
  const fromStatus = chargingStation.getConnectorStatus(connectorId)?.status
  let transitionAllowed = false
  switch (chargingStation.stationInfo?.ocppVersion) {
    case OCPPVersion.VERSION_16:
      if (
        (connectorId === 0 &&
          OCPP16Constants.ChargePointStatusChargingStationTransitions.findIndex(
            transition => transition.from === fromStatus && transition.to === status
          ) !== -1) ||
        (connectorId > 0 &&
          OCPP16Constants.ChargePointStatusConnectorTransitions.findIndex(
            transition => transition.from === fromStatus && transition.to === status
          ) !== -1)
      ) {
        transitionAllowed = true
      }
      break
    case OCPPVersion.VERSION_20:
    case OCPPVersion.VERSION_201:
      if (
        (connectorId === 0 &&
          OCPP20Constants.ChargingStationStatusTransitions.findIndex(
            transition => transition.from === fromStatus && transition.to === status
          ) !== -1) ||
        (connectorId > 0 &&
          OCPP20Constants.ConnectorStatusTransitions.findIndex(
            transition => transition.from === fromStatus && transition.to === status
          ) !== -1)
      ) {
        transitionAllowed = true
      }
      break
    default:
      throw new OCPPError(
        ErrorType.INTERNAL_ERROR,
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Cannot check connector status transition: OCPP version ${chargingStation.stationInfo?.ocppVersion} not supported`,
        RequestCommand.STATUS_NOTIFICATION
      )
  }
  if (!transitionAllowed) {
    logger.warn(
      `${chargingStation.logPrefix()} OCPP ${
        chargingStation.stationInfo.ocppVersion
      } connector id ${connectorId.toString()} status transition from '${
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        chargingStation.getConnectorStatus(connectorId)?.status
      }' to '${status}' is not allowed`
    )
  }
  return transitionAllowed
}

export const ajvErrorsToErrorType = (errors: ErrorObject[] | null | undefined): ErrorType => {
  if (isNotEmptyArray(errors)) {
    for (const error of errors) {
      switch (error.keyword) {
        case 'dependencies':
        case 'required':
          return ErrorType.OCCURRENCE_CONSTRAINT_VIOLATION
        case 'format':
        case 'pattern':
          return ErrorType.PROPERTY_CONSTRAINT_VIOLATION
        case 'type':
          return ErrorType.TYPE_CONSTRAINT_VIOLATION
      }
    }
  }
  return ErrorType.FORMAT_VIOLATION
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export const convertDateToISOString = <T extends JsonType>(object: T): void => {
  for (const [key, value] of Object.entries(object as Record<string, unknown>)) {
    if (isDate(value)) {
      try {
        ;(object as Record<string, unknown>)[key] = value.toISOString()
      } catch {
        // Ignore date conversion error
      }
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const item = value[i]
        if (isDate(item)) {
          try {
            value[i] = item.toISOString() as unknown as typeof item
          } catch {
            // Ignore date conversion error
          }
        } else if (typeof item === 'object' && item !== null) {
          convertDateToISOString(item as T)
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      convertDateToISOString<T>(value as T)
    }
  }
}

const buildSocMeasurandValue = (
  chargingStation: ChargingStation,
  connectorId: number
): null | SingleValueMeasurandData => {
  const socSampledValueTemplate = getSampledValueTemplate(
    chargingStation,
    connectorId,
    MeterValueMeasurand.STATE_OF_CHARGE
  )
  if (socSampledValueTemplate == null) {
    return null
  }

  const socMaximumValue = 100
  const socMinimumValue = socSampledValueTemplate.minimumValue ?? 0
  const socSampledValueTemplateValue = isNotEmptyString(socSampledValueTemplate.value)
    ? getRandomFloatFluctuatedRounded(
      Number.parseInt(socSampledValueTemplate.value),
      socSampledValueTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT
    )
    : randomInt(socMinimumValue, socMaximumValue + 1)

  return {
    template: socSampledValueTemplate,
    value: socSampledValueTemplateValue,
  }
}

const validateSocMeasurandValue = (
  chargingStation: ChargingStation,
  connectorId: number,
  sampledValue: SampledValue,
  socMinimumValue: number,
  socMaximumValue: number,
  debug: boolean
): void => {
  const connector = chargingStation.getConnectorStatus(connectorId)
  if (
    convertToInt(sampledValue.value) > socMaximumValue ||
    convertToInt(sampledValue.value) < socMinimumValue ||
    debug
  ) {
    logger.error(
      `${chargingStation.logPrefix()} MeterValues measurand ${
        sampledValue.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      }: connector id ${connectorId.toString()}, transaction id ${connector?.transactionId?.toString()}, value: ${socMinimumValue.toString()}/${sampledValue.value.toString()}/${socMaximumValue.toString()}`
    )
  }
}

const buildVoltageMeasurandValue = (
  chargingStation: ChargingStation,
  connectorId: number
): null | SingleValueMeasurandData => {
  const voltageSampledValueTemplate = getSampledValueTemplate(
    chargingStation,
    connectorId,
    MeterValueMeasurand.VOLTAGE
  )
  if (voltageSampledValueTemplate == null) {
    return null
  }

  const voltageSampledValueTemplateValue = isNotEmptyString(voltageSampledValueTemplate.value)
    ? Number.parseInt(voltageSampledValueTemplate.value)
    : // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    chargingStation.stationInfo.voltageOut!
  const fluctuationPercent =
    voltageSampledValueTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT
  const voltageMeasurandValue = getRandomFloatFluctuatedRounded(
    voltageSampledValueTemplateValue,
    fluctuationPercent
  )

  return {
    template: voltageSampledValueTemplate,
    value: voltageMeasurandValue,
  }
}

const addMainVoltageToMeterValue = (
  chargingStation: ChargingStation,
  meterValue: MeterValue,
  voltageData: { template: SampledValueTemplate; value: number }
): void => {
  if (
    chargingStation.getNumberOfPhases() !== 3 ||
    (chargingStation.getNumberOfPhases() === 3 &&
      chargingStation.stationInfo.mainVoltageMeterValues === true)
  ) {
    meterValue.sampledValue.push(
      buildSampledValue(
        chargingStation.stationInfo.ocppVersion,
        voltageData.template,
        voltageData.value
      )
    )
  }
}

const addPhaseVoltageToMeterValue = (
  chargingStation: ChargingStation,
  connectorId: number,
  meterValue: MeterValue,
  mainVoltageData: { template: SampledValueTemplate; value: number },
  phase: number
): void => {
  const phaseLineToNeutralValue = `L${phase.toString()}-N` as MeterValuePhase
  const voltagePhaseLineToNeutralSampledValueTemplate = getSampledValueTemplate(
    chargingStation,
    connectorId,
    MeterValueMeasurand.VOLTAGE,
    phaseLineToNeutralValue
  )
  let voltagePhaseLineToNeutralMeasurandValue: number | undefined
  if (voltagePhaseLineToNeutralSampledValueTemplate != null) {
    const voltagePhaseLineToNeutralSampledValueTemplateValue = isNotEmptyString(
      voltagePhaseLineToNeutralSampledValueTemplate.value
    )
      ? Number.parseInt(voltagePhaseLineToNeutralSampledValueTemplate.value)
      : // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      chargingStation.stationInfo.voltageOut!
    const fluctuationPhaseToNeutralPercent =
      voltagePhaseLineToNeutralSampledValueTemplate.fluctuationPercent ??
      Constants.DEFAULT_FLUCTUATION_PERCENT
    voltagePhaseLineToNeutralMeasurandValue = getRandomFloatFluctuatedRounded(
      voltagePhaseLineToNeutralSampledValueTemplateValue,
      fluctuationPhaseToNeutralPercent
    )
  }
  meterValue.sampledValue.push(
    buildSampledValue(
      chargingStation.stationInfo.ocppVersion,
      voltagePhaseLineToNeutralSampledValueTemplate ?? mainVoltageData.template,
      voltagePhaseLineToNeutralMeasurandValue ?? mainVoltageData.value,
      undefined,
      phaseLineToNeutralValue
    )
  )
}

const addLineToLineVoltageToMeterValue = (
  chargingStation: ChargingStation,
  connectorId: number,
  meterValue: MeterValue,
  mainVoltageData: { template: SampledValueTemplate; value: number },
  phase: number
): void => {
  if (chargingStation.stationInfo.phaseLineToLineVoltageMeterValues === true) {
    const phaseLineToLineValue = `L${phase.toString()}-L${
      (phase + 1) % chargingStation.getNumberOfPhases() !== 0
        ? ((phase + 1) % chargingStation.getNumberOfPhases()).toString()
        : chargingStation.getNumberOfPhases().toString()
    }` as MeterValuePhase
    const voltagePhaseLineToLineValueRounded = roundTo(
      Math.sqrt(chargingStation.getNumberOfPhases()) *
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        chargingStation.stationInfo.voltageOut!,
      2
    )
    const voltagePhaseLineToLineSampledValueTemplate = getSampledValueTemplate(
      chargingStation,
      connectorId,
      MeterValueMeasurand.VOLTAGE,
      phaseLineToLineValue
    )
    let voltagePhaseLineToLineMeasurandValue: number | undefined
    if (voltagePhaseLineToLineSampledValueTemplate != null) {
      const voltagePhaseLineToLineSampledValueTemplateValue = isNotEmptyString(
        voltagePhaseLineToLineSampledValueTemplate.value
      )
        ? Number.parseInt(voltagePhaseLineToLineSampledValueTemplate.value)
        : voltagePhaseLineToLineValueRounded
      const fluctuationPhaseLineToLinePercent =
        voltagePhaseLineToLineSampledValueTemplate.fluctuationPercent ??
        Constants.DEFAULT_FLUCTUATION_PERCENT
      voltagePhaseLineToLineMeasurandValue = getRandomFloatFluctuatedRounded(
        voltagePhaseLineToLineSampledValueTemplateValue,
        fluctuationPhaseLineToLinePercent
      )
    }
    meterValue.sampledValue.push(
      buildSampledValue(
        chargingStation.stationInfo.ocppVersion,
        voltagePhaseLineToLineSampledValueTemplate ?? mainVoltageData.template,
        voltagePhaseLineToLineMeasurandValue ?? voltagePhaseLineToLineValueRounded,
        undefined,
        phaseLineToLineValue
      )
    )
  }
}

const buildEnergyMeasurandValue = (
  chargingStation: ChargingStation,
  connectorId: number,
  interval: number
): null | SingleValueMeasurandData => {
  const energyTemplate = getSampledValueTemplate(chargingStation, connectorId)
  if (energyTemplate == null) {
    return null
  }

  checkMeasurandPowerDivider(chargingStation, energyTemplate.measurand)
  const unitDivider = energyTemplate.unit === MeterValueUnit.KILO_WATT_HOUR ? 1000 : 1
  const connectorMaximumAvailablePower =
    chargingStation.getConnectorMaximumAvailablePower(connectorId)
  const connectorMaximumEnergyRounded = roundTo(
    (connectorMaximumAvailablePower * interval) / (3600 * 1000),
    2
  )
  const connectorMinimumEnergyRounded = roundTo(energyTemplate.minimumValue ?? 0, 2)

  const energyValueRounded = isNotEmptyString(energyTemplate.value)
    ? getRandomFloatFluctuatedRounded(
      getLimitFromSampledValueTemplateCustomValue(
        energyTemplate.value,
        connectorMaximumEnergyRounded,
        connectorMinimumEnergyRounded,
        {
          fallbackValue: connectorMinimumEnergyRounded,
          limitationEnabled: chargingStation.stationInfo?.customValueLimitationMeterValues,
          unitMultiplier: unitDivider,
        }
      ),
      energyTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT
    )
    : getRandomFloatRounded(connectorMaximumEnergyRounded, connectorMinimumEnergyRounded)

  return {
    template: energyTemplate,
    value: energyValueRounded,
  }
}

const updateConnectorEnergyValues = (
  connector: ConnectorStatus | undefined,
  energyValue: number
): void => {
  if (connector != null) {
    if (
      connector.energyActiveImportRegisterValue != null &&
      connector.energyActiveImportRegisterValue >= 0 &&
      connector.transactionEnergyActiveImportRegisterValue != null &&
      connector.transactionEnergyActiveImportRegisterValue >= 0
    ) {
      connector.energyActiveImportRegisterValue += energyValue
      connector.transactionEnergyActiveImportRegisterValue += energyValue
    } else {
      connector.energyActiveImportRegisterValue = 0
      connector.transactionEnergyActiveImportRegisterValue = 0
    }
  }
}

const validateEnergyMeasurandValue = (
  chargingStation: ChargingStation,
  connectorId: number,
  sampledValue: SampledValue,
  energyValue: number,
  minValue: number,
  maxValue: number,
  interval: number,
  debug: boolean
): void => {
  if (energyValue > maxValue || energyValue < minValue || debug) {
    const connector = chargingStation.getConnectorStatus(connectorId)
    logger.error(
      `${chargingStation.logPrefix()} MeterValues measurand ${
        sampledValue.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      }: connector id ${connectorId.toString()}, transaction id ${connector?.transactionId?.toString()}, value: ${minValue.toString()}/${energyValue.toString()}/${maxValue.toString()}, duration: ${interval.toString()}ms`
    )
  }
}

const buildPowerMeasurandValue = (
  chargingStation: ChargingStation,
  connectorId: number
): MultiPhaseMeasurandData | null => {
  const powerTemplate = getSampledValueTemplate(
    chargingStation,
    connectorId,
    MeterValueMeasurand.POWER_ACTIVE_IMPORT
  )
  if (powerTemplate == null) {
    return null
  }

  let perPhaseTemplates: MeasurandPerPhaseSampledValueTemplates = {}
  if (chargingStation.getNumberOfPhases() === 3) {
    perPhaseTemplates = {
      L1: getSampledValueTemplate(
        chargingStation,
        connectorId,
        MeterValueMeasurand.POWER_ACTIVE_IMPORT,
        MeterValuePhase.L1_N
      ),
      L2: getSampledValueTemplate(
        chargingStation,
        connectorId,
        MeterValueMeasurand.POWER_ACTIVE_IMPORT,
        MeterValuePhase.L2_N
      ),
      L3: getSampledValueTemplate(
        chargingStation,
        connectorId,
        MeterValueMeasurand.POWER_ACTIVE_IMPORT,
        MeterValuePhase.L3_N
      ),
    }
  }

  checkMeasurandPowerDivider(chargingStation, powerTemplate.measurand)
  const powerValues: MeasurandValues = {} as MeasurandValues
  const unitDivider = powerTemplate.unit === MeterValueUnit.KILO_WATT ? 1000 : 1
  const connectorMaximumAvailablePower =
    chargingStation.getConnectorMaximumAvailablePower(connectorId)
  const connectorMaximumPower = Math.round(connectorMaximumAvailablePower)
  const connectorMaximumPowerPerPhase = Math.round(
    connectorMaximumAvailablePower / chargingStation.getNumberOfPhases()
  )
  const connectorMinimumPower = Math.round(powerTemplate.minimumValue ?? 0)
  const connectorMinimumPowerPerPhase = Math.round(
    connectorMinimumPower / chargingStation.getNumberOfPhases()
  )

  switch (chargingStation.stationInfo?.currentOutType) {
    case CurrentType.AC:
      if (chargingStation.getNumberOfPhases() === 3) {
        const defaultFluctuatedPowerPerPhase = isNotEmptyString(powerTemplate.value)
          ? getRandomFloatFluctuatedRounded(
            getLimitFromSampledValueTemplateCustomValue(
              powerTemplate.value,
              connectorMaximumPower / unitDivider,
              connectorMinimumPower / unitDivider,
              {
                fallbackValue: connectorMinimumPower / unitDivider,
                limitationEnabled: chargingStation.stationInfo.customValueLimitationMeterValues,
              }
            ) / chargingStation.getNumberOfPhases(),
            powerTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT
          )
          : undefined

        const phase1Value = isNotEmptyString(perPhaseTemplates.L1?.value)
          ? getRandomFloatFluctuatedRounded(
            getLimitFromSampledValueTemplateCustomValue(
              perPhaseTemplates.L1.value,
              connectorMaximumPowerPerPhase / unitDivider,
              connectorMinimumPowerPerPhase / unitDivider,
              {
                fallbackValue: connectorMinimumPowerPerPhase / unitDivider,
                limitationEnabled: chargingStation.stationInfo.customValueLimitationMeterValues,
              }
            ),
            perPhaseTemplates.L1.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT
          )
          : undefined

        const phase2Value = isNotEmptyString(perPhaseTemplates.L2?.value)
          ? getRandomFloatFluctuatedRounded(
            getLimitFromSampledValueTemplateCustomValue(
              perPhaseTemplates.L2.value,
              connectorMaximumPowerPerPhase / unitDivider,
              connectorMinimumPowerPerPhase / unitDivider,
              {
                fallbackValue: connectorMinimumPowerPerPhase / unitDivider,
                limitationEnabled: chargingStation.stationInfo.customValueLimitationMeterValues,
              }
            ),
            perPhaseTemplates.L2.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT
          )
          : undefined

        const phase3Value = isNotEmptyString(perPhaseTemplates.L3?.value)
          ? getRandomFloatFluctuatedRounded(
            getLimitFromSampledValueTemplateCustomValue(
              perPhaseTemplates.L3.value,
              connectorMaximumPowerPerPhase / unitDivider,
              connectorMinimumPowerPerPhase / unitDivider,
              {
                fallbackValue: connectorMinimumPowerPerPhase / unitDivider,
                limitationEnabled: chargingStation.stationInfo.customValueLimitationMeterValues,
              }
            ),
            perPhaseTemplates.L3.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT
          )
          : undefined

        powerValues.L1 =
          phase1Value ??
          defaultFluctuatedPowerPerPhase ??
          getRandomFloatRounded(
            connectorMaximumPowerPerPhase / unitDivider,
            connectorMinimumPowerPerPhase / unitDivider
          )
        powerValues.L2 =
          phase2Value ??
          defaultFluctuatedPowerPerPhase ??
          getRandomFloatRounded(
            connectorMaximumPowerPerPhase / unitDivider,
            connectorMinimumPowerPerPhase / unitDivider
          )
        powerValues.L3 =
          phase3Value ??
          defaultFluctuatedPowerPerPhase ??
          getRandomFloatRounded(
            connectorMaximumPowerPerPhase / unitDivider,
            connectorMinimumPowerPerPhase / unitDivider
          )
      } else {
        powerValues.L1 = isNotEmptyString(powerTemplate.value)
          ? getRandomFloatFluctuatedRounded(
            getLimitFromSampledValueTemplateCustomValue(
              powerTemplate.value,
              connectorMaximumPower / unitDivider,
              connectorMinimumPower / unitDivider,
              {
                fallbackValue: connectorMinimumPower / unitDivider,
                limitationEnabled: chargingStation.stationInfo.customValueLimitationMeterValues,
              }
            ),
            powerTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT
          )
          : getRandomFloatRounded(
            connectorMaximumPower / unitDivider,
            connectorMinimumPower / unitDivider
          )
        powerValues.L2 = 0
        powerValues.L3 = 0
      }
      powerValues.allPhases = roundTo(powerValues.L1 + powerValues.L2 + powerValues.L3, 2)
      break
    case CurrentType.DC:
      powerValues.allPhases = isNotEmptyString(powerTemplate.value)
        ? getRandomFloatFluctuatedRounded(
          getLimitFromSampledValueTemplateCustomValue(
            powerTemplate.value,
            connectorMaximumPower / unitDivider,
            connectorMinimumPower / unitDivider,
            {
              fallbackValue: connectorMinimumPower / unitDivider,
              limitationEnabled: chargingStation.stationInfo.customValueLimitationMeterValues,
            }
          ),
          powerTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT
        )
        : getRandomFloatRounded(
          connectorMaximumPower / unitDivider,
          connectorMinimumPower / unitDivider
        )
      break
    default: {
      const errMsg = `MeterValues measurand ${
        powerTemplate.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      }: Unknown ${chargingStation.stationInfo?.currentOutType} currentOutType in template file ${
        chargingStation.templateFile
      }, cannot calculate ${
        powerTemplate.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      } measurand value`
      logger.error(`${chargingStation.logPrefix()} ${errMsg}`)
      throw new OCPPError(ErrorType.INTERNAL_ERROR, errMsg, RequestCommand.METER_VALUES)
    }
  }

  return {
    perPhaseTemplates,
    template: powerTemplate,
    values: powerValues,
  }
}

const validatePowerMeasurandValue = (
  chargingStation: ChargingStation,
  connectorId: number,
  connector: ConnectorStatus | undefined,
  sampledValue: SampledValue,
  connectorMaximumPower: number,
  connectorMinimumPower: number,
  debug: boolean
): void => {
  if (
    convertToFloat(sampledValue.value) > connectorMaximumPower ||
    convertToFloat(sampledValue.value) < connectorMinimumPower ||
    debug
  ) {
    logger.error(
      `${chargingStation.logPrefix()} MeterValues measurand ${
        sampledValue.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      }: connector id ${connectorId.toString()}, transaction id ${connector?.transactionId?.toString()}, value: ${connectorMinimumPower.toString()}/${sampledValue.value.toString()}/${connectorMaximumPower.toString()}`
    )
  }
}

const validateCurrentMeasurandValue = (
  chargingStation: ChargingStation,
  connectorId: number,
  connector: ConnectorStatus | undefined,
  sampledValue: SampledValue,
  connectorMaximumAmperage: number,
  connectorMinimumAmperage: number,
  debug: boolean
): void => {
  if (
    convertToFloat(sampledValue.value) > connectorMaximumAmperage ||
    convertToFloat(sampledValue.value) < connectorMinimumAmperage ||
    debug
  ) {
    logger.error(
      `${chargingStation.logPrefix()} MeterValues measurand ${
        sampledValue.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      }: connector id ${connectorId.toString()}, transaction id ${connector?.transactionId?.toString()}, value: ${connectorMinimumAmperage.toString()}/${sampledValue.value.toString()}/${connectorMaximumAmperage.toString()}`
    )
  }
}

const validateCurrentMeasurandPhaseValue = (
  chargingStation: ChargingStation,
  connectorId: number,
  connector: ConnectorStatus | undefined,
  sampledValue: SampledValue,
  connectorMaximumAmperage: number,
  connectorMinimumAmperage: number,
  debug: boolean
): void => {
  if (
    convertToFloat(sampledValue.value) > connectorMaximumAmperage ||
    convertToFloat(sampledValue.value) < connectorMinimumAmperage ||
    debug
  ) {
    logger.error(
      `${chargingStation.logPrefix()} MeterValues measurand ${
        sampledValue.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      }: phase ${
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        sampledValue.phase
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      }, connector id ${connectorId.toString()}, transaction id ${connector?.transactionId?.toString()}, value: ${connectorMinimumAmperage.toString()}/${sampledValue.value.toString()}/${connectorMaximumAmperage.toString()}`
    )
  }
}

const buildCurrentMeasurandValue = (
  chargingStation: ChargingStation,
  connectorId: number
): MultiPhaseMeasurandData | null => {
  const currentTemplate = getSampledValueTemplate(
    chargingStation,
    connectorId,
    MeterValueMeasurand.CURRENT_IMPORT
  )
  if (currentTemplate == null) {
    return null
  }

  let perPhaseTemplates: MeasurandPerPhaseSampledValueTemplates = {}
  if (chargingStation.getNumberOfPhases() === 3) {
    perPhaseTemplates = {
      L1: getSampledValueTemplate(
        chargingStation,
        connectorId,
        MeterValueMeasurand.CURRENT_IMPORT,
        MeterValuePhase.L1
      ),
      L2: getSampledValueTemplate(
        chargingStation,
        connectorId,
        MeterValueMeasurand.CURRENT_IMPORT,
        MeterValuePhase.L2
      ),
      L3: getSampledValueTemplate(
        chargingStation,
        connectorId,
        MeterValueMeasurand.CURRENT_IMPORT,
        MeterValuePhase.L3
      ),
    }
  }

  checkMeasurandPowerDivider(chargingStation, currentTemplate.measurand)
  const currentValues: MeasurandValues = {} as MeasurandValues
  const connectorMaximumAvailablePower =
    chargingStation.getConnectorMaximumAvailablePower(connectorId)
  const connectorMinimumAmperage = currentTemplate.minimumValue ?? 0
  let connectorMaximumAmperage: number

  switch (chargingStation.stationInfo?.currentOutType) {
    case CurrentType.AC:
      connectorMaximumAmperage = ACElectricUtils.amperagePerPhaseFromPower(
        chargingStation.getNumberOfPhases(),
        connectorMaximumAvailablePower,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        chargingStation.stationInfo.voltageOut!
      )
      if (chargingStation.getNumberOfPhases() === 3) {
        const defaultFluctuatedAmperagePerPhase = isNotEmptyString(currentTemplate.value)
          ? getRandomFloatFluctuatedRounded(
            getLimitFromSampledValueTemplateCustomValue(
              currentTemplate.value,
              connectorMaximumAmperage,
              connectorMinimumAmperage,
              {
                fallbackValue: connectorMinimumAmperage,
                limitationEnabled: chargingStation.stationInfo.customValueLimitationMeterValues,
              }
            ),
            currentTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT
          )
          : undefined

        const phase1Value = isNotEmptyString(perPhaseTemplates.L1?.value)
          ? getRandomFloatFluctuatedRounded(
            getLimitFromSampledValueTemplateCustomValue(
              perPhaseTemplates.L1.value,
              connectorMaximumAmperage,
              connectorMinimumAmperage,
              {
                fallbackValue: connectorMinimumAmperage,
                limitationEnabled: chargingStation.stationInfo.customValueLimitationMeterValues,
              }
            ),
            perPhaseTemplates.L1.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT
          )
          : undefined

        const phase2Value = isNotEmptyString(perPhaseTemplates.L2?.value)
          ? getRandomFloatFluctuatedRounded(
            getLimitFromSampledValueTemplateCustomValue(
              perPhaseTemplates.L2.value,
              connectorMaximumAmperage,
              connectorMinimumAmperage,
              {
                fallbackValue: connectorMinimumAmperage,
                limitationEnabled: chargingStation.stationInfo.customValueLimitationMeterValues,
              }
            ),
            perPhaseTemplates.L2.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT
          )
          : undefined

        const phase3Value = isNotEmptyString(perPhaseTemplates.L3?.value)
          ? getRandomFloatFluctuatedRounded(
            getLimitFromSampledValueTemplateCustomValue(
              perPhaseTemplates.L3.value,
              connectorMaximumAmperage,
              connectorMinimumAmperage,
              {
                fallbackValue: connectorMinimumAmperage,
                limitationEnabled: chargingStation.stationInfo.customValueLimitationMeterValues,
              }
            ),
            perPhaseTemplates.L3.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT
          )
          : undefined

        currentValues.L1 =
          phase1Value ??
          defaultFluctuatedAmperagePerPhase ??
          getRandomFloatRounded(connectorMaximumAmperage, connectorMinimumAmperage)
        currentValues.L2 =
          phase2Value ??
          defaultFluctuatedAmperagePerPhase ??
          getRandomFloatRounded(connectorMaximumAmperage, connectorMinimumAmperage)
        currentValues.L3 =
          phase3Value ??
          defaultFluctuatedAmperagePerPhase ??
          getRandomFloatRounded(connectorMaximumAmperage, connectorMinimumAmperage)
      } else {
        currentValues.L1 = isNotEmptyString(currentTemplate.value)
          ? getRandomFloatFluctuatedRounded(
            getLimitFromSampledValueTemplateCustomValue(
              currentTemplate.value,
              connectorMaximumAmperage,
              connectorMinimumAmperage,
              {
                fallbackValue: connectorMinimumAmperage,
                limitationEnabled: chargingStation.stationInfo.customValueLimitationMeterValues,
              }
            ),
            currentTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT
          )
          : getRandomFloatRounded(connectorMaximumAmperage, connectorMinimumAmperage)
        currentValues.L2 = 0
        currentValues.L3 = 0
      }
      currentValues.allPhases = roundTo(
        (currentValues.L1 + currentValues.L2 + currentValues.L3) /
          chargingStation.getNumberOfPhases(),
        2
      )
      break
    case CurrentType.DC:
      connectorMaximumAmperage = DCElectricUtils.amperage(
        connectorMaximumAvailablePower,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        chargingStation.stationInfo.voltageOut!
      )
      currentValues.allPhases = isNotEmptyString(currentTemplate.value)
        ? getRandomFloatFluctuatedRounded(
          getLimitFromSampledValueTemplateCustomValue(
            currentTemplate.value,
            connectorMaximumAmperage,
            connectorMinimumAmperage,
            {
              fallbackValue: connectorMinimumAmperage,
              limitationEnabled: chargingStation.stationInfo.customValueLimitationMeterValues,
            }
          ),
          currentTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT
        )
        : getRandomFloatRounded(connectorMaximumAmperage, connectorMinimumAmperage)
      break
    default: {
      const errMsg = `MeterValues measurand ${
        currentTemplate.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      }: Unknown ${chargingStation.stationInfo?.currentOutType} currentOutType in template file ${
        chargingStation.templateFile
      }, cannot calculate ${
        currentTemplate.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      } measurand value`
      logger.error(`${chargingStation.logPrefix()} ${errMsg}`)
      throw new OCPPError(ErrorType.INTERNAL_ERROR, errMsg, RequestCommand.METER_VALUES)
    }
  }

  return {
    perPhaseTemplates,
    template: currentTemplate,
    values: currentValues,
  }
}

export const buildMeterValue = (
  chargingStation: ChargingStation,
  connectorId: number,
  transactionId: number,
  interval: number,
  debug = false
): MeterValue => {
  const connector = chargingStation.getConnectorStatus(connectorId)
  let meterValue: MeterValue

  switch (chargingStation.stationInfo?.ocppVersion) {
    case OCPPVersion.VERSION_16: {
      meterValue = {
        sampledValue: [],
        timestamp: new Date(),
      }
      // SoC measurand
      const socMeasurand = buildSocMeasurandValue(chargingStation, connectorId)
      if (socMeasurand != null) {
        const socSampledValue = buildSampledValue(
          chargingStation.stationInfo.ocppVersion,
          socMeasurand.template,
          socMeasurand.value
        )
        meterValue.sampledValue.push(socSampledValue)
        validateSocMeasurandValue(
          chargingStation,
          connectorId,
          socSampledValue,
          socMeasurand.template.minimumValue ?? 0,
          100,
          debug
        )
      }
      // Voltage measurand
      const voltageMeasurand = buildVoltageMeasurandValue(chargingStation, connectorId)
      if (voltageMeasurand != null) {
        addMainVoltageToMeterValue(chargingStation, meterValue, voltageMeasurand)
        for (
          let phase = 1;
          chargingStation.getNumberOfPhases() === 3 && phase <= chargingStation.getNumberOfPhases();
          phase++
        ) {
          addPhaseVoltageToMeterValue(
            chargingStation,
            connectorId,
            meterValue,
            voltageMeasurand,
            phase
          )
          addLineToLineVoltageToMeterValue(
            chargingStation,
            connectorId,
            meterValue,
            voltageMeasurand,
            phase
          )
        }
      }
      // Power.Active.Import measurand
      const powerMeasurand = buildPowerMeasurandValue(chargingStation, connectorId)
      if (powerMeasurand != null) {
        const unitDivider = powerMeasurand.template.unit === MeterValueUnit.KILO_WATT ? 1000 : 1
        const connectorMaximumAvailablePower =
          chargingStation.getConnectorMaximumAvailablePower(connectorId)
        const connectorMaximumPower = Math.round(connectorMaximumAvailablePower)
        const connectorMinimumPower = Math.round(powerMeasurand.template.minimumValue ?? 0)

        meterValue.sampledValue.push(
          buildSampledValue(
            chargingStation.stationInfo.ocppVersion,
            powerMeasurand.template,
            powerMeasurand.values.allPhases
          )
        )
        const sampledValuesIndex = meterValue.sampledValue.length - 1
        validatePowerMeasurandValue(
          chargingStation,
          connectorId,
          connector,
          meterValue.sampledValue[sampledValuesIndex],
          connectorMaximumPower / unitDivider,
          connectorMinimumPower / unitDivider,
          debug
        )
        if (chargingStation.getNumberOfPhases() === 3) {
          const connectorMaximumPowerPerPhase = Math.round(
            connectorMaximumAvailablePower / chargingStation.getNumberOfPhases()
          )
          const connectorMinimumPowerPerPhase = Math.round(
            connectorMinimumPower / chargingStation.getNumberOfPhases()
          )
          for (let phase = 1; phase <= chargingStation.getNumberOfPhases(); phase++) {
            const phaseTemplate =
              powerMeasurand.perPhaseTemplates[
                `L${phase.toString()}` as keyof MeasurandPerPhaseSampledValueTemplates
              ]
            if (phaseTemplate != null) {
              const phaseValue = `L${phase.toString()}-N` as MeterValuePhase
              const phasePowerValue =
                powerMeasurand.values[`L${phase.toString()}` as keyof MeasurandValues]
              meterValue.sampledValue.push(
                buildSampledValue(
                  chargingStation.stationInfo.ocppVersion,
                  phaseTemplate,
                  phasePowerValue,
                  undefined,
                  phaseValue
                )
              )
              const sampledValuesPerPhaseIndex = meterValue.sampledValue.length - 1
              validatePowerMeasurandValue(
                chargingStation,
                connectorId,
                connector,
                meterValue.sampledValue[sampledValuesPerPhaseIndex],
                connectorMaximumPowerPerPhase / unitDivider,
                connectorMinimumPowerPerPhase / unitDivider,
                debug
              )
            }
          }
        }
      }
      // Current.Import measurand
      const currentMeasurand = buildCurrentMeasurandValue(chargingStation, connectorId)
      if (currentMeasurand != null) {
        const connectorMaximumAvailablePower =
          chargingStation.getConnectorMaximumAvailablePower(connectorId)
        const connectorMaximumAmperage =
          chargingStation.stationInfo.currentOutType === CurrentType.AC
            ? ACElectricUtils.amperagePerPhaseFromPower(
              chargingStation.getNumberOfPhases(),
              connectorMaximumAvailablePower,
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              chargingStation.stationInfo.voltageOut!
            )
            : DCElectricUtils.amperage(
              connectorMaximumAvailablePower,
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              chargingStation.stationInfo.voltageOut!
            )
        const connectorMinimumAmperage = currentMeasurand.template.minimumValue ?? 0

        meterValue.sampledValue.push(
          buildSampledValue(
            chargingStation.stationInfo.ocppVersion,
            currentMeasurand.template,
            currentMeasurand.values.allPhases
          )
        )
        const sampledValuesIndex = meterValue.sampledValue.length - 1
        validateCurrentMeasurandValue(
          chargingStation,
          connectorId,
          connector,
          meterValue.sampledValue[sampledValuesIndex],
          connectorMaximumAmperage,
          connectorMinimumAmperage,
          debug
        )
        for (
          let phase = 1;
          chargingStation.getNumberOfPhases() === 3 && phase <= chargingStation.getNumberOfPhases();
          phase++
        ) {
          const phaseValue = `L${phase.toString()}` as MeterValuePhase
          meterValue.sampledValue.push(
            buildSampledValue(
              chargingStation.stationInfo.ocppVersion,
              currentMeasurand.perPhaseTemplates[
                phaseValue as keyof MeasurandPerPhaseSampledValueTemplates
              ] ?? currentMeasurand.template,
              currentMeasurand.values[phaseValue as keyof MeasurandPerPhaseSampledValueTemplates],
              undefined,
              phaseValue
            )
          )
          const sampledValuesPerPhaseIndex = meterValue.sampledValue.length - 1
          validateCurrentMeasurandPhaseValue(
            chargingStation,
            connectorId,
            connector,
            meterValue.sampledValue[sampledValuesPerPhaseIndex],
            connectorMaximumAmperage,
            connectorMinimumAmperage,
            debug
          )
        }
      }
      // Energy.Active.Import.Register measurand (default)
      const energyMeasurand = buildEnergyMeasurandValue(chargingStation, connectorId, interval)
      if (energyMeasurand != null) {
        updateConnectorEnergyValues(connector, energyMeasurand.value)
        const unitDivider =
          energyMeasurand.template.unit === MeterValueUnit.KILO_WATT_HOUR ? 1000 : 1
        const energySampledValue = buildSampledValue(
          chargingStation.stationInfo.ocppVersion,
          energyMeasurand.template,
          roundTo(
            chargingStation.getEnergyActiveImportRegisterByTransactionId(transactionId) /
              unitDivider,
            2
          )
        )
        meterValue.sampledValue.push(energySampledValue)
        const connectorMaximumAvailablePower =
          chargingStation.getConnectorMaximumAvailablePower(connectorId)
        const connectorMaximumEnergyRounded = roundTo(
          (connectorMaximumAvailablePower * interval) / (3600 * 1000),
          2
        )
        const connectorMinimumEnergyRounded = roundTo(energyMeasurand.template.minimumValue ?? 0, 2)
        validateEnergyMeasurandValue(
          chargingStation,
          connectorId,
          energySampledValue,
          energyMeasurand.value,
          connectorMinimumEnergyRounded,
          connectorMaximumEnergyRounded,
          interval,
          debug
        )
      }
      return meterValue
    }
    case OCPPVersion.VERSION_20:
    case OCPPVersion.VERSION_201: {
      const meterValue: OCPP20MeterValue = {
        sampledValue: [],
        timestamp: new Date(),
      }
      // SoC measurand
      const socMeasurand = buildSocMeasurandValue(chargingStation, connectorId)
      if (socMeasurand != null) {
        const socSampledValue = buildSampledValue(
          chargingStation.stationInfo.ocppVersion,
          socMeasurand.template,
          socMeasurand.value
        )
        meterValue.sampledValue.push(socSampledValue)
        validateSocMeasurandValue(
          chargingStation,
          connectorId,
          socSampledValue,
          socMeasurand.template.minimumValue ?? 0,
          100,
          debug
        )
      }
      // Voltage measurand
      const voltageMeasurand = buildVoltageMeasurandValue(chargingStation, connectorId)
      if (voltageMeasurand != null) {
        addMainVoltageToMeterValue(chargingStation, meterValue, voltageMeasurand)
        for (
          let phase = 1;
          chargingStation.getNumberOfPhases() === 3 && phase <= chargingStation.getNumberOfPhases();
          phase++
        ) {
          addPhaseVoltageToMeterValue(
            chargingStation,
            connectorId,
            meterValue,
            voltageMeasurand,
            phase
          )
          addLineToLineVoltageToMeterValue(
            chargingStation,
            connectorId,
            meterValue,
            voltageMeasurand,
            phase
          )
        }
      }
      // Energy.Active.Import.Register measurand
      const energyMeasurand = buildEnergyMeasurandValue(chargingStation, connectorId, interval)
      if (energyMeasurand != null) {
        updateConnectorEnergyValues(connector, energyMeasurand.value)
        const unitDivider =
          energyMeasurand.template.unit === MeterValueUnit.KILO_WATT_HOUR ? 1000 : 1
        const energySampledValue = buildSampledValue(
          chargingStation.stationInfo.ocppVersion,
          energyMeasurand.template,
          roundTo(
            chargingStation.getEnergyActiveImportRegisterByTransactionId(transactionId) /
              unitDivider,
            2
          )
        )
        meterValue.sampledValue.push(energySampledValue)
        const connectorMaximumAvailablePower =
          chargingStation.getConnectorMaximumAvailablePower(connectorId)
        const connectorMaximumEnergyRounded = roundTo(
          (connectorMaximumAvailablePower * interval) / (3600 * 1000),
          2
        )
        const connectorMinimumEnergyRounded = roundTo(energyMeasurand.template.minimumValue ?? 0, 2)
        validateEnergyMeasurandValue(
          chargingStation,
          connectorId,
          energySampledValue,
          energyMeasurand.value,
          connectorMinimumEnergyRounded,
          connectorMaximumEnergyRounded,
          interval,
          debug
        )
      }
      // Power.Active.Import measurand
      const powerMeasurand = buildPowerMeasurandValue(chargingStation, connectorId)
      if (powerMeasurand?.values.allPhases != null) {
        const powerSampledValue = buildSampledValue(
          chargingStation.stationInfo.ocppVersion,
          powerMeasurand.template,
          powerMeasurand.values.allPhases
        )
        meterValue.sampledValue.push(powerSampledValue)
      }
      // Current.Import measurand
      const currentMeasurand = buildCurrentMeasurandValue(chargingStation, connectorId)
      if (currentMeasurand?.values.allPhases != null) {
        const currentSampledValue = buildSampledValue(
          chargingStation.stationInfo.ocppVersion,
          currentMeasurand.template,
          currentMeasurand.values.allPhases
        )
        meterValue.sampledValue.push(currentSampledValue)
      }
      return meterValue
    }
    default:
      throw new OCPPError(
        ErrorType.INTERNAL_ERROR,
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Cannot build meterValue: OCPP version ${chargingStation.stationInfo?.ocppVersion} not supported`,
        RequestCommand.METER_VALUES
      )
  }
}

export const buildTransactionEndMeterValue = (
  chargingStation: ChargingStation,
  connectorId: number,
  meterStop: number | undefined
): MeterValue => {
  let meterValue: MeterValue
  let sampledValueTemplate: SampledValueTemplate | undefined
  let unitDivider: number
  switch (chargingStation.stationInfo?.ocppVersion) {
    case OCPPVersion.VERSION_16:
    case OCPPVersion.VERSION_20:
    case OCPPVersion.VERSION_201:
      meterValue = {
        sampledValue: [],
        timestamp: new Date(),
      }
      // Energy.Active.Import.Register measurand (default)
      sampledValueTemplate = getSampledValueTemplate(chargingStation, connectorId)
      unitDivider = sampledValueTemplate?.unit === MeterValueUnit.KILO_WATT_HOUR ? 1000 : 1
      meterValue.sampledValue.push(
        buildSampledValue(
          chargingStation.stationInfo.ocppVersion,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          sampledValueTemplate!,
          roundTo((meterStop ?? 0) / unitDivider, 4),
          MeterValueContext.TRANSACTION_END
        )
      )
      return meterValue
    default:
      throw new OCPPError(
        ErrorType.INTERNAL_ERROR,
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Cannot build meterValue: OCPP version ${chargingStation.stationInfo?.ocppVersion} not supported`,
        RequestCommand.METER_VALUES
      )
  }
}

const checkMeasurandPowerDivider = (
  chargingStation: ChargingStation,
  measurandType: MeterValueMeasurand | undefined
): void => {
  if (chargingStation.powerDivider == null) {
    const errMsg = `MeterValues measurand ${
      measurandType ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
    }: powerDivider is undefined`
    logger.error(`${chargingStation.logPrefix()} ${errMsg}`)
    throw new OCPPError(ErrorType.INTERNAL_ERROR, errMsg, RequestCommand.METER_VALUES)
  } else if (chargingStation.powerDivider <= 0) {
    const errMsg = `MeterValues measurand ${
      measurandType ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
    }: powerDivider have zero or below value ${chargingStation.powerDivider.toString()}`
    logger.error(`${chargingStation.logPrefix()} ${errMsg}`)
    throw new OCPPError(ErrorType.INTERNAL_ERROR, errMsg, RequestCommand.METER_VALUES)
  }
}

const getLimitFromSampledValueTemplateCustomValue = (
  value: string | undefined,
  maxLimit: number,
  minLimit: number,
  options?: {
    fallbackValue?: number
    limitationEnabled?: boolean
    unitMultiplier?: number
  }
): number => {
  options = {
    ...{
      fallbackValue: 0,
      limitationEnabled: false,
      unitMultiplier: 1,
    },
    ...options,
  }
  const parsedValue = Number.parseFloat(value ?? '')
  if (options.limitationEnabled) {
    return max(
      min(
        (!Number.isNaN(parsedValue) ? parsedValue : Number.POSITIVE_INFINITY) *
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          options.unitMultiplier!,
        maxLimit
      ),
      minLimit
    )
  }
  return (
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    (!Number.isNaN(parsedValue) ? parsedValue : options.fallbackValue!) * options.unitMultiplier!
  )
}

const isMeasurandSupported = (measurand: MeterValueMeasurand): boolean => {
  const supportedMeasurands = OCPPConstants.OCPP_MEASURANDS_SUPPORTED as readonly string[]
  return supportedMeasurands.includes(measurand as string)
}

const getSampledValueTemplate = (
  chargingStation: ChargingStation,
  connectorId: number,
  measurand: MeterValueMeasurand = MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
  phase?: MeterValuePhase
): SampledValueTemplate | undefined => {
  const onPhaseStr = phase != null ? `on phase ${phase} ` : ''
  if (!isMeasurandSupported(measurand)) {
    logger.warn(
      `${chargingStation.logPrefix()} Trying to get unsupported MeterValues measurand '${measurand}' ${onPhaseStr}in template on connector id ${connectorId.toString()}`
    )
    return
  }
  if (
    measurand !== MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER &&
    getConfigurationKey(
      chargingStation,
      StandardParametersKey.MeterValuesSampledData
    )?.value?.includes(measurand) === false
  ) {
    logger.debug(
      `${chargingStation.logPrefix()} Trying to get MeterValues measurand '${measurand}' ${onPhaseStr}in template on connector id ${connectorId.toString()} not found in '${
        StandardParametersKey.MeterValuesSampledData
      }' OCPP parameter`
    )
    return
  }
  const sampledValueTemplates =
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    chargingStation.getConnectorStatus(connectorId)!.MeterValues
  for (
    let index = 0;
    isNotEmptyArray(sampledValueTemplates) && index < sampledValueTemplates.length;
    index++
  ) {
    if (
      !isMeasurandSupported(
        sampledValueTemplates[index].measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      )
    ) {
      logger.warn(
        `${chargingStation.logPrefix()} Unsupported MeterValues measurand '${measurand}' ${onPhaseStr}in template on connector id ${connectorId.toString()}`
      )
    } else if (
      phase != null &&
      sampledValueTemplates[index].phase === phase &&
      sampledValueTemplates[index].measurand === measurand &&
      getConfigurationKey(
        chargingStation,
        StandardParametersKey.MeterValuesSampledData
      )?.value?.includes(measurand) === true
    ) {
      return sampledValueTemplates[index]
    } else if (
      phase == null &&
      sampledValueTemplates[index].phase == null &&
      sampledValueTemplates[index].measurand === measurand &&
      getConfigurationKey(
        chargingStation,
        StandardParametersKey.MeterValuesSampledData
      )?.value?.includes(measurand) === true
    ) {
      return sampledValueTemplates[index]
    } else if (
      measurand === MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER &&
      (sampledValueTemplates[index].measurand == null ||
        sampledValueTemplates[index].measurand === measurand)
    ) {
      return sampledValueTemplates[index]
    }
  }
  if (measurand === MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER) {
    const errorMsg = `Missing MeterValues for default measurand '${measurand}' in template on connector id ${connectorId.toString()}`
    logger.error(`${chargingStation.logPrefix()} ${errorMsg}`)
    throw new BaseError(errorMsg)
  }
  logger.debug(
    `${chargingStation.logPrefix()} No MeterValues for measurand '${measurand}' ${onPhaseStr}in template on connector id ${connectorId.toString()}`
  )
}

function buildSampledValue (
  ocppVersion: OCPPVersion.VERSION_16 | undefined,
  sampledValueTemplate: SampledValueTemplate,
  value: number,
  context?: MeterValueContext,
  phase?: MeterValuePhase
): OCPP16SampledValue
function buildSampledValue (
  ocppVersion: OCPPVersion.VERSION_20 | OCPPVersion.VERSION_201 | undefined,
  sampledValueTemplate: SampledValueTemplate,
  value: number,
  context?: MeterValueContext,
  phase?: MeterValuePhase
): OCPP20SampledValue
/**
 * Builds a sampled value object according to the specified OCPP version
 * @param ocppVersion - The OCPP version to use for formatting the sampled value
 * @param sampledValueTemplate - Template containing measurement configuration and metadata
 * @param value - The measured numeric value to be included in the sampled value
 * @param context - Optional context specifying when the measurement was taken (e.g., Sample.Periodic)
 * @param phase - Optional phase information for multi-phase electrical measurements
 * @returns A sampled value object formatted according to the specified OCPP version
 */
function buildSampledValue (
  ocppVersion: OCPPVersion | undefined,
  sampledValueTemplate: SampledValueTemplate,
  value: number,
  context?: MeterValueContext,
  phase?: MeterValuePhase
): SampledValue {
  const sampledValueMeasurand = sampledValueTemplate.measurand ?? getMeasurandDefault()
  const sampledValueUnit =
    sampledValueTemplate.unit ?? getMeasurandDefaultUnit(sampledValueMeasurand)
  const sampledValueContext =
    context ?? sampledValueTemplate.context ?? getMeasurandDefaultContext(sampledValueMeasurand)
  const sampledValueLocation =
    sampledValueTemplate.location ?? getMeasurandDefaultLocation(sampledValueMeasurand)
  const sampledValuePhase = phase ?? sampledValueTemplate.phase

  switch (ocppVersion) {
    case OCPPVersion.VERSION_16:
      // OCPP 1.6 format
      return {
        context: sampledValueContext,
        location: sampledValueLocation,
        measurand: sampledValueMeasurand,
        unit: sampledValueUnit,
        value: value.toString(), // OCPP 1.6 uses string
        ...(sampledValuePhase != null && { phase: sampledValuePhase }),
      } as OCPP16SampledValue
    case OCPPVersion.VERSION_20:
    case OCPPVersion.VERSION_201:
      // OCPP 2.0 format
      return {
        context: sampledValueContext,
        location: sampledValueLocation,
        measurand: sampledValueMeasurand,
        ...(sampledValueUnit !== undefined && { unitOfMeasure: { unit: sampledValueUnit } }),
        value, // OCPP 2.0 uses number
        ...(sampledValuePhase != null && { phase: sampledValuePhase }),
      } as OCPP20SampledValue
    default:
      throw new OCPPError(
        ErrorType.INTERNAL_ERROR,
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Cannot build sampledValue: OCPP version ${ocppVersion} not supported`,
        RequestCommand.METER_VALUES
      )
  }
}

const getMeasurandDefaultContext = (measurandType: MeterValueMeasurand): MeterValueContext => {
  return MeterValueContext.SAMPLE_PERIODIC
}

const getMeasurandDefaultLocation = (
  measurandType: MeterValueMeasurand
): MeterValueLocation | undefined => {
  switch (measurandType) {
    case MeterValueMeasurand.CURRENT_EXPORT:
    case MeterValueMeasurand.CURRENT_IMPORT:
    case MeterValueMeasurand.CURRENT_OFFERED:
      return MeterValueLocation.OUTLET

    case MeterValueMeasurand.ENERGY_ACTIVE_EXPORT_INTERVAL:
    case MeterValueMeasurand.ENERGY_ACTIVE_EXPORT_REGISTER:
    case MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_INTERVAL:
    case MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER:
    case MeterValueMeasurand.ENERGY_ACTIVE_NET:
    case MeterValueMeasurand.ENERGY_APPARENT_EXPORT:
    case MeterValueMeasurand.ENERGY_APPARENT_IMPORT:
    case MeterValueMeasurand.ENERGY_APPARENT_NET:
    case MeterValueMeasurand.ENERGY_REACTIVE_EXPORT_INTERVAL:
    case MeterValueMeasurand.ENERGY_REACTIVE_EXPORT_REGISTER:
    case MeterValueMeasurand.ENERGY_REACTIVE_IMPORT_INTERVAL:
    case MeterValueMeasurand.ENERGY_REACTIVE_IMPORT_REGISTER:
    case MeterValueMeasurand.ENERGY_REACTIVE_NET:
      return MeterValueLocation.OUTLET

    case MeterValueMeasurand.FAN_RPM:
      return MeterValueLocation.BODY

    case MeterValueMeasurand.FREQUENCY:
      return MeterValueLocation.OUTLET

    case MeterValueMeasurand.POWER_ACTIVE_EXPORT:
    case MeterValueMeasurand.POWER_ACTIVE_IMPORT:
    case MeterValueMeasurand.POWER_FACTOR:
    case MeterValueMeasurand.POWER_OFFERED:
    case MeterValueMeasurand.POWER_REACTIVE_EXPORT:
    case MeterValueMeasurand.POWER_REACTIVE_IMPORT:
      return MeterValueLocation.OUTLET

    case MeterValueMeasurand.STATE_OF_CHARGE:
      return MeterValueLocation.EV

    case MeterValueMeasurand.TEMPERATURE:
      return MeterValueLocation.OUTLET

    case MeterValueMeasurand.VOLTAGE:
      return MeterValueLocation.OUTLET

    default:
      return undefined
  }
}

const getMeasurandDefault = (): MeterValueMeasurand => {
  return MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
}

const getMeasurandDefaultUnit = (
  measurandType: MeterValueMeasurand
): MeterValueUnit | undefined => {
  switch (measurandType) {
    case MeterValueMeasurand.CURRENT_EXPORT:
    case MeterValueMeasurand.CURRENT_IMPORT:
    case MeterValueMeasurand.CURRENT_OFFERED:
      return MeterValueUnit.AMP

    case MeterValueMeasurand.ENERGY_ACTIVE_EXPORT_INTERVAL:
    case MeterValueMeasurand.ENERGY_ACTIVE_EXPORT_REGISTER:
    case MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_INTERVAL:
    case MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER:
    case MeterValueMeasurand.ENERGY_ACTIVE_NET:
    case MeterValueMeasurand.ENERGY_APPARENT_EXPORT:
    case MeterValueMeasurand.ENERGY_APPARENT_IMPORT:
    case MeterValueMeasurand.ENERGY_APPARENT_NET:
      return MeterValueUnit.WATT_HOUR

    case MeterValueMeasurand.ENERGY_REACTIVE_EXPORT_INTERVAL:
    case MeterValueMeasurand.ENERGY_REACTIVE_EXPORT_REGISTER:
    case MeterValueMeasurand.ENERGY_REACTIVE_IMPORT_INTERVAL:
    case MeterValueMeasurand.ENERGY_REACTIVE_IMPORT_REGISTER:
    case MeterValueMeasurand.ENERGY_REACTIVE_NET:
      return MeterValueUnit.VAR_HOUR

    case MeterValueMeasurand.FAN_RPM:
      return MeterValueUnit.REVOLUTIONS_PER_MINUTE

    case MeterValueMeasurand.FREQUENCY:
      return MeterValueUnit.HERTZ

    case MeterValueMeasurand.POWER_ACTIVE_EXPORT:
    case MeterValueMeasurand.POWER_ACTIVE_IMPORT:
    case MeterValueMeasurand.POWER_OFFERED:
      return MeterValueUnit.WATT

    case MeterValueMeasurand.POWER_FACTOR:
      return undefined

    case MeterValueMeasurand.POWER_REACTIVE_EXPORT:
    case MeterValueMeasurand.POWER_REACTIVE_IMPORT:
      return MeterValueUnit.VAR

    case MeterValueMeasurand.STATE_OF_CHARGE:
      return MeterValueUnit.PERCENT

    case MeterValueMeasurand.TEMPERATURE:
      return MeterValueUnit.TEMP_CELSIUS

    case MeterValueMeasurand.VOLTAGE:
      return MeterValueUnit.VOLT

    default:
      return undefined
  }
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class OCPPServiceUtils {
  public static readonly buildTransactionEndMeterValue = buildTransactionEndMeterValue
  public static readonly isIdTagAuthorized = isIdTagAuthorized
  public static readonly restoreConnectorStatus = restoreConnectorStatus
  public static readonly sendAndSetConnectorStatus = sendAndSetConnectorStatus

  protected static buildSampledValue = buildSampledValue
  protected static getSampledValueTemplate = getSampledValueTemplate

  protected constructor () {
    // This is intentional
  }

  public static isConnectorIdValid (
    chargingStation: ChargingStation,
    ocppCommand: IncomingRequestCommand,
    connectorId: number
  ): boolean {
    if (connectorId < 0) {
      logger.error(
        `${chargingStation.logPrefix()} ${ocppCommand} incoming request received with invalid connector id ${connectorId.toString()}`
      )
      return false
    }
    return true
  }

  public static isIncomingRequestCommandSupported (
    chargingStation: ChargingStation,
    command: IncomingRequestCommand
  ): boolean {
    const isIncomingRequestCommand =
      Object.values<IncomingRequestCommand>(IncomingRequestCommand).includes(command)
    if (
      isIncomingRequestCommand &&
      chargingStation.stationInfo?.commandsSupport?.incomingCommands == null
    ) {
      return true
    } else if (
      isIncomingRequestCommand &&
      chargingStation.stationInfo?.commandsSupport?.incomingCommands[command] != null
    ) {
      return chargingStation.stationInfo.commandsSupport.incomingCommands[command]
    }
    logger.error(`${chargingStation.logPrefix()} Unknown incoming OCPP command '${command}'`)
    return false
  }

  public static isMessageTriggerSupported (
    chargingStation: ChargingStation,
    messageTrigger: MessageTrigger
  ): boolean {
    const isMessageTrigger = Object.values(MessageTrigger).includes(messageTrigger)
    if (isMessageTrigger && chargingStation.stationInfo?.messageTriggerSupport == null) {
      return true
    } else if (
      isMessageTrigger &&
      chargingStation.stationInfo?.messageTriggerSupport?.[messageTrigger] != null
    ) {
      return chargingStation.stationInfo.messageTriggerSupport[messageTrigger]
    }
    logger.error(
      `${chargingStation.logPrefix()} Unknown incoming OCPP message trigger '${messageTrigger}'`
    )
    return false
  }

  public static isRequestCommandSupported (
    chargingStation: ChargingStation,
    command: RequestCommand
  ): boolean {
    const isRequestCommand = Object.values<RequestCommand>(RequestCommand).includes(command)
    if (
      isRequestCommand &&
      chargingStation.stationInfo?.commandsSupport?.outgoingCommands == null
    ) {
      return true
    } else if (
      isRequestCommand &&
      chargingStation.stationInfo?.commandsSupport?.outgoingCommands?.[command] != null
    ) {
      return chargingStation.stationInfo.commandsSupport.outgoingCommands[command]
    }
    logger.error(`${chargingStation.logPrefix()} Unknown outgoing OCPP command '${command}'`)
    return false
  }

  protected static parseJsonSchemaFile<T extends JsonType>(
    relativePath: string,
    ocppVersion: OCPPVersion,
    moduleName?: string,
    methodName?: string
  ): JSONSchemaType<T> {
    const filePath = join(dirname(fileURLToPath(import.meta.url)), relativePath)
    try {
      return JSON.parse(readFileSync(filePath, 'utf8')) as JSONSchemaType<T>
    } catch (error) {
      handleFileException(
        filePath,
        FileType.JsonSchema,
        error as NodeJS.ErrnoException,
        OCPPServiceUtils.logPrefix(ocppVersion, moduleName, methodName),
        { throwError: false }
      )
      return {} as JSONSchemaType<T>
    }
  }

  private static readonly logPrefix = (
    ocppVersion: OCPPVersion,
    moduleName?: string,
    methodName?: string
  ): string => {
    const logMsg =
      isNotEmptyString(moduleName) && isNotEmptyString(methodName)
        ? ` OCPP ${ocppVersion} | ${moduleName}.${methodName}:`
        : ` OCPP ${ocppVersion} |`
    return logPrefix(logMsg)
  }
}
