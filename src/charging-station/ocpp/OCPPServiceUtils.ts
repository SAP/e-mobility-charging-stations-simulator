import _Ajv, { type ErrorObject, type JSONSchemaType, type ValidateFunction } from 'ajv'
import _ajvFormats from 'ajv-formats'
import { isDate } from 'date-fns'
import { randomInt } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { BootReasonEnumType } from '../../types/index.js'

import { type ChargingStation, getConfigurationKey } from '../../charging-station/index.js'
import { BaseError, OCPPError } from '../../exception/index.js'
import {
  type BootNotificationRequest,
  type ChargingStationInfo,
  type ConfigurationKeyType,
  type ConnectorStatus,
  CurrentType,
  ErrorType,
  FileType,
  IncomingRequestCommand,
  type JsonType,
  type MeasurandPerPhaseSampledValueTemplates,
  type MeasurandValues,
  MessageTrigger,
  type MeterValue,
  MeterValueContext,
  MeterValueLocation,
  MeterValueMeasurand,
  MeterValuePhase,
  MeterValueUnit,
  OCPPVersion,
  RequestCommand,
  type SampledValue,
  type SampledValueTemplate,
  StandardParametersKey,
} from '../../types/index.js'
import {
  ACElectricUtils,
  clone,
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
import {
  buildOCPP16BootNotificationRequest,
  buildOCPP16SampledValue,
} from './1.6/OCPP16RequestBuilders.js'
import {
  buildOCPP20BootNotificationRequest,
  buildOCPP20SampledValue,
} from './2.0/OCPP20RequestBuilders.js'
import { OCPPConstants } from './OCPPConstants.js'

const moduleName = 'OCPPServiceUtils'

const SOC_MAXIMUM_VALUE = 100
const UNIT_DIVIDER_KILO = 1000
const MS_PER_HOUR = 3_600_000

export type Ajv = _Ajv.default
// eslint-disable-next-line @typescript-eslint/no-redeclare
const Ajv = _Ajv.default
const ajvFormats = _ajvFormats.default

export const createAjv = (): Ajv => {
  const ajv = new Ajv({
    keywords: ['javaType'],
    multipleOfPrecision: 2,
  })
  ajvFormats(ajv)
  return ajv
}

interface MultiPhaseMeasurandData {
  perPhaseTemplates: MeasurandPerPhaseSampledValueTemplates
  template: SampledValueTemplate
  values: MeasurandValues
}

interface SingleValueMeasurandData {
  template: SampledValueTemplate
  value: number
}

export const buildBootNotificationRequest = (
  stationInfo: ChargingStationInfo,
  bootReason?: BootReasonEnumType
): BootNotificationRequest | undefined => {
  switch (stationInfo.ocppVersion) {
    case OCPPVersion.VERSION_16:
      return buildOCPP16BootNotificationRequest(stationInfo)
    case OCPPVersion.VERSION_20:
    case OCPPVersion.VERSION_201:
      return buildOCPP20BootNotificationRequest(stationInfo, bootReason)
    default:
      return undefined
  }
}

/**
 * Converts Ajv validation errors to the corresponding OCPP error type.
 * @param errors - Array of Ajv validation error objects
 * @returns OCPP ErrorType corresponding to the validation failure
 */
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

/**
 * Validates an OCPP payload against a JSON schema validation function.
 * Shared implementation used by request, response, and incoming request validation.
 * @param chargingStation - The charging station instance
 * @param commandName - OCPP command name to validate against
 * @param payload - JSON payload to validate
 * @param validate - Ajv validation function for the command
 * @param context - Description of the validation context (e.g. 'request', 'response')
 * @param clonePayload - Whether to clone payload and convert dates before validation
 * @returns True if payload validation succeeds, false otherwise
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export const validatePayload = <T extends JsonType>(
  chargingStation: ChargingStation,
  commandName: IncomingRequestCommand | RequestCommand,
  payload: T,
  validate: undefined | ValidateFunction<JsonType>,
  context: string,
  clonePayload = false
): boolean => {
  if (chargingStation.stationInfo?.ocppStrictCompliance === false) {
    return true
  }
  if (validate == null) {
    logger.warn(
      `${chargingStation.logPrefix()} ${moduleName}.validatePayload: No JSON schema validation function found for command '${commandName}' ${context} PDU validation`
    )
    return false
  }
  let payloadToValidate = payload
  if (clonePayload) {
    payloadToValidate = clone(payload)
    convertDateToISOString(payloadToValidate)
  }
  if (validate(payloadToValidate)) {
    return true
  }
  logger.error(
    `${chargingStation.logPrefix()} ${moduleName}.validatePayload: Command '${commandName}' ${context} PDU is invalid: %j`,
    validate.errors
  )
  throw new OCPPError(
    ajvErrorsToErrorType(validate.errors),
    `${context.charAt(0).toUpperCase()}${context.slice(1)} PDU is invalid`,
    commandName,
    JSON.stringify(validate.errors, undefined, 2)
  )
}

/**
 * Recursively converts Date values to ISO 8601 strings within a JSON-compatible object.
 * @param object - Object whose Date properties will be converted in-place
 */
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
      convertDateToISOString(value as T)
    }
  }
}

const buildSocMeasurandValue = (
  chargingStation: ChargingStation,
  connectorId: number,
  evseId?: number,
  measurandsKey?: ConfigurationKeyType
): null | SingleValueMeasurandData => {
  const socSampledValueTemplate = getSampledValueTemplate(
    chargingStation,
    connectorId,
    measurandsKey,
    MeterValueMeasurand.STATE_OF_CHARGE,
    evseId
  )
  if (socSampledValueTemplate == null) {
    return null
  }

  const socMaximumValue = SOC_MAXIMUM_VALUE
  const socMinimumValue = socSampledValueTemplate.minimumValue ?? 0
  const socSampledValueTemplateValue = isNotEmptyString(socSampledValueTemplate.value)
    ? getRandomFloatFluctuatedRounded(
      convertToInt(socSampledValueTemplate.value),
      socSampledValueTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT
    )
    : randomInt(socMinimumValue, socMaximumValue + 1)

  return {
    template: socSampledValueTemplate,
    value: socSampledValueTemplateValue,
  }
}

const validateMeasurandValue = (
  chargingStation: ChargingStation,
  connectorId: number,
  value: number,
  minValue: number,
  maxValue: number,
  measurand: MeterValueMeasurand | undefined,
  debug: boolean,
  options?: {
    connectorStatus?: ConnectorStatus
    interval?: number
    phase?: MeterValuePhase
  }
): void => {
  if (value > maxValue || value < minValue || debug) {
    const connStatus = options?.connectorStatus ?? chargingStation.getConnectorStatus(connectorId)
    const phaseStr = options?.phase != null ? `, phase ${options.phase as string}` : ''
    const intervalStr =
      options?.interval != null ? `, duration: ${options.interval.toString()}ms` : ''
    logger.error(
      `${chargingStation.logPrefix()} ${moduleName}.validateMeasurandValue: MeterValues measurand ${
        measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      }: connector id ${connectorId.toString()}${phaseStr}, transaction id ${connStatus?.transactionId?.toString()}, value: ${minValue.toString()}/${value.toString()}/${maxValue.toString()}${intervalStr}`
    )
  }
}

const buildVoltageMeasurandValue = (
  chargingStation: ChargingStation,
  connectorId: number,
  evseId?: number,
  measurandsKey?: ConfigurationKeyType
): null | SingleValueMeasurandData => {
  const voltageSampledValueTemplate = getSampledValueTemplate(
    chargingStation,
    connectorId,
    measurandsKey,
    MeterValueMeasurand.VOLTAGE,
    evseId
  )
  if (voltageSampledValueTemplate == null) {
    return null
  }

  const voltageSampledValueTemplateValue = isNotEmptyString(voltageSampledValueTemplate.value)
    ? convertToInt(voltageSampledValueTemplate.value)
    : chargingStation.getVoltageOut()
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

const addMainVoltageToMeterValue = <TSampledValue extends SampledValue>(
  chargingStation: ChargingStation,
  meterValue: { sampledValue: TSampledValue[] },
  voltageData: { template: SampledValueTemplate; value: number },
  buildVersionedSampledValue: (
    sampledValueTemplate: SampledValueTemplate,
    value: number,
    context?: MeterValueContext,
    phase?: MeterValuePhase
  ) => TSampledValue,
  context?: MeterValueContext
): void => {
  const stationInfo = chargingStation.stationInfo
  if (stationInfo == null) {
    return
  }
  if (
    chargingStation.getNumberOfPhases() !== 3 ||
    (chargingStation.getNumberOfPhases() === 3 && stationInfo.mainVoltageMeterValues === true)
  ) {
    meterValue.sampledValue.push(
      buildVersionedSampledValue(voltageData.template, voltageData.value, context)
    )
  }
}

const addPhaseVoltageToMeterValue = <TSampledValue extends SampledValue>(
  chargingStation: ChargingStation,
  connectorId: number,
  meterValue: { sampledValue: TSampledValue[] },
  mainVoltageData: { template: SampledValueTemplate; value: number },
  phaseLabel: MeterValuePhase,
  nominalVoltage: number,
  buildVersionedSampledValue: (
    sampledValueTemplate: SampledValueTemplate,
    value: number,
    context?: MeterValueContext,
    phase?: MeterValuePhase
  ) => TSampledValue,
  measurandsKey?: ConfigurationKeyType,
  context?: MeterValueContext,
  noTemplateFallback?: number
): void => {
  const phaseSampledValueTemplate = getSampledValueTemplate(
    chargingStation,
    connectorId,
    measurandsKey,
    MeterValueMeasurand.VOLTAGE,
    undefined,
    phaseLabel
  )
  let phaseMeasurandValue: number | undefined
  if (phaseSampledValueTemplate != null) {
    const templateValue = isNotEmptyString(phaseSampledValueTemplate.value)
      ? convertToInt(phaseSampledValueTemplate.value)
      : nominalVoltage
    phaseMeasurandValue = getRandomFloatFluctuatedRounded(
      templateValue,
      phaseSampledValueTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT
    )
  }
  meterValue.sampledValue.push(
    buildVersionedSampledValue(
      phaseSampledValueTemplate ?? mainVoltageData.template,
      phaseMeasurandValue ?? noTemplateFallback ?? nominalVoltage,
      context,
      phaseLabel
    )
  )
}

const buildEnergyMeasurandValue = (
  chargingStation: ChargingStation,
  connectorId: number,
  interval: number,
  evseId?: number,
  measurandsKey?: ConfigurationKeyType
): null | SingleValueMeasurandData => {
  const energyTemplate = getSampledValueTemplate(
    chargingStation,
    connectorId,
    measurandsKey,
    undefined,
    evseId
  )
  if (energyTemplate == null) {
    return null
  }

  checkMeasurandPowerDivider(chargingStation, energyTemplate.measurand)
  const unitDivider = energyTemplate.unit === MeterValueUnit.KILO_WATT_HOUR ? UNIT_DIVIDER_KILO : 1
  const connectorMaximumAvailablePower =
    chargingStation.getConnectorMaximumAvailablePower(connectorId)
  const connectorMaximumEnergyRounded = roundTo(
    (connectorMaximumAvailablePower * interval) / MS_PER_HOUR,
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
  connectorStatus: ConnectorStatus | undefined,
  energyValue: number
): void => {
  if (connectorStatus != null) {
    if (
      connectorStatus.energyActiveImportRegisterValue != null &&
      connectorStatus.energyActiveImportRegisterValue >= 0 &&
      connectorStatus.transactionEnergyActiveImportRegisterValue != null &&
      connectorStatus.transactionEnergyActiveImportRegisterValue >= 0
    ) {
      connectorStatus.energyActiveImportRegisterValue += energyValue
      connectorStatus.transactionEnergyActiveImportRegisterValue += energyValue
    } else {
      connectorStatus.energyActiveImportRegisterValue = 0
      connectorStatus.transactionEnergyActiveImportRegisterValue = 0
    }
  }
}

const buildPowerMeasurandValue = (
  chargingStation: ChargingStation,
  connectorId: number,
  evseId?: number,
  measurandsKey?: ConfigurationKeyType
): MultiPhaseMeasurandData | null => {
  const powerTemplate = getSampledValueTemplate(
    chargingStation,
    connectorId,
    measurandsKey,
    MeterValueMeasurand.POWER_ACTIVE_IMPORT,
    evseId
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
        measurandsKey,
        MeterValueMeasurand.POWER_ACTIVE_IMPORT,
        evseId,
        MeterValuePhase.L1_N
      ),
      L2: getSampledValueTemplate(
        chargingStation,
        connectorId,
        measurandsKey,
        MeterValueMeasurand.POWER_ACTIVE_IMPORT,
        evseId,
        MeterValuePhase.L2_N
      ),
      L3: getSampledValueTemplate(
        chargingStation,
        connectorId,
        measurandsKey,
        MeterValueMeasurand.POWER_ACTIVE_IMPORT,
        evseId,
        MeterValuePhase.L3_N
      ),
    }
  }

  checkMeasurandPowerDivider(chargingStation, powerTemplate.measurand)
  const powerValues: MeasurandValues = {} as MeasurandValues
  const unitDivider = powerTemplate.unit === MeterValueUnit.KILO_WATT ? UNIT_DIVIDER_KILO : 1
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
      const errorMsg = `MeterValues measurand ${
        powerTemplate.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      }: Unknown ${chargingStation.stationInfo?.currentOutType} currentOutType in template file ${
        chargingStation.templateFile
      }, cannot calculate ${
        powerTemplate.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      } measurand value`
      logger.error(`${chargingStation.logPrefix()} ${errorMsg}`)
      throw new OCPPError(ErrorType.INTERNAL_ERROR, errorMsg, RequestCommand.METER_VALUES)
    }
  }

  return {
    perPhaseTemplates,
    template: powerTemplate,
    values: powerValues,
  }
}

const buildCurrentMeasurandValue = (
  chargingStation: ChargingStation,
  connectorId: number,
  evseId?: number,
  measurandsKey?: ConfigurationKeyType
): MultiPhaseMeasurandData | null => {
  const currentTemplate = getSampledValueTemplate(
    chargingStation,
    connectorId,
    measurandsKey,
    MeterValueMeasurand.CURRENT_IMPORT,
    evseId
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
        measurandsKey,
        MeterValueMeasurand.CURRENT_IMPORT,
        evseId,
        MeterValuePhase.L1
      ),
      L2: getSampledValueTemplate(
        chargingStation,
        connectorId,
        measurandsKey,
        MeterValueMeasurand.CURRENT_IMPORT,
        evseId,
        MeterValuePhase.L2
      ),
      L3: getSampledValueTemplate(
        chargingStation,
        connectorId,
        measurandsKey,
        MeterValueMeasurand.CURRENT_IMPORT,
        evseId,
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
        chargingStation.getVoltageOut()
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
        chargingStation.getVoltageOut()
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
      const errorMsg = `MeterValues measurand ${
        currentTemplate.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      }: Unknown ${chargingStation.stationInfo?.currentOutType} currentOutType in template file ${
        chargingStation.templateFile
      }, cannot calculate ${
        currentTemplate.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      } measurand value`
      logger.error(`${chargingStation.logPrefix()} ${errorMsg}`)
      throw new OCPPError(ErrorType.INTERNAL_ERROR, errorMsg, RequestCommand.METER_VALUES)
    }
  }

  return {
    perPhaseTemplates,
    template: currentTemplate,
    values: currentValues,
  }
}

/**
 * Builds an empty MeterValue with no sampled values and the current timestamp.
 * @returns Empty MeterValue object
 */
export const buildEmptyMeterValue = (): MeterValue => ({
  sampledValue: [],
  timestamp: new Date(),
})

/**
 * Builds a complete MeterValue with all configured measurands for a transaction.
 * @param chargingStation - Target charging station
 * @param transactionId - Active transaction identifier
 * @param interval - Meter value sampling interval in milliseconds
 * @param measurandsKey - Configuration key for the sampled measurands list
 * @param context - Meter value reading context
 * @param debug - Enable debug logging for measurand validation
 * @returns Populated MeterValue object
 */
export const buildMeterValue = (
  chargingStation: ChargingStation,
  transactionId: number | string | undefined,
  interval: number,
  measurandsKey?: ConfigurationKeyType,
  context?: MeterValueContext,
  debug = false
): MeterValue => {
  if (transactionId == null) {
    return buildEmptyMeterValue()
  }
  const connectorId = chargingStation.getConnectorIdByTransactionId(transactionId)
  let evseId: number | undefined
  let buildVersionedSampledValue: (
    sampledValueTemplate: SampledValueTemplate,
    value: number,
    context?: MeterValueContext,
    phase?: MeterValuePhase
  ) => SampledValue
  switch (chargingStation.stationInfo?.ocppVersion) {
    case OCPPVersion.VERSION_16:
      if (connectorId == null) {
        throw new OCPPError(
          ErrorType.INTERNAL_ERROR,
          `Cannot build MeterValues: no connector found for transaction ${String(transactionId)}`,
          RequestCommand.METER_VALUES
        )
      }
      buildVersionedSampledValue = buildOCPP16SampledValue
      break
    case OCPPVersion.VERSION_20:
    case OCPPVersion.VERSION_201:
      evseId = chargingStation.getEvseIdByTransactionId(transactionId)
      if (connectorId == null || evseId == null) {
        throw new OCPPError(
          ErrorType.INTERNAL_ERROR,
          `Cannot build MeterValues: no connector/EVSE found for transaction ${String(transactionId)}`,
          RequestCommand.METER_VALUES
        )
      }
      buildVersionedSampledValue = buildOCPP20SampledValue
      break
    default:
      throw new OCPPError(
        ErrorType.INTERNAL_ERROR,
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Cannot build meterValue: OCPP version ${chargingStation.stationInfo?.ocppVersion} not supported`,
        RequestCommand.METER_VALUES
      )
  }
  const connectorStatus = chargingStation.getConnectorStatus(connectorId)
  const meterValue: { sampledValue: SampledValue[]; timestamp: Date } = buildEmptyMeterValue()
  // SoC measurand
  const socMeasurand = buildSocMeasurandValue(chargingStation, connectorId, evseId, measurandsKey)
  if (socMeasurand != null) {
    const socSampledValue = buildVersionedSampledValue(
      socMeasurand.template,
      socMeasurand.value,
      context
    )
    meterValue.sampledValue.push(socSampledValue)
    validateMeasurandValue(
      chargingStation,
      connectorId,
      convertToInt(socSampledValue.value),
      socMeasurand.template.minimumValue ?? 0,
      SOC_MAXIMUM_VALUE,
      socSampledValue.measurand,
      debug
    )
  }
  // Voltage measurand
  const voltageMeasurand = buildVoltageMeasurandValue(
    chargingStation,
    connectorId,
    evseId,
    measurandsKey
  )
  if (voltageMeasurand != null) {
    addMainVoltageToMeterValue(
      chargingStation,
      meterValue,
      voltageMeasurand,
      buildVersionedSampledValue,
      context
    )
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
        `L${phase.toString()}-N` as MeterValuePhase,
        chargingStation.getVoltageOut(),
        buildVersionedSampledValue,
        measurandsKey,
        context,
        voltageMeasurand.value
      )
      if (chargingStation.stationInfo.phaseLineToLineVoltageMeterValues === true) {
        const nextPhase =
          (phase + 1) % chargingStation.getNumberOfPhases() !== 0
            ? ((phase + 1) % chargingStation.getNumberOfPhases()).toString()
            : chargingStation.getNumberOfPhases().toString()
        const lineToLineLabel = `L${phase.toString()}-L${nextPhase}` as MeterValuePhase
        const lineToLineNominalVoltage = roundTo(
          Math.sqrt(chargingStation.getNumberOfPhases()) * chargingStation.getVoltageOut(),
          2
        )
        addPhaseVoltageToMeterValue(
          chargingStation,
          connectorId,
          meterValue,
          voltageMeasurand,
          lineToLineLabel,
          lineToLineNominalVoltage,
          buildVersionedSampledValue,
          measurandsKey,
          context
        )
      }
    }
  }
  // Power.Active.Import measurand
  const powerMeasurand = buildPowerMeasurandValue(
    chargingStation,
    connectorId,
    evseId,
    measurandsKey
  )
  if (powerMeasurand?.values.allPhases != null) {
    const unitDivider =
      powerMeasurand.template.unit === MeterValueUnit.KILO_WATT ? UNIT_DIVIDER_KILO : 1
    const connectorMaximumAvailablePower =
      chargingStation.getConnectorMaximumAvailablePower(connectorId)
    const connectorMaximumPower = Math.round(connectorMaximumAvailablePower)
    const connectorMinimumPower = Math.round(powerMeasurand.template.minimumValue ?? 0)

    meterValue.sampledValue.push(
      buildVersionedSampledValue(powerMeasurand.template, powerMeasurand.values.allPhases, context)
    )
    const sampledValuesIndex = meterValue.sampledValue.length - 1
    validateMeasurandValue(
      chargingStation,
      connectorId,
      convertToFloat(meterValue.sampledValue[sampledValuesIndex].value),
      connectorMinimumPower / unitDivider,
      connectorMaximumPower / unitDivider,
      meterValue.sampledValue[sampledValuesIndex].measurand,
      debug,
      { connectorStatus }
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
            buildVersionedSampledValue(phaseTemplate, phasePowerValue, context, phaseValue)
          )
          const sampledValuesPerPhaseIndex = meterValue.sampledValue.length - 1
          validateMeasurandValue(
            chargingStation,
            connectorId,
            convertToFloat(meterValue.sampledValue[sampledValuesPerPhaseIndex].value),
            connectorMinimumPowerPerPhase / unitDivider,
            connectorMaximumPowerPerPhase / unitDivider,
            meterValue.sampledValue[sampledValuesPerPhaseIndex].measurand,
            debug,
            { connectorStatus }
          )
        }
      }
    }
  }
  // Current.Import measurand
  const currentMeasurand = buildCurrentMeasurandValue(
    chargingStation,
    connectorId,
    evseId,
    measurandsKey
  )
  if (currentMeasurand?.values.allPhases != null) {
    const connectorMaximumAvailablePower =
      chargingStation.getConnectorMaximumAvailablePower(connectorId)
    const connectorMaximumAmperage =
      chargingStation.stationInfo.currentOutType === CurrentType.AC
        ? ACElectricUtils.amperagePerPhaseFromPower(
          chargingStation.getNumberOfPhases(),
          connectorMaximumAvailablePower,
          chargingStation.getVoltageOut()
        )
        : DCElectricUtils.amperage(connectorMaximumAvailablePower, chargingStation.getVoltageOut())
    const connectorMinimumAmperage = currentMeasurand.template.minimumValue ?? 0

    meterValue.sampledValue.push(
      buildVersionedSampledValue(
        currentMeasurand.template,
        currentMeasurand.values.allPhases,
        context
      )
    )
    const sampledValuesIndex = meterValue.sampledValue.length - 1
    validateMeasurandValue(
      chargingStation,
      connectorId,
      convertToFloat(meterValue.sampledValue[sampledValuesIndex].value),
      connectorMinimumAmperage,
      connectorMaximumAmperage,
      meterValue.sampledValue[sampledValuesIndex].measurand,
      debug,
      { connectorStatus }
    )
    for (
      let phase = 1;
      chargingStation.getNumberOfPhases() === 3 && phase <= chargingStation.getNumberOfPhases();
      phase++
    ) {
      const phaseValue = `L${phase.toString()}` as MeterValuePhase
      meterValue.sampledValue.push(
        buildVersionedSampledValue(
          currentMeasurand.perPhaseTemplates[
            phaseValue as keyof MeasurandPerPhaseSampledValueTemplates
          ] ?? currentMeasurand.template,
          currentMeasurand.values[phaseValue as keyof MeasurandPerPhaseSampledValueTemplates],
          context,
          phaseValue
        )
      )
      const sampledValuesPerPhaseIndex = meterValue.sampledValue.length - 1
      validateMeasurandValue(
        chargingStation,
        connectorId,
        convertToFloat(meterValue.sampledValue[sampledValuesPerPhaseIndex].value),
        connectorMinimumAmperage,
        connectorMaximumAmperage,
        meterValue.sampledValue[sampledValuesPerPhaseIndex].measurand,
        debug,
        { connectorStatus, phase: meterValue.sampledValue[sampledValuesPerPhaseIndex].phase }
      )
    }
  }
  // Energy.Active.Import.Register measurand (default)
  const energyMeasurand = buildEnergyMeasurandValue(
    chargingStation,
    connectorId,
    interval,
    evseId,
    measurandsKey
  )
  if (energyMeasurand != null) {
    updateConnectorEnergyValues(connectorStatus, energyMeasurand.value)
    const unitDivider =
      energyMeasurand.template.unit === MeterValueUnit.KILO_WATT_HOUR ? UNIT_DIVIDER_KILO : 1
    const energySampledValue = buildVersionedSampledValue(
      energyMeasurand.template,
      roundTo(
        chargingStation.getEnergyActiveImportRegisterByTransactionId(transactionId) / unitDivider,
        2
      ),
      context
    )
    meterValue.sampledValue.push(energySampledValue)
    const connectorMaximumAvailablePower =
      chargingStation.getConnectorMaximumAvailablePower(connectorId)
    const connectorMaximumEnergyRounded = roundTo(
      (connectorMaximumAvailablePower * interval) / MS_PER_HOUR,
      2
    )
    const connectorMinimumEnergyRounded = roundTo(energyMeasurand.template.minimumValue ?? 0, 2)
    validateMeasurandValue(
      chargingStation,
      connectorId,
      energyMeasurand.value,
      connectorMinimumEnergyRounded,
      connectorMaximumEnergyRounded,
      energySampledValue.measurand,
      debug,
      { interval }
    )
  }
  return meterValue as MeterValue
}

const checkMeasurandPowerDivider = (
  chargingStation: ChargingStation,
  measurandType: MeterValueMeasurand | undefined
): void => {
  if (chargingStation.powerDivider == null) {
    const errorMsg = `MeterValues measurand ${
      measurandType ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
    }: powerDivider is undefined`
    logger.error(`${chargingStation.logPrefix()} ${errorMsg}`)
    throw new OCPPError(ErrorType.INTERNAL_ERROR, errorMsg, RequestCommand.METER_VALUES)
  } else if (chargingStation.powerDivider <= 0) {
    const errorMsg = `MeterValues measurand ${
      measurandType ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
    }: powerDivider have zero or below value ${chargingStation.powerDivider.toString()}`
    logger.error(`${chargingStation.logPrefix()} ${errorMsg}`)
    throw new OCPPError(ErrorType.INTERNAL_ERROR, errorMsg, RequestCommand.METER_VALUES)
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
          (options.unitMultiplier ?? 1),
        maxLimit
      ),
      minLimit
    )
  }
  return (
    (!Number.isNaN(parsedValue) ? parsedValue : (options.fallbackValue ?? 0)) *
    (options.unitMultiplier ?? 1)
  )
}

const isMeasurandSupported = (measurand: MeterValueMeasurand): boolean => {
  const supportedMeasurands = OCPPConstants.OCPP_MEASURANDS_SUPPORTED as readonly string[]
  return supportedMeasurands.includes(measurand as string)
}

/**
 * Retrieves the sampled value template matching the given measurand and phase from configuration.
 * @param chargingStation - Target charging station
 * @param connectorId - Connector ID to look up templates for
 * @param measurandsKey - Configuration key containing the list of sampled measurands
 * @param measurand - Meter value measurand to match
 * @param evseId - Optional EVSE ID for OCPP 2.0 template lookup
 * @param phase - Optional phase to match in the template
 * @returns Matching sampled value template, or undefined if not found
 */
export const getSampledValueTemplate = (
  chargingStation: ChargingStation,
  connectorId: number,
  measurandsKey: ConfigurationKeyType = StandardParametersKey.MeterValuesSampledData,
  measurand: MeterValueMeasurand = MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
  evseId?: number,
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
    getConfigurationKey(chargingStation, measurandsKey)?.value?.includes(measurand) === false
  ) {
    logger.debug(
      `${chargingStation.logPrefix()} Trying to get MeterValues measurand '${measurand}' ${onPhaseStr}in template on connector id ${connectorId.toString()} not found in sampled data OCPP parameter`
    )
    return
  }
  let sampledValueTemplates: SampledValueTemplate[] | undefined
  if (evseId != null) {
    const evseStatus = chargingStation.getEvseStatus(evseId)
    if (evseStatus != null) {
      if (isNotEmptyArray(evseStatus.MeterValues)) {
        sampledValueTemplates = evseStatus.MeterValues
      } else {
        const connectorTemplates: SampledValueTemplate[] = []
        for (const connectorStatus of evseStatus.connectors.values()) {
          if (isNotEmptyArray(connectorStatus.MeterValues)) {
            connectorTemplates.push(...connectorStatus.MeterValues)
          }
        }
        sampledValueTemplates = isNotEmptyArray(connectorTemplates) ? connectorTemplates : undefined
      }
    }
  } else {
    sampledValueTemplates = chargingStation.getConnectorStatus(connectorId)?.MeterValues
  }
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
      getConfigurationKey(chargingStation, measurandsKey)?.value?.includes(measurand) === true
    ) {
      return sampledValueTemplates[index]
    } else if (
      phase == null &&
      sampledValueTemplates[index].phase == null &&
      sampledValueTemplates[index].measurand === measurand &&
      getConfigurationKey(chargingStation, measurandsKey)?.value?.includes(measurand) === true
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

/**
 * Resolves the common sampled value fields from a template and optional overrides.
 * @param sampledValueTemplate - Template containing measurement configuration and metadata
 * @param value - The measured numeric value to be included in the sampled value
 * @param context - Optional context specifying when the measurement was taken (e.g., Sample.Periodic)
 * @param phase - Optional phase information for multi-phase electrical measurements
 * @returns An object containing the resolved sampled value fields
 */
export const resolveSampledValueFields = (
  sampledValueTemplate: SampledValueTemplate,
  value: number,
  context?: MeterValueContext,
  phase?: MeterValuePhase
): {
  context: MeterValueContext
  location: MeterValueLocation | undefined
  measurand: MeterValueMeasurand
  phase: MeterValuePhase | undefined
  unit: MeterValueUnit | undefined
  value: number
} => {
  const sampledValueMeasurand =
    (sampledValueTemplate.measurand as MeterValueMeasurand | undefined) ??
    MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
  return {
    context:
      context ??
      (sampledValueTemplate.context as MeterValueContext | undefined) ??
      MeterValueContext.SAMPLE_PERIODIC,
    location:
      (sampledValueTemplate.location as MeterValueLocation | undefined) ??
      getMeasurandDefaultLocation(sampledValueMeasurand),
    measurand: sampledValueMeasurand,
    phase: phase ?? (sampledValueTemplate.phase as MeterValuePhase | undefined),
    unit:
      (sampledValueTemplate.unit as MeterValueUnit | undefined) ??
      getMeasurandDefaultUnit(sampledValueMeasurand),
    value,
  }
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

/**
 * Creates a Map of compiled OCPP payload validators from configurations.
 * Reduces code duplication across OCPP services.
 * @param configs - Array of tuples containing command and validator configuration
 * @param options - Factory options including OCPP version, schema directory, etc.
 * @param options.ocppVersion - The OCPP version for schema validation
 * @param options.schemaDir - Directory path containing JSON schemas
 * @param options.moduleName - Name of the module for logging
 * @param options.methodName - Name of the method for logging
 * @param ajvInstance - Configured Ajv instance for validation
 * @returns Map of commands to their compiled validation functions
 */
export function createPayloadValidatorMap<Command extends JsonType> (
  configs: [Command, { schemaPath: string }][],
  options: {
    methodName: string
    moduleName: string
    ocppVersion: OCPPVersion
    schemaDir: string
  },
  ajvInstance: Ajv
): Map<Command, ValidateFunction<JsonType>> {
  return new Map<Command, ValidateFunction<JsonType>>(
    configs.map(([command, config]) => {
      const fullSchemaPath = `${options.schemaDir}/${config.schemaPath}`
      const schema = parseJsonSchemaFile<JsonType>(
        fullSchemaPath,
        options.ocppVersion,
        options.moduleName,
        options.methodName
      )
      return [command, ajvInstance.compile(schema)]
    })
  )
}

/**
 * @param chargingStation - Target charging station
 * @param ocppCommand - OCPP command triggering the validation
 * @param connectorId - Connector ID to validate
 * @returns Whether the connector ID is valid (>= 0)
 */
export function isConnectorIdValid (
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

/**
 * @param chargingStation - Target charging station
 * @param command - Incoming request command to check
 * @returns Whether the command is supported by the station configuration
 */
export function isIncomingRequestCommandSupported (
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

/**
 * @param chargingStation - Target charging station
 * @param messageTrigger - Message trigger to check
 * @returns Whether the trigger is supported by the station configuration
 */
export function isMessageTriggerSupported (
  chargingStation: ChargingStation,
  messageTrigger: MessageTrigger
): boolean {
  const isMessageTrigger = (Object.values(MessageTrigger) as MessageTrigger[]).includes(
    messageTrigger
  )
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

/**
 * @param chargingStation - Target charging station
 * @param command - Outgoing request command to check
 * @returns Whether the command is supported by the station configuration
 */
export function isRequestCommandSupported (
  chargingStation: ChargingStation,
  command: RequestCommand
): boolean {
  const isRequestCommand = Object.values<RequestCommand>(RequestCommand).includes(command)
  if (isRequestCommand && chargingStation.stationInfo?.commandsSupport?.outgoingCommands == null) {
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

const PayloadValidatorConfig = (schemaPath: string) =>
  ({
    schemaPath,
  }) as const

/**
 * Maps schema name tuples to payload validator config tuples with the given suffix.
 * @param schemaNames - Array of `[command, schemaBase]` tuples
 * @param schemaSuffix - File suffix appended to each schema base (e.g. `Request.json`)
 * @returns Array of `[command, config]` tuples for payload validator map construction
 */
export function createPayloadConfigs<Command> (
  schemaNames: readonly [Command, string][],
  schemaSuffix: string
): [Command, { schemaPath: string }][] {
  return schemaNames.map(([command, schemaBase]) => [
    command,
    PayloadValidatorConfig(`${schemaBase}${schemaSuffix}`),
  ])
}

/**
 * Options for payload validator creation.
 * @param ocppVersion - The OCPP version
 * @param schemaDir - Directory containing JSON schemas
 * @param moduleName - Name of the OCPP module
 * @param methodName - Name of the method/command
 * @returns Options object for payload validator creation
 */
export const PayloadValidatorOptions = (
  ocppVersion: OCPPVersion,
  schemaDir: string,
  moduleName: string,
  methodName: string
) =>
  ({
    methodName,
    moduleName,
    ocppVersion,
    schemaDir,
  }) as const

/**
 * Parses and loads a JSON schema file for OCPP payload validation.
 * Handles file reading and JSON parsing for schema validation.
 * @param relativePath - Path to the schema file relative to the OCPP utils directory
 * @param ocppVersion - The OCPP version for error logging context
 * @param moduleName - Optional module name for error logging
 * @param methodName - Optional method name for error logging
 * @returns Parsed JSON schema object
 * @throws {NodeJS.ErrnoException} If the schema file cannot be read or parsed
 */
export function parseJsonSchemaFile<T extends JsonType> (
  relativePath: string,
  ocppVersion: OCPPVersion,
  moduleName?: string,
  methodName?: string
): JSONSchemaType<T> {
  const baseDir = dirname(fileURLToPath(import.meta.url))
  // Primary: resolve from file directory (production esbuild bundle)
  const primaryPath = join(baseDir, relativePath)
  try {
    return JSON.parse(readFileSync(primaryPath, 'utf8')) as JSONSchemaType<T>
  } catch (primaryError) {
    // Fallback: resolve from source root (development/test with tsx)
    const fallbackPath = join(baseDir, '..', '..', relativePath)
    try {
      return JSON.parse(readFileSync(fallbackPath, 'utf8')) as JSONSchemaType<T>
    } catch {
      handleFileException(
        primaryPath,
        FileType.JsonSchema,
        primaryError as NodeJS.ErrnoException,
        ocppServiceUtilsLogPrefix(ocppVersion, moduleName, methodName)
      )
      // handleFileException throws by default; this satisfies the compiler
      throw primaryError
    }
  }
}

const ocppServiceUtilsLogPrefix = (
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
