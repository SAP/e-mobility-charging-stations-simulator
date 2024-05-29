import { randomInt } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { DefinedError, ErrorObject, JSONSchemaType } from 'ajv'
import { isDate } from 'date-fns'

import {
  type ChargingStation,
  getConfigurationKey,
  getIdTagsFile
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
  type OCPP16StatusNotificationRequest,
  type OCPP20ConnectorStatusEnumType,
  type OCPP20StatusNotificationRequest,
  OCPPVersion,
  RequestCommand,
  type SampledValue,
  type SampledValueTemplate,
  StandardParametersKey,
  type StatusNotificationRequest,
  type StatusNotificationResponse
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
  roundTo
} from '../../utils/index.js'
import { OCPP16Constants } from './1.6/OCPP16Constants.js'
import { OCPP20Constants } from './2.0/OCPP20Constants.js'
import { OCPPConstants } from './OCPPConstants.js'

export const getMessageTypeString = (messageType: MessageType | undefined): string => {
  switch (messageType) {
    case MessageType.CALL_MESSAGE:
      return 'request'
    case MessageType.CALL_RESULT_MESSAGE:
      return 'response'
    case MessageType.CALL_ERROR_MESSAGE:
      return 'error'
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
        status: status as OCPP16ChargePointStatus,
        errorCode: ChargePointErrorCode.NO_ERROR
      } satisfies OCPP16StatusNotificationRequest
    case OCPPVersion.VERSION_20:
    case OCPPVersion.VERSION_201:
      return {
        timestamp: new Date(),
        connectorStatus: status as OCPP20ConnectorStatusEnumType,
        connectorId,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        evseId: evseId!
      } satisfies OCPP20StatusNotificationRequest
    default:
      throw new BaseError('Cannot build status notification payload: OCPP version not supported')
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
          idTag
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
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  chargingStation.getConnectorStatus(connectorId)!.status = status
  chargingStation.emit(ChargingStationEvents.connectorStatusChanged, {
    connectorId,
    ...chargingStation.getConnectorStatus(connectorId)
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
      throw new BaseError(
        `Cannot check connector status transition: OCPP version ${chargingStation.stationInfo?.ocppVersion} not supported`
      )
  }
  if (!transitionAllowed) {
    logger.warn(
      `${chargingStation.logPrefix()} OCPP ${
        chargingStation.stationInfo.ocppVersion
      } connector id ${connectorId} status transition from '${
        chargingStation.getConnectorStatus(connectorId)?.status
      }' to '${status}' is not allowed`
    )
  }
  return transitionAllowed
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
  let socSampledValueTemplate: SampledValueTemplate | undefined
  let voltageSampledValueTemplate: SampledValueTemplate | undefined
  let powerSampledValueTemplate: SampledValueTemplate | undefined
  let powerPerPhaseSampledValueTemplates: MeasurandPerPhaseSampledValueTemplates = {}
  let currentSampledValueTemplate: SampledValueTemplate | undefined
  let currentPerPhaseSampledValueTemplates: MeasurandPerPhaseSampledValueTemplates = {}
  let energySampledValueTemplate: SampledValueTemplate | undefined
  switch (chargingStation.stationInfo?.ocppVersion) {
    case OCPPVersion.VERSION_16:
      meterValue = {
        timestamp: new Date(),
        sampledValue: []
      }
      // SoC measurand
      socSampledValueTemplate = getSampledValueTemplate(
        chargingStation,
        connectorId,
        MeterValueMeasurand.STATE_OF_CHARGE
      )
      if (socSampledValueTemplate != null) {
        const socMaximumValue = 100
        const socMinimumValue = socSampledValueTemplate.minimumValue ?? 0
        const socSampledValueTemplateValue = isNotEmptyString(socSampledValueTemplate.value)
          ? getRandomFloatFluctuatedRounded(
            Number.parseInt(socSampledValueTemplate.value),
            socSampledValueTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT
          )
          : randomInt(socMinimumValue, socMaximumValue)
        meterValue.sampledValue.push(
          buildSampledValue(socSampledValueTemplate, socSampledValueTemplateValue)
        )
        const sampledValuesIndex = meterValue.sampledValue.length - 1
        if (
          convertToInt(meterValue.sampledValue[sampledValuesIndex].value) > socMaximumValue ||
          convertToInt(meterValue.sampledValue[sampledValuesIndex].value) < socMinimumValue ||
          debug
        ) {
          logger.error(
            `${chargingStation.logPrefix()} MeterValues measurand ${
              meterValue.sampledValue[sampledValuesIndex].measurand ??
              MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
            }: connector id ${connectorId}, transaction id ${
              connector?.transactionId
            }, value: ${socMinimumValue}/${
              meterValue.sampledValue[sampledValuesIndex].value
            }/${socMaximumValue}`
          )
        }
      }
      // Voltage measurand
      voltageSampledValueTemplate = getSampledValueTemplate(
        chargingStation,
        connectorId,
        MeterValueMeasurand.VOLTAGE
      )
      if (voltageSampledValueTemplate != null) {
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
        if (
          chargingStation.getNumberOfPhases() !== 3 ||
          (chargingStation.getNumberOfPhases() === 3 &&
            chargingStation.stationInfo.mainVoltageMeterValues === true)
        ) {
          meterValue.sampledValue.push(
            buildSampledValue(voltageSampledValueTemplate, voltageMeasurandValue)
          )
        }
        for (
          let phase = 1;
          chargingStation.getNumberOfPhases() === 3 && phase <= chargingStation.getNumberOfPhases();
          phase++
        ) {
          const phaseLineToNeutralValue = `L${phase}-N`
          const voltagePhaseLineToNeutralSampledValueTemplate = getSampledValueTemplate(
            chargingStation,
            connectorId,
            MeterValueMeasurand.VOLTAGE,
            phaseLineToNeutralValue as MeterValuePhase
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
              voltagePhaseLineToNeutralSampledValueTemplate ?? voltageSampledValueTemplate,
              voltagePhaseLineToNeutralMeasurandValue ?? voltageMeasurandValue,
              undefined,
              phaseLineToNeutralValue as MeterValuePhase
            )
          )
          if (chargingStation.stationInfo.phaseLineToLineVoltageMeterValues === true) {
            const phaseLineToLineValue = `L${phase}-L${
              (phase + 1) % chargingStation.getNumberOfPhases() !== 0
                ? (phase + 1) % chargingStation.getNumberOfPhases()
                : chargingStation.getNumberOfPhases()
            }`
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
              phaseLineToLineValue as MeterValuePhase
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
            const defaultVoltagePhaseLineToLineMeasurandValue = getRandomFloatFluctuatedRounded(
              voltagePhaseLineToLineValueRounded,
              fluctuationPercent
            )
            meterValue.sampledValue.push(
              buildSampledValue(
                voltagePhaseLineToLineSampledValueTemplate ?? voltageSampledValueTemplate,
                voltagePhaseLineToLineMeasurandValue ?? defaultVoltagePhaseLineToLineMeasurandValue,
                undefined,
                phaseLineToLineValue as MeterValuePhase
              )
            )
          }
        }
      }
      // Power.Active.Import measurand
      powerSampledValueTemplate = getSampledValueTemplate(
        chargingStation,
        connectorId,
        MeterValueMeasurand.POWER_ACTIVE_IMPORT
      )
      if (chargingStation.getNumberOfPhases() === 3) {
        powerPerPhaseSampledValueTemplates = {
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
          )
        }
      }
      if (powerSampledValueTemplate != null) {
        checkMeasurandPowerDivider(chargingStation, powerSampledValueTemplate.measurand)
        const errMsg = `MeterValues measurand ${
          powerSampledValueTemplate.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
        }: Unknown ${chargingStation.stationInfo.currentOutType} currentOutType in template file ${
          chargingStation.templateFile
        }, cannot calculate ${
          powerSampledValueTemplate.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
        } measurand value`
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        const powerMeasurandValues: MeasurandValues = {} as MeasurandValues
        const unitDivider = powerSampledValueTemplate.unit === MeterValueUnit.KILO_WATT ? 1000 : 1
        const connectorMaximumAvailablePower =
          chargingStation.getConnectorMaximumAvailablePower(connectorId)
        const connectorMaximumPower = Math.round(connectorMaximumAvailablePower)
        const connectorMaximumPowerPerPhase = Math.round(
          connectorMaximumAvailablePower / chargingStation.getNumberOfPhases()
        )
        const connectorMinimumPower = Math.round(powerSampledValueTemplate.minimumValue ?? 0)
        const connectorMinimumPowerPerPhase = Math.round(
          connectorMinimumPower / chargingStation.getNumberOfPhases()
        )
        switch (chargingStation.stationInfo.currentOutType) {
          case CurrentType.AC:
            if (chargingStation.getNumberOfPhases() === 3) {
              const defaultFluctuatedPowerPerPhase = isNotEmptyString(
                powerSampledValueTemplate.value
              )
                ? getRandomFloatFluctuatedRounded(
                  getLimitFromSampledValueTemplateCustomValue(
                    powerSampledValueTemplate.value,
                    connectorMaximumPower / unitDivider,
                    connectorMinimumPower / unitDivider,
                    {
                      limitationEnabled:
                          chargingStation.stationInfo.customValueLimitationMeterValues,
                      fallbackValue: connectorMinimumPower / unitDivider
                    }
                  ) / chargingStation.getNumberOfPhases(),
                  powerSampledValueTemplate.fluctuationPercent ??
                      Constants.DEFAULT_FLUCTUATION_PERCENT
                )
                : undefined
              const phase1FluctuatedValue = isNotEmptyString(
                powerPerPhaseSampledValueTemplates.L1?.value
              )
                ? getRandomFloatFluctuatedRounded(
                  getLimitFromSampledValueTemplateCustomValue(
                    powerPerPhaseSampledValueTemplates.L1.value,
                    connectorMaximumPowerPerPhase / unitDivider,
                    connectorMinimumPowerPerPhase / unitDivider,
                    {
                      limitationEnabled:
                          chargingStation.stationInfo.customValueLimitationMeterValues,
                      fallbackValue: connectorMinimumPowerPerPhase / unitDivider
                    }
                  ),
                  powerPerPhaseSampledValueTemplates.L1.fluctuationPercent ??
                      Constants.DEFAULT_FLUCTUATION_PERCENT
                )
                : undefined
              const phase2FluctuatedValue = isNotEmptyString(
                powerPerPhaseSampledValueTemplates.L2?.value
              )
                ? getRandomFloatFluctuatedRounded(
                  getLimitFromSampledValueTemplateCustomValue(
                    powerPerPhaseSampledValueTemplates.L2.value,
                    connectorMaximumPowerPerPhase / unitDivider,
                    connectorMinimumPowerPerPhase / unitDivider,
                    {
                      limitationEnabled:
                          chargingStation.stationInfo.customValueLimitationMeterValues,
                      fallbackValue: connectorMinimumPowerPerPhase / unitDivider
                    }
                  ),
                  powerPerPhaseSampledValueTemplates.L2.fluctuationPercent ??
                      Constants.DEFAULT_FLUCTUATION_PERCENT
                )
                : undefined
              const phase3FluctuatedValue = isNotEmptyString(
                powerPerPhaseSampledValueTemplates.L3?.value
              )
                ? getRandomFloatFluctuatedRounded(
                  getLimitFromSampledValueTemplateCustomValue(
                    powerPerPhaseSampledValueTemplates.L3.value,
                    connectorMaximumPowerPerPhase / unitDivider,
                    connectorMinimumPowerPerPhase / unitDivider,
                    {
                      limitationEnabled:
                          chargingStation.stationInfo.customValueLimitationMeterValues,
                      fallbackValue: connectorMinimumPowerPerPhase / unitDivider
                    }
                  ),
                  powerPerPhaseSampledValueTemplates.L3.fluctuationPercent ??
                      Constants.DEFAULT_FLUCTUATION_PERCENT
                )
                : undefined
              powerMeasurandValues.L1 =
                phase1FluctuatedValue ??
                defaultFluctuatedPowerPerPhase ??
                getRandomFloatRounded(
                  connectorMaximumPowerPerPhase / unitDivider,
                  connectorMinimumPowerPerPhase / unitDivider
                )
              powerMeasurandValues.L2 =
                phase2FluctuatedValue ??
                defaultFluctuatedPowerPerPhase ??
                getRandomFloatRounded(
                  connectorMaximumPowerPerPhase / unitDivider,
                  connectorMinimumPowerPerPhase / unitDivider
                )
              powerMeasurandValues.L3 =
                phase3FluctuatedValue ??
                defaultFluctuatedPowerPerPhase ??
                getRandomFloatRounded(
                  connectorMaximumPowerPerPhase / unitDivider,
                  connectorMinimumPowerPerPhase / unitDivider
                )
            } else {
              powerMeasurandValues.L1 = isNotEmptyString(powerSampledValueTemplate.value)
                ? getRandomFloatFluctuatedRounded(
                  getLimitFromSampledValueTemplateCustomValue(
                    powerSampledValueTemplate.value,
                    connectorMaximumPower / unitDivider,
                    connectorMinimumPower / unitDivider,
                    {
                      limitationEnabled:
                          chargingStation.stationInfo.customValueLimitationMeterValues,
                      fallbackValue: connectorMinimumPower / unitDivider
                    }
                  ),
                  powerSampledValueTemplate.fluctuationPercent ??
                      Constants.DEFAULT_FLUCTUATION_PERCENT
                )
                : getRandomFloatRounded(
                  connectorMaximumPower / unitDivider,
                  connectorMinimumPower / unitDivider
                )
              powerMeasurandValues.L2 = 0
              powerMeasurandValues.L3 = 0
            }
            powerMeasurandValues.allPhases = roundTo(
              powerMeasurandValues.L1 + powerMeasurandValues.L2 + powerMeasurandValues.L3,
              2
            )
            break
          case CurrentType.DC:
            powerMeasurandValues.allPhases = isNotEmptyString(powerSampledValueTemplate.value)
              ? getRandomFloatFluctuatedRounded(
                getLimitFromSampledValueTemplateCustomValue(
                  powerSampledValueTemplate.value,
                  connectorMaximumPower / unitDivider,
                  connectorMinimumPower / unitDivider,
                  {
                    limitationEnabled:
                        chargingStation.stationInfo.customValueLimitationMeterValues,
                    fallbackValue: connectorMinimumPower / unitDivider
                  }
                ),
                powerSampledValueTemplate.fluctuationPercent ??
                    Constants.DEFAULT_FLUCTUATION_PERCENT
              )
              : getRandomFloatRounded(
                connectorMaximumPower / unitDivider,
                connectorMinimumPower / unitDivider
              )
            break
          default:
            logger.error(`${chargingStation.logPrefix()} ${errMsg}`)
            throw new OCPPError(ErrorType.INTERNAL_ERROR, errMsg, RequestCommand.METER_VALUES)
        }
        meterValue.sampledValue.push(
          buildSampledValue(powerSampledValueTemplate, powerMeasurandValues.allPhases)
        )
        const sampledValuesIndex = meterValue.sampledValue.length - 1
        const connectorMaximumPowerRounded = roundTo(connectorMaximumPower / unitDivider, 2)
        const connectorMinimumPowerRounded = roundTo(connectorMinimumPower / unitDivider, 2)
        if (
          convertToFloat(meterValue.sampledValue[sampledValuesIndex].value) >
            connectorMaximumPowerRounded ||
          convertToFloat(meterValue.sampledValue[sampledValuesIndex].value) <
            connectorMinimumPowerRounded ||
          debug
        ) {
          logger.error(
            `${chargingStation.logPrefix()} MeterValues measurand ${
              meterValue.sampledValue[sampledValuesIndex].measurand ??
              MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
            }: connector id ${connectorId}, transaction id ${
              connector?.transactionId
            }, value: ${connectorMinimumPowerRounded}/${
              meterValue.sampledValue[sampledValuesIndex].value
            }/${connectorMaximumPowerRounded}`
          )
        }
        for (
          let phase = 1;
          chargingStation.getNumberOfPhases() === 3 && phase <= chargingStation.getNumberOfPhases();
          phase++
        ) {
          const phaseValue = `L${phase}-N`
          meterValue.sampledValue.push(
            buildSampledValue(
              powerPerPhaseSampledValueTemplates[
                `L${phase}` as keyof MeasurandPerPhaseSampledValueTemplates
              ] ?? powerSampledValueTemplate,
              powerMeasurandValues[`L${phase}` as keyof MeasurandPerPhaseSampledValueTemplates],
              undefined,
              phaseValue as MeterValuePhase
            )
          )
          const sampledValuesPerPhaseIndex = meterValue.sampledValue.length - 1
          const connectorMaximumPowerPerPhaseRounded = roundTo(
            connectorMaximumPowerPerPhase / unitDivider,
            2
          )
          const connectorMinimumPowerPerPhaseRounded = roundTo(
            connectorMinimumPowerPerPhase / unitDivider,
            2
          )
          if (
            convertToFloat(meterValue.sampledValue[sampledValuesPerPhaseIndex].value) >
              connectorMaximumPowerPerPhaseRounded ||
            convertToFloat(meterValue.sampledValue[sampledValuesPerPhaseIndex].value) <
              connectorMinimumPowerPerPhaseRounded ||
            debug
          ) {
            logger.error(
              `${chargingStation.logPrefix()} MeterValues measurand ${
                meterValue.sampledValue[sampledValuesPerPhaseIndex].measurand ??
                MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
              }: phase ${
                meterValue.sampledValue[sampledValuesPerPhaseIndex].phase
              }, connector id ${connectorId}, transaction id ${
                connector?.transactionId
              }, value: ${connectorMinimumPowerPerPhaseRounded}/${
                meterValue.sampledValue[sampledValuesPerPhaseIndex].value
              }/${connectorMaximumPowerPerPhaseRounded}`
            )
          }
        }
      }
      // Current.Import measurand
      currentSampledValueTemplate = getSampledValueTemplate(
        chargingStation,
        connectorId,
        MeterValueMeasurand.CURRENT_IMPORT
      )
      if (chargingStation.getNumberOfPhases() === 3) {
        currentPerPhaseSampledValueTemplates = {
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
          )
        }
      }
      if (currentSampledValueTemplate != null) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        checkMeasurandPowerDivider(chargingStation, currentSampledValueTemplate.measurand)
        const errMsg = `MeterValues measurand ${
          currentSampledValueTemplate.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
        }: Unknown ${chargingStation.stationInfo.currentOutType} currentOutType in template file ${
          chargingStation.templateFile
        }, cannot calculate ${
          currentSampledValueTemplate.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
        } measurand value`
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        const currentMeasurandValues: MeasurandValues = {} as MeasurandValues
        const connectorMaximumAvailablePower =
          chargingStation.getConnectorMaximumAvailablePower(connectorId)
        const connectorMinimumAmperage = currentSampledValueTemplate.minimumValue ?? 0
        let connectorMaximumAmperage: number
        switch (chargingStation.stationInfo.currentOutType) {
          case CurrentType.AC:
            connectorMaximumAmperage = ACElectricUtils.amperagePerPhaseFromPower(
              chargingStation.getNumberOfPhases(),
              connectorMaximumAvailablePower,
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              chargingStation.stationInfo.voltageOut!
            )
            if (chargingStation.getNumberOfPhases() === 3) {
              const defaultFluctuatedAmperagePerPhase = isNotEmptyString(
                currentSampledValueTemplate.value
              )
                ? getRandomFloatFluctuatedRounded(
                  getLimitFromSampledValueTemplateCustomValue(
                    currentSampledValueTemplate.value,
                    connectorMaximumAmperage,
                    connectorMinimumAmperage,
                    {
                      limitationEnabled:
                          chargingStation.stationInfo.customValueLimitationMeterValues,
                      fallbackValue: connectorMinimumAmperage
                    }
                  ),
                  currentSampledValueTemplate.fluctuationPercent ??
                      Constants.DEFAULT_FLUCTUATION_PERCENT
                )
                : undefined
              const phase1FluctuatedValue = isNotEmptyString(
                currentPerPhaseSampledValueTemplates.L1?.value
              )
                ? getRandomFloatFluctuatedRounded(
                  getLimitFromSampledValueTemplateCustomValue(
                    currentPerPhaseSampledValueTemplates.L1.value,
                    connectorMaximumAmperage,
                    connectorMinimumAmperage,
                    {
                      limitationEnabled:
                          chargingStation.stationInfo.customValueLimitationMeterValues,
                      fallbackValue: connectorMinimumAmperage
                    }
                  ),
                  currentPerPhaseSampledValueTemplates.L1.fluctuationPercent ??
                      Constants.DEFAULT_FLUCTUATION_PERCENT
                )
                : undefined
              const phase2FluctuatedValue = isNotEmptyString(
                currentPerPhaseSampledValueTemplates.L2?.value
              )
                ? getRandomFloatFluctuatedRounded(
                  getLimitFromSampledValueTemplateCustomValue(
                    currentPerPhaseSampledValueTemplates.L2.value,
                    connectorMaximumAmperage,
                    connectorMinimumAmperage,
                    {
                      limitationEnabled:
                          chargingStation.stationInfo.customValueLimitationMeterValues,
                      fallbackValue: connectorMinimumAmperage
                    }
                  ),
                  currentPerPhaseSampledValueTemplates.L2.fluctuationPercent ??
                      Constants.DEFAULT_FLUCTUATION_PERCENT
                )
                : undefined
              const phase3FluctuatedValue = isNotEmptyString(
                currentPerPhaseSampledValueTemplates.L3?.value
              )
                ? getRandomFloatFluctuatedRounded(
                  getLimitFromSampledValueTemplateCustomValue(
                    currentPerPhaseSampledValueTemplates.L3.value,
                    connectorMaximumAmperage,
                    connectorMinimumAmperage,
                    {
                      limitationEnabled:
                          chargingStation.stationInfo.customValueLimitationMeterValues,
                      fallbackValue: connectorMinimumAmperage
                    }
                  ),
                  currentPerPhaseSampledValueTemplates.L3.fluctuationPercent ??
                      Constants.DEFAULT_FLUCTUATION_PERCENT
                )
                : undefined
              currentMeasurandValues.L1 =
                phase1FluctuatedValue ??
                defaultFluctuatedAmperagePerPhase ??
                getRandomFloatRounded(connectorMaximumAmperage, connectorMinimumAmperage)
              currentMeasurandValues.L2 =
                phase2FluctuatedValue ??
                defaultFluctuatedAmperagePerPhase ??
                getRandomFloatRounded(connectorMaximumAmperage, connectorMinimumAmperage)
              currentMeasurandValues.L3 =
                phase3FluctuatedValue ??
                defaultFluctuatedAmperagePerPhase ??
                getRandomFloatRounded(connectorMaximumAmperage, connectorMinimumAmperage)
            } else {
              currentMeasurandValues.L1 = isNotEmptyString(currentSampledValueTemplate.value)
                ? getRandomFloatFluctuatedRounded(
                  getLimitFromSampledValueTemplateCustomValue(
                    currentSampledValueTemplate.value,
                    connectorMaximumAmperage,
                    connectorMinimumAmperage,
                    {
                      limitationEnabled:
                          chargingStation.stationInfo.customValueLimitationMeterValues,
                      fallbackValue: connectorMinimumAmperage
                    }
                  ),
                  currentSampledValueTemplate.fluctuationPercent ??
                      Constants.DEFAULT_FLUCTUATION_PERCENT
                )
                : getRandomFloatRounded(connectorMaximumAmperage, connectorMinimumAmperage)
              currentMeasurandValues.L2 = 0
              currentMeasurandValues.L3 = 0
            }
            currentMeasurandValues.allPhases = roundTo(
              (currentMeasurandValues.L1 + currentMeasurandValues.L2 + currentMeasurandValues.L3) /
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
            currentMeasurandValues.allPhases = isNotEmptyString(currentSampledValueTemplate.value)
              ? getRandomFloatFluctuatedRounded(
                getLimitFromSampledValueTemplateCustomValue(
                  currentSampledValueTemplate.value,
                  connectorMaximumAmperage,
                  connectorMinimumAmperage,
                  {
                    limitationEnabled:
                        chargingStation.stationInfo.customValueLimitationMeterValues,
                    fallbackValue: connectorMinimumAmperage
                  }
                ),
                currentSampledValueTemplate.fluctuationPercent ??
                    Constants.DEFAULT_FLUCTUATION_PERCENT
              )
              : getRandomFloatRounded(connectorMaximumAmperage, connectorMinimumAmperage)
            break
          default:
            logger.error(`${chargingStation.logPrefix()} ${errMsg}`)
            throw new OCPPError(ErrorType.INTERNAL_ERROR, errMsg, RequestCommand.METER_VALUES)
        }
        meterValue.sampledValue.push(
          buildSampledValue(currentSampledValueTemplate, currentMeasurandValues.allPhases)
        )
        const sampledValuesIndex = meterValue.sampledValue.length - 1
        if (
          convertToFloat(meterValue.sampledValue[sampledValuesIndex].value) >
            connectorMaximumAmperage ||
          convertToFloat(meterValue.sampledValue[sampledValuesIndex].value) <
            connectorMinimumAmperage ||
          debug
        ) {
          logger.error(
            `${chargingStation.logPrefix()} MeterValues measurand ${
              meterValue.sampledValue[sampledValuesIndex].measurand ??
              MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
            }: connector id ${connectorId}, transaction id ${
              connector?.transactionId
            }, value: ${connectorMinimumAmperage}/${
              meterValue.sampledValue[sampledValuesIndex].value
            }/${connectorMaximumAmperage}`
          )
        }
        for (
          let phase = 1;
          chargingStation.getNumberOfPhases() === 3 && phase <= chargingStation.getNumberOfPhases();
          phase++
        ) {
          const phaseValue = `L${phase}`
          meterValue.sampledValue.push(
            buildSampledValue(
              currentPerPhaseSampledValueTemplates[
                phaseValue as keyof MeasurandPerPhaseSampledValueTemplates
              ] ?? currentSampledValueTemplate,
              currentMeasurandValues[phaseValue as keyof MeasurandPerPhaseSampledValueTemplates],
              undefined,
              phaseValue as MeterValuePhase
            )
          )
          const sampledValuesPerPhaseIndex = meterValue.sampledValue.length - 1
          if (
            convertToFloat(meterValue.sampledValue[sampledValuesPerPhaseIndex].value) >
              connectorMaximumAmperage ||
            convertToFloat(meterValue.sampledValue[sampledValuesPerPhaseIndex].value) <
              connectorMinimumAmperage ||
            debug
          ) {
            logger.error(
              `${chargingStation.logPrefix()} MeterValues measurand ${
                meterValue.sampledValue[sampledValuesPerPhaseIndex].measurand ??
                MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
              }: phase ${
                meterValue.sampledValue[sampledValuesPerPhaseIndex].phase
              }, connector id ${connectorId}, transaction id ${
                connector?.transactionId
              }, value: ${connectorMinimumAmperage}/${
                meterValue.sampledValue[sampledValuesPerPhaseIndex].value
              }/${connectorMaximumAmperage}`
            )
          }
        }
      }
      // Energy.Active.Import.Register measurand (default)
      energySampledValueTemplate = getSampledValueTemplate(chargingStation, connectorId)
      if (energySampledValueTemplate != null) {
        checkMeasurandPowerDivider(chargingStation, energySampledValueTemplate.measurand)
        const unitDivider =
          energySampledValueTemplate.unit === MeterValueUnit.KILO_WATT_HOUR ? 1000 : 1
        const connectorMaximumAvailablePower =
          chargingStation.getConnectorMaximumAvailablePower(connectorId)
        const connectorMaximumEnergyRounded = roundTo(
          (connectorMaximumAvailablePower * interval) / (3600 * 1000),
          2
        )
        const connectorMinimumEnergyRounded = roundTo(
          energySampledValueTemplate.minimumValue ?? 0,
          2
        )
        const energyValueRounded = isNotEmptyString(energySampledValueTemplate.value)
          ? getRandomFloatFluctuatedRounded(
            getLimitFromSampledValueTemplateCustomValue(
              energySampledValueTemplate.value,
              connectorMaximumEnergyRounded,
              connectorMinimumEnergyRounded,
              {
                limitationEnabled: chargingStation.stationInfo.customValueLimitationMeterValues,
                fallbackValue: connectorMinimumEnergyRounded,
                unitMultiplier: unitDivider
              }
            ),
            energySampledValueTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT
          )
          : getRandomFloatRounded(connectorMaximumEnergyRounded, connectorMinimumEnergyRounded)
        // Persist previous value on connector
        if (connector != null) {
          if (
            connector.energyActiveImportRegisterValue != null &&
            connector.energyActiveImportRegisterValue >= 0 &&
            connector.transactionEnergyActiveImportRegisterValue != null &&
            connector.transactionEnergyActiveImportRegisterValue >= 0
          ) {
            connector.energyActiveImportRegisterValue += energyValueRounded
            connector.transactionEnergyActiveImportRegisterValue += energyValueRounded
          } else {
            connector.energyActiveImportRegisterValue = 0
            connector.transactionEnergyActiveImportRegisterValue = 0
          }
        }
        meterValue.sampledValue.push(
          buildSampledValue(
            energySampledValueTemplate,
            roundTo(
              chargingStation.getEnergyActiveImportRegisterByTransactionId(transactionId) /
                unitDivider,
              2
            )
          )
        )
        const sampledValuesIndex = meterValue.sampledValue.length - 1
        if (
          energyValueRounded > connectorMaximumEnergyRounded ||
          energyValueRounded < connectorMinimumEnergyRounded ||
          debug
        ) {
          logger.error(
            `${chargingStation.logPrefix()} MeterValues measurand ${
              meterValue.sampledValue[sampledValuesIndex].measurand ??
              MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
            }: connector id ${connectorId}, transaction id ${
              connector?.transactionId
            }, value: ${connectorMinimumEnergyRounded}/${energyValueRounded}/${connectorMaximumEnergyRounded}, duration: ${interval}ms`
          )
        }
      }
      return meterValue
    case OCPPVersion.VERSION_20:
    case OCPPVersion.VERSION_201:
    default:
      throw new BaseError(
        `Cannot build meterValue: OCPP version ${chargingStation.stationInfo?.ocppVersion} not supported`
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
      meterValue = {
        timestamp: new Date(),
        sampledValue: []
      }
      // Energy.Active.Import.Register measurand (default)
      sampledValueTemplate = getSampledValueTemplate(chargingStation, connectorId)
      unitDivider = sampledValueTemplate?.unit === MeterValueUnit.KILO_WATT_HOUR ? 1000 : 1
      meterValue.sampledValue.push(
        buildSampledValue(
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          sampledValueTemplate!,
          roundTo((meterStop ?? 0) / unitDivider, 4),
          MeterValueContext.TRANSACTION_END
        )
      )
      return meterValue
    case OCPPVersion.VERSION_20:
    case OCPPVersion.VERSION_201:
    default:
      throw new BaseError(
        `Cannot build meterValue: OCPP version ${chargingStation.stationInfo?.ocppVersion} not supported`
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
    }: powerDivider have zero or below value ${chargingStation.powerDivider}`
    logger.error(`${chargingStation.logPrefix()} ${errMsg}`)
    throw new OCPPError(ErrorType.INTERNAL_ERROR, errMsg, RequestCommand.METER_VALUES)
  }
}

const getLimitFromSampledValueTemplateCustomValue = (
  value: string | undefined,
  maxLimit: number,
  minLimit: number,
  options?: {
    limitationEnabled?: boolean
    fallbackValue?: number
    unitMultiplier?: number
  }
): number => {
  options = {
    ...{
      limitationEnabled: false,
      unitMultiplier: 1,
      fallbackValue: 0
    },
    ...options
  }
  const parsedValue = Number.parseInt(value ?? '')
  if (options.limitationEnabled === true) {
    return max(
      min(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        (!isNaN(parsedValue) ? parsedValue : Number.POSITIVE_INFINITY) * options.unitMultiplier!,
        maxLimit
      ),
      minLimit
    )
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return (!isNaN(parsedValue) ? parsedValue : options.fallbackValue!) * options.unitMultiplier!
}

const getSampledValueTemplate = (
  chargingStation: ChargingStation,
  connectorId: number,
  measurand: MeterValueMeasurand = MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
  phase?: MeterValuePhase
): SampledValueTemplate | undefined => {
  const onPhaseStr = phase != null ? `on phase ${phase} ` : ''
  if (!OCPPConstants.OCPP_MEASURANDS_SUPPORTED.includes(measurand)) {
    logger.warn(
      `${chargingStation.logPrefix()} Trying to get unsupported MeterValues measurand '${measurand}' ${onPhaseStr}in template on connector id ${connectorId}`
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
      `${chargingStation.logPrefix()} Trying to get MeterValues measurand '${measurand}' ${onPhaseStr}in template on connector id ${connectorId} not found in '${
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
      !OCPPConstants.OCPP_MEASURANDS_SUPPORTED.includes(
        sampledValueTemplates[index]?.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      )
    ) {
      logger.warn(
        `${chargingStation.logPrefix()} Unsupported MeterValues measurand '${measurand}' ${onPhaseStr}in template on connector id ${connectorId}`
      )
    } else if (
      phase != null &&
      sampledValueTemplates[index]?.phase === phase &&
      sampledValueTemplates[index]?.measurand === measurand &&
      getConfigurationKey(
        chargingStation,
        StandardParametersKey.MeterValuesSampledData
      )?.value?.includes(measurand) === true
    ) {
      return sampledValueTemplates[index]
    } else if (
      phase == null &&
      sampledValueTemplates[index]?.phase == null &&
      sampledValueTemplates[index]?.measurand === measurand &&
      getConfigurationKey(
        chargingStation,
        StandardParametersKey.MeterValuesSampledData
      )?.value?.includes(measurand) === true
    ) {
      return sampledValueTemplates[index]
    } else if (
      measurand === MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER &&
      (sampledValueTemplates[index]?.measurand == null ||
        sampledValueTemplates[index]?.measurand === measurand)
    ) {
      return sampledValueTemplates[index]
    }
  }
  if (measurand === MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER) {
    const errorMsg = `Missing MeterValues for default measurand '${measurand}' in template on connector id ${connectorId}`
    logger.error(`${chargingStation.logPrefix()} ${errorMsg}`)
    throw new BaseError(errorMsg)
  }
  logger.debug(
    `${chargingStation.logPrefix()} No MeterValues for measurand '${measurand}' ${onPhaseStr}in template on connector id ${connectorId}`
  )
}

const buildSampledValue = (
  sampledValueTemplate: SampledValueTemplate,
  value: number,
  context?: MeterValueContext,
  phase?: MeterValuePhase
): SampledValue => {
  const sampledValueContext = context ?? sampledValueTemplate.context
  const sampledValueLocation =
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    sampledValueTemplate.location ?? getMeasurandDefaultLocation(sampledValueTemplate.measurand!)
  const sampledValuePhase = phase ?? sampledValueTemplate.phase
  return {
    ...(sampledValueTemplate.unit != null && {
      unit: sampledValueTemplate.unit
    }),
    ...(sampledValueContext != null && { context: sampledValueContext }),
    ...(sampledValueTemplate.measurand != null && {
      measurand: sampledValueTemplate.measurand
    }),
    ...(sampledValueLocation != null && { location: sampledValueLocation }),
    ...{ value: value.toString() },
    ...(sampledValuePhase != null && { phase: sampledValuePhase })
  } satisfies SampledValue
}

const getMeasurandDefaultLocation = (
  measurandType: MeterValueMeasurand
): MeterValueLocation | undefined => {
  switch (measurandType) {
    case MeterValueMeasurand.STATE_OF_CHARGE:
      return MeterValueLocation.EV
  }
}

// const getMeasurandDefaultUnit = (
//   measurandType: MeterValueMeasurand
// ): MeterValueUnit | undefined => {
//   switch (measurandType) {
//     case MeterValueMeasurand.CURRENT_EXPORT:
//     case MeterValueMeasurand.CURRENT_IMPORT:
//     case MeterValueMeasurand.CURRENT_OFFERED:
//       return MeterValueUnit.AMP
//     case MeterValueMeasurand.ENERGY_ACTIVE_EXPORT_REGISTER:
//     case MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER:
//       return MeterValueUnit.WATT_HOUR
//     case MeterValueMeasurand.POWER_ACTIVE_EXPORT:
//     case MeterValueMeasurand.POWER_ACTIVE_IMPORT:
//     case MeterValueMeasurand.POWER_OFFERED:
//       return MeterValueUnit.WATT
//     case MeterValueMeasurand.STATE_OF_CHARGE:
//       return MeterValueUnit.PERCENT
//     case MeterValueMeasurand.VOLTAGE:
//       return MeterValueUnit.VOLT
//   }
// }

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class OCPPServiceUtils {
  public static readonly getMessageTypeString = getMessageTypeString
  public static readonly sendAndSetConnectorStatus = sendAndSetConnectorStatus
  public static readonly restoreConnectorStatus = restoreConnectorStatus
  public static readonly isIdTagAuthorized = isIdTagAuthorized
  public static readonly buildTransactionEndMeterValue = buildTransactionEndMeterValue
  protected static getSampledValueTemplate = getSampledValueTemplate
  protected static buildSampledValue = buildSampledValue

  protected constructor () {
    // This is intentional
  }

  public static ajvErrorsToErrorType (errors: ErrorObject[] | undefined | null): ErrorType {
    if (isNotEmptyArray(errors)) {
      for (const error of errors as DefinedError[]) {
        switch (error.keyword) {
          case 'type':
            return ErrorType.TYPE_CONSTRAINT_VIOLATION
          case 'dependencies':
          case 'required':
            return ErrorType.OCCURRENCE_CONSTRAINT_VIOLATION
          case 'pattern':
          case 'format':
            return ErrorType.PROPERTY_CONSTRAINT_VIOLATION
        }
      }
    }
    return ErrorType.FORMAT_VIOLATION
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

  public static isConnectorIdValid (
    chargingStation: ChargingStation,
    ocppCommand: IncomingRequestCommand,
    connectorId: number
  ): boolean {
    if (connectorId < 0) {
      logger.error(
        `${chargingStation.logPrefix()} ${ocppCommand} incoming request received with invalid connector id ${connectorId}`
      )
      return false
    }
    return true
  }

  public static convertDateToISOString<T extends JsonType>(object: T): void {
    for (const key in object) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-non-null-assertion
      if (isDate(object![key])) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-non-null-assertion
        (object![key] as string) = (object![key] as Date).toISOString()
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-condition
      } else if (typeof object![key] === 'object' && object![key] !== null) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-non-null-assertion
        OCPPServiceUtils.convertDateToISOString<T>(object![key] as T)
      }
    }
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
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
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
