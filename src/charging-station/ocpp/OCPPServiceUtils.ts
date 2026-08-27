import _Ajv, { type ErrorObject, type JSONSchemaType, type ValidateFunction } from 'ajv'
import _ajvFormats from 'ajv-formats'
import { isDate } from 'date-fns'
import { randomInt } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type {
  BootReasonEnumType,
  OCPP20RequiredVariableName,
  OCPP20VendorVariableName,
  SigningMethodEnumType,
} from '../../types/index.js'

import {
  buildConfigKey,
  type ChargingStation,
  getConfigurationKey,
} from '../../charging-station/index.js'
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
  OCPP20ComponentName,
  type OCPP20MeterValue,
  OCPP20OptionalVariableName,
  OCPP20PhaseEnumType,
  OCPP20ReadingContextEnumType,
  type OCPP20SampledValue,
  OCPPVersion,
  RequestCommand,
  type SampledValue,
  type SampledValueTemplate,
  StandardParametersKey,
  VendorParametersKey,
} from '../../types/index.js'
import {
  ACElectricUtils,
  clone,
  Constants,
  convertToBoolean,
  convertToFloat,
  convertToInt,
  DCElectricUtils,
  getRandomFloatFluctuatedRounded,
  getRandomFloatRounded,
  handleFileException,
  isNotEmptyArray,
  isNotEmptyString,
  isOCPP20x,
  isValidRandomIntBounds,
  JSONStringify,
  logger,
  logPrefix,
  max,
  min,
  roundTo,
} from '../../utils/index.js'
import {
  buildCoherentMeterValue,
  buildCoherentMeterValueSnapshot,
  type BuildVersionedSampledValue,
  isCoherentModeActive,
  resolveRootSeed,
} from '../meter-values/index.js'
import {
  buildOCPP16BootNotificationRequest,
  buildOCPP16SampledValue,
} from './1.6/OCPP16RequestBuilders.js'
import {
  buildOCPP20BootNotificationRequest,
  buildOCPP20SampledValue,
} from './2.0/OCPP20RequestBuilders.js'
import { OCPPConstants } from './OCPPConstants.js'
import {
  parsePublicKeyWithSignedMeterValue,
  type SampledValueSigningConfig,
  validateSigningPrerequisites,
} from './OCPPSignedMeterValueUtils.js'

const moduleName = 'OCPPServiceUtils'

const isOCPP20FlagEnabled = (
  chargingStation: ChargingStation,
  component: OCPP20ComponentName,
  variable: OCPP20OptionalVariableName | OCPP20RequiredVariableName | OCPP20VendorVariableName
): boolean =>
  convertToBoolean(getConfigurationKey(chargingStation, buildConfigKey(component, variable))?.value)

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
 * @returns `true` when payload validation succeeds; `false` otherwise.
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
    JSONStringify(validate.errors, 2)
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- iterating an unknown-typed JSON array to normalize Date entries in place
        const item = value[i]
        if (isDate(item)) {
          try {
            value[i] = item.toISOString()
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
  measurandsKey?: ConfigurationKeyType,
  connectorLocalFallback = false
): null | SingleValueMeasurandData => {
  const socSampledValueTemplate = getSampledValueTemplate(
    chargingStation,
    connectorId,
    measurandsKey,
    MeterValueMeasurand.STATE_OF_CHARGE,
    evseId,
    undefined,
    connectorLocalFallback
  )
  if (socSampledValueTemplate == null) {
    return null
  }

  const socMaximumValue = Constants.SOC_MAXIMUM_PERCENT
  const socMinimumValue = socSampledValueTemplate.minimumValue ?? 0
  let socSampledValueTemplateValue: number
  if (isNotEmptyString(socSampledValueTemplate.value)) {
    socSampledValueTemplateValue = getRandomFloatFluctuatedRounded(
      convertToInt(socSampledValueTemplate.value),
      socSampledValueTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT
    )
  } else if (isValidRandomIntBounds(socMinimumValue, socMaximumValue)) {
    socSampledValueTemplateValue = randomInt(socMinimumValue, socMaximumValue + 1)
  } else {
    logger.warn(
      `${chargingStation.logPrefix()} ${moduleName}.buildSocMeasurandValue: invalid SoC bounds socMinimumValue=${socMinimumValue.toString()}, socMaximumValue=${socMaximumValue.toString()} — skipping SoC measurand`
    )
    return null
  }

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
  measurandsKey?: ConfigurationKeyType,
  connectorLocalFallback = false
): null | SingleValueMeasurandData => {
  const voltageSampledValueTemplate = getSampledValueTemplate(
    chargingStation,
    connectorId,
    measurandsKey,
    MeterValueMeasurand.VOLTAGE,
    evseId,
    undefined,
    connectorLocalFallback
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
  noTemplateFallback?: number,
  evseId?: number,
  connectorLocalFallback = false
): void => {
  const phaseSampledValueTemplate = getSampledValueTemplate(
    chargingStation,
    connectorId,
    measurandsKey,
    MeterValueMeasurand.VOLTAGE,
    evseId,
    phaseLabel,
    connectorLocalFallback
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
  measurandsKey?: ConfigurationKeyType,
  snapshot = false
): null | SingleValueMeasurandData => {
  const energyTemplate = getSampledValueTemplate(
    chargingStation,
    connectorId,
    measurandsKey,
    undefined,
    evseId,
    undefined,
    snapshot
  )
  if (energyTemplate == null) {
    return null
  }
  if (snapshot) {
    return { template: energyTemplate, value: 0 }
  }

  checkMeasurandPowerDivider(chargingStation, energyTemplate.measurand)
  const unitDivider =
    energyTemplate.unit === MeterValueUnit.KILO_WATT_HOUR ? Constants.UNIT_DIVIDER_KILO : 1
  const connectorMaximumAvailablePower = chargingStation.getConnectorMaximumAvailablePower(
    connectorId,
    evseId
  )
  const connectorMaximumEnergyRounded = roundTo(
    (connectorMaximumAvailablePower * interval) / Constants.MS_PER_HOUR,
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
    : getRandomFloatRounded(connectorMinimumEnergyRounded, connectorMaximumEnergyRounded)

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
  measurandsKey?: ConfigurationKeyType,
  idle = false,
  connectorLocalFallback = false
): MultiPhaseMeasurandData | null => {
  const powerTemplate = getSampledValueTemplate(
    chargingStation,
    connectorId,
    measurandsKey,
    MeterValueMeasurand.POWER_ACTIVE_IMPORT,
    evseId,
    undefined,
    connectorLocalFallback
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
        MeterValuePhase.L1_N,
        connectorLocalFallback
      ),
      L2: getSampledValueTemplate(
        chargingStation,
        connectorId,
        measurandsKey,
        MeterValueMeasurand.POWER_ACTIVE_IMPORT,
        evseId,
        MeterValuePhase.L2_N,
        connectorLocalFallback
      ),
      L3: getSampledValueTemplate(
        chargingStation,
        connectorId,
        measurandsKey,
        MeterValueMeasurand.POWER_ACTIVE_IMPORT,
        evseId,
        MeterValuePhase.L3_N,
        connectorLocalFallback
      ),
    }
  }

  checkMeasurandPowerDivider(chargingStation, powerTemplate.measurand)
  const powerValues: MeasurandValues = {} as MeasurandValues
  if (idle) {
    return {
      perPhaseTemplates,
      template: powerTemplate,
      values: { allPhases: 0, L1: 0, L2: 0, L3: 0 },
    }
  }
  const unitDivider =
    powerTemplate.unit === MeterValueUnit.KILO_WATT ? Constants.UNIT_DIVIDER_KILO : 1
  const connectorMaximumAvailablePower = chargingStation.getConnectorMaximumAvailablePower(
    connectorId,
    evseId
  )
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
            connectorMinimumPowerPerPhase / unitDivider,
            connectorMaximumPowerPerPhase / unitDivider
          )
        powerValues.L2 =
          phase2Value ??
          defaultFluctuatedPowerPerPhase ??
          getRandomFloatRounded(
            connectorMinimumPowerPerPhase / unitDivider,
            connectorMaximumPowerPerPhase / unitDivider
          )
        powerValues.L3 =
          phase3Value ??
          defaultFluctuatedPowerPerPhase ??
          getRandomFloatRounded(
            connectorMinimumPowerPerPhase / unitDivider,
            connectorMaximumPowerPerPhase / unitDivider
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
            connectorMinimumPower / unitDivider,
            connectorMaximumPower / unitDivider
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
          connectorMinimumPower / unitDivider,
          connectorMaximumPower / unitDivider
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
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.buildPowerMeasurandValue: ${errorMsg}`
      )
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
  measurandsKey?: ConfigurationKeyType,
  idle = false,
  connectorLocalFallback = false
): MultiPhaseMeasurandData | null => {
  const currentTemplate = getSampledValueTemplate(
    chargingStation,
    connectorId,
    measurandsKey,
    MeterValueMeasurand.CURRENT_IMPORT,
    evseId,
    undefined,
    connectorLocalFallback
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
        MeterValuePhase.L1,
        connectorLocalFallback
      ),
      L2: getSampledValueTemplate(
        chargingStation,
        connectorId,
        measurandsKey,
        MeterValueMeasurand.CURRENT_IMPORT,
        evseId,
        MeterValuePhase.L2,
        connectorLocalFallback
      ),
      L3: getSampledValueTemplate(
        chargingStation,
        connectorId,
        measurandsKey,
        MeterValueMeasurand.CURRENT_IMPORT,
        evseId,
        MeterValuePhase.L3,
        connectorLocalFallback
      ),
    }
  }

  checkMeasurandPowerDivider(chargingStation, currentTemplate.measurand)
  const currentValues: MeasurandValues = {} as MeasurandValues
  if (idle) {
    return {
      perPhaseTemplates,
      template: currentTemplate,
      values: { allPhases: 0, L1: 0, L2: 0, L3: 0 },
    }
  }
  const connectorMaximumAvailablePower = chargingStation.getConnectorMaximumAvailablePower(
    connectorId,
    evseId
  )
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
          getRandomFloatRounded(connectorMinimumAmperage, connectorMaximumAmperage)
        currentValues.L2 =
          phase2Value ??
          defaultFluctuatedAmperagePerPhase ??
          getRandomFloatRounded(connectorMinimumAmperage, connectorMaximumAmperage)
        currentValues.L3 =
          phase3Value ??
          defaultFluctuatedAmperagePerPhase ??
          getRandomFloatRounded(connectorMinimumAmperage, connectorMaximumAmperage)
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
          : getRandomFloatRounded(connectorMinimumAmperage, connectorMaximumAmperage)
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
        : getRandomFloatRounded(connectorMinimumAmperage, connectorMaximumAmperage)
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
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.buildCurrentMeasurandValue: ${errorMsg}`
      )
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
 * Resolved meter-value identity shared by {@link buildIdentifiedMeterValue} and
 * {@link createVersionedSampledValueDispatcher}. Either transaction-derived
 * (legacy callers pass only `transactionId`) or provided directly for
 * clock-aligned reporting (`connectorId` + `evseId` + `snapshot`, #2011
 * Category 2F).
 */
interface ResolvedMeterValueIdentity {
  connectorId?: number
  evseId?: number
  snapshot?: boolean
  transactionId?: number | string
}

/**
 * Internal dispatch bag returned by {@link createVersionedSampledValueDispatcher}
 * and consumed by {@link buildIdentifiedMeterValue}. Not exported: kept out of the
 * module surface so external callers rely on the higher-level entry point.
 */
interface VersionedSampledValueDispatch {
  buildUnsignedVersionedSampledValue: BuildVersionedSampledValue
  buildVersionedSampledValue: BuildVersionedSampledValue
  connectorId: number
  evseId: number | undefined
  signingConfig: SampledValueSigningConfig | undefined
  /**
   * Passed by reference; the closure assigned to `buildVersionedSampledValue`
   * mutates its `publicKeyIncluded` flag when a signed OCPP 2.0.1 SampledValue
   * is emitted. Callers rely on the reference identity to detect the mutation.
   */
  signingState: { publicKeyIncluded: boolean }
}

/**
 * Resolves the connector/EVSE ids and constructs the OCPP-version dispatcher
 * used by {@link buildIdentifiedMeterValue}, the shared builder behind {@link buildMeterValue} and {@link buildClockAlignedConnectorMeterValue}.
 * The identity is either transaction-derived (legacy callers) or provided
 * directly (clock-aligned reporting for idle connectors, #2011 Category 2F).
 * @param chargingStation - Target charging station.
 * @param identity - Meter value source.
 * @param identity.connectorId - Direct connector id (clock path) or resolved
 *   from `transactionId`.
 * @param identity.evseId - Direct EVSE id or resolved from `transactionId`.
 * @param identity.snapshot - Whether this build serializes state without
 *   advancing physical registers or coherent-session state.
 * @param identity.transactionId - Active transaction identifier when building
 *   transactional meter values.
 * @param context - Optional MeterValue reading context (drives signing
 *   configuration for OCPP 2.0.1).
 * @returns The dispatch bundle.
 */
const createVersionedSampledValueDispatcher = (
  chargingStation: ChargingStation,
  identity: ResolvedMeterValueIdentity,
  context?: MeterValueContext
): VersionedSampledValueDispatch => {
  const { transactionId } = identity
  const connectorId =
    identity.connectorId ?? chargingStation.getConnectorIdByTransactionId(transactionId)
  let evseId: number | undefined
  let buildVersionedSampledValue: BuildVersionedSampledValue
  let buildUnsignedVersionedSampledValue: BuildVersionedSampledValue
  let signingConfig: SampledValueSigningConfig | undefined
  const signingState = { publicKeyIncluded: false }
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
      buildUnsignedVersionedSampledValue = buildOCPP16SampledValue
      break
    case OCPPVersion.VERSION_20:
    case OCPPVersion.VERSION_201:
      evseId = identity.evseId ?? chargingStation.getEvseIdByTransactionId(transactionId)
      if (connectorId == null || evseId == null) {
        throw new OCPPError(
          ErrorType.INTERNAL_ERROR,
          `Cannot build MeterValues: no connector/EVSE found for transaction ${String(transactionId)}`,
          RequestCommand.METER_VALUES
        )
      }
      {
        const signReadingsComponent =
          context === OCPP20ReadingContextEnumType.SAMPLE_CLOCK
            ? OCPP20ComponentName.AlignedDataCtrlr
            : OCPP20ComponentName.SampledDataCtrlr
        const signReadings = isOCPP20FlagEnabled(
          chargingStation,
          signReadingsComponent,
          StandardParametersKey.SignReadings
        )

        // Clock-aligned readings built for an idle connector carry no
        // transaction id: they stay unsigned (no signingConfig is constructed)
        // so the one-time public-key state of future transactions is untouched.
        if (signReadings && transactionId != null) {
          let signingEnabledForContext = true
          if (context === OCPP20ReadingContextEnumType.TRANSACTION_BEGIN) {
            signingEnabledForContext = isOCPP20FlagEnabled(
              chargingStation,
              OCPP20ComponentName.SampledDataCtrlr,
              VendorParametersKey.SignStartedReadings
            )
          } else if (context == null || context === OCPP20ReadingContextEnumType.SAMPLE_PERIODIC) {
            signingEnabledForContext = isOCPP20FlagEnabled(
              chargingStation,
              OCPP20ComponentName.SampledDataCtrlr,
              VendorParametersKey.SignUpdatedReadings
            )
          }

          if (signingEnabledForContext) {
            const publicKeyWithSignedMeterValueStr = getConfigurationKey(
              chargingStation,
              buildConfigKey(
                OCPP20ComponentName.OCPPCommCtrlr,
                StandardParametersKey.PublicKeyWithSignedMeterValue
              )
            )?.value
            const publicKeyHex = getConfigurationKey(
              chargingStation,
              buildConfigKey(OCPP20ComponentName.FiscalMetering, VendorParametersKey.PublicKey)
            )?.value
            const configuredSigningMethod = getConfigurationKey(
              chargingStation,
              buildConfigKey(OCPP20ComponentName.FiscalMetering, VendorParametersKey.SigningMethod)
            )?.value as SigningMethodEnumType | undefined

            const prerequisiteResult = validateSigningPrerequisites(
              publicKeyHex,
              configuredSigningMethod
            )
            if (prerequisiteResult.enabled) {
              signingConfig = {
                enabled: true,
                meterSerialNumber: chargingStation.stationInfo.meterSerialNumber ?? 'UNKNOWN',
                publicKeyHex,
                publicKeySentInTransaction:
                  chargingStation.getConnectorStatus(connectorId, evseId)
                    ?.publicKeySentInTransaction ?? false,
                publicKeyWithSignedMeterValue: parsePublicKeyWithSignedMeterValue(
                  publicKeyWithSignedMeterValueStr
                ),
                signingMethod: prerequisiteResult.signingMethod,
                transactionId,
              }
            } else {
              logger.warn(
                `${chargingStation.logPrefix()} ${moduleName}.createVersionedSampledValueDispatcher: Signed meter values disabled: ${prerequisiteResult.reason}`
              )
            }
          }
        }

        buildVersionedSampledValue = (
          sampledValueTemplate: SampledValueTemplate,
          value: number,
          ctx?: MeterValueContext,
          phase?: MeterValuePhase
        ) => {
          const result = buildOCPP20SampledValue(
            sampledValueTemplate,
            value,
            ctx,
            phase,
            signingConfig
          )
          if (result.publicKeyIncluded) {
            signingState.publicKeyIncluded = true
            if (signingConfig != null) signingConfig.publicKeySentInTransaction = true
          }
          return result.sampledValue
        }
        buildUnsignedVersionedSampledValue = (
          sampledValueTemplate: SampledValueTemplate,
          value: number,
          ctx?: MeterValueContext,
          phase?: MeterValuePhase
        ) => buildOCPP20SampledValue(sampledValueTemplate, value, ctx, phase).sampledValue
      }
      break
    default:
      throw new OCPPError(
        ErrorType.INTERNAL_ERROR,
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Cannot build meterValue: OCPP version ${chargingStation.stationInfo?.ocppVersion} not supported`,
        RequestCommand.METER_VALUES
      )
  }
  return {
    buildUnsignedVersionedSampledValue,
    buildVersionedSampledValue,
    connectorId,
    evseId,
    signingConfig,
    signingState,
  }
}

// Module-scope keyed by `ChargingStation` instance (auto-collected on GC).
// Kept off the class API to avoid touching `ChargingStation` for a
// warn-once diagnostic; the WeakMap's semantics match the intent — one
// bag of already-warned entries per station, freed with the station.
// Distinct pattern from the class-scoped lifecycle-state WeakMap on
// `OCPPIncomingRequestService.stationsState`: no `stop()` lifecycle, no
// abort semantics, no `resetStationState` hook — a diagnostic side-effect
// cache freed only by GC.
const warnedInvalidMeasurands = new WeakMap<ChargingStation, Set<string>>()
const KNOWN_MEASURANDS: ReadonlySet<string> = new Set<string>(Object.values(MeterValueMeasurand))

const getOrCreateWarnedMeasurands = (chargingStation: ChargingStation): Set<string> => {
  let warned = warnedInvalidMeasurands.get(chargingStation)
  if (warned == null) {
    warned = new Set<string>()
    warnedInvalidMeasurands.set(chargingStation, warned)
  }
  return warned
}

/**
 * Resolves the set of measurands enabled by the configured OCPP variable.
 *
 * Presence-aware semantics:
 * - No key resolves ⇒ returns `undefined` (no filter — all templates emit,
 *   preserving the default behavior).
 * - Key resolves but the configuration variable is **absent** (never
 *   written) ⇒ returns `{Energy.Active.Import.Register}` (default measurand,
 *   ergonomic parity with a station that never set the variable).
 * - Key resolves and the configuration variable is **present** ⇒ the CSV
 *   is honored verbatim, including an explicit empty value which yields an
 *   empty allow-list (spec-compliant suppression per OCPP 2.0.1 J02.FR.11).
 *
 * Governs OCPP 2.0.1 J02.FR.11 (`TxUpdatedMeasurands`), E02.FR.09
 * (`TxStartedMeasurands`), E06.FR.11 (`TxEndedMeasurands`), and OCPP 1.6
 * `MeterValuesSampledData`.
 * @param chargingStation - Target charging station.
 * @param measurandsKey - Configuration key threaded from the caller. When
 *   `undefined` (or omitted), defaults to `StandardParametersKey.MeterValuesSampledData`
 *   for OCPP 1.6 stations and returns `undefined` (no filter) for all
 *   other versions.
 * @returns Enabled measurand set, or `undefined` for no filter.
 */
const resolveEnabledMeasurands = (
  chargingStation: ChargingStation,
  measurandsKey: ConfigurationKeyType | undefined
): ReadonlySet<MeterValueMeasurand> | undefined => {
  const effectiveKey =
    measurandsKey ??
    (chargingStation.stationInfo?.ocppVersion === OCPPVersion.VERSION_16
      ? StandardParametersKey.MeterValuesSampledData
      : undefined)
  if (effectiveKey == null) {
    return undefined
  }
  const rawValue = getConfigurationKey(chargingStation, effectiveKey)?.value
  if (rawValue == null) {
    return new Set<MeterValueMeasurand>([MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER])
  }
  const enabled = new Set<MeterValueMeasurand>()
  for (const entry of rawValue.split(',')) {
    const trimmed = entry.trim()
    // Kept as `.length === 0`: entry is already trimmed above; `isEmpty()` here would be
    // semantically identical (its string branch is `value.trim().length === 0`) — direct
    // check avoids a redundant re-trim.
    if (trimmed.length === 0) {
      continue
    }
    if (KNOWN_MEASURANDS.has(trimmed)) {
      enabled.add(trimmed as MeterValueMeasurand)
      continue
    }
    const warned = getOrCreateWarnedMeasurands(chargingStation)
    if (!warned.has(trimmed)) {
      warned.add(trimmed)
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.resolveEnabledMeasurands: unknown measurand '${trimmed}' in ${effectiveKey} — ignored`
      )
    }
  }
  return enabled
}

const resolveClockAlignedTemplates = (
  chargingStation: ChargingStation,
  connectorId: number,
  evseId: number | undefined
): SampledValueTemplate[] => {
  const evseTemplates =
    evseId != null ? chargingStation.getEvseStatus(evseId)?.MeterValues : undefined
  return isNotEmptyArray(evseTemplates)
    ? evseTemplates
    : (chargingStation.getConnectorStatus(connectorId, evseId)?.MeterValues ?? [])
}

const resolveSnapshotUnitDivider = (
  measurand: MeterValueMeasurand,
  unit: string | undefined
): number =>
  (measurand === MeterValueMeasurand.POWER_ACTIVE_IMPORT && unit === MeterValueUnit.KILO_WATT) ||
  (measurand === MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER &&
    unit === MeterValueUnit.KILO_WATT_HOUR)
    ? Constants.UNIT_DIVIDER_KILO
    : 1

const isLinePhase = (phase: MeterValuePhase | undefined): boolean =>
  phase != null && /^(L[123]|L[123]-N)$/.test(phase)

const resolveLinePhaseIndex = (phase: MeterValuePhase | undefined): number | undefined => {
  switch (phase) {
    case MeterValuePhase.L1:
    case MeterValuePhase.L1_N:
      return 1
    case MeterValuePhase.L2:
    case MeterValuePhase.L2_N:
      return 2
    case MeterValuePhase.L3:
    case MeterValuePhase.L3_N:
      return 3
    default:
      return undefined
  }
}

const resolveSnapshotPhaseFamily = (
  phase: MeterValuePhase | undefined
): 'Aggregate' | 'Line' | 'LineToLine' | 'Neutral' | 'Unsupported' => {
  if (phase == null) return 'Aggregate'
  if (phase === MeterValuePhase.N) return 'Neutral'
  if (isLinePhase(phase)) return 'Line'
  switch (phase) {
    case MeterValuePhase.L1_L2:
    case MeterValuePhase.L2_L3:
    case MeterValuePhase.L3_L1:
      return 'LineToLine'
    default:
      return 'Unsupported'
  }
}

const applySnapshotRegisterValuesWithoutPhases = (
  templates: SampledValueTemplate[]
): SampledValueTemplate[] => {
  const result = templates.filter(
    template =>
      (template.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER) !==
      MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
  )
  const families = new Map<string, SampledValueTemplate[]>()
  for (const template of templates) {
    if (
      (template.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER) !==
      MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
    ) {
      continue
    }
    const key = JSON.stringify([
      template.context,
      template.format,
      template.location,
      template.unit,
    ])
    const family = families.get(key) ?? []
    family.push(template)
    families.set(key, family)
  }
  for (const family of families.values()) {
    const lineTemplates = family.filter(template => isLinePhase(template.phase))
    if (lineTemplates.length === 0) {
      result.push(...family)
      continue
    }
    const nonLineTemplates = family.filter(template => !isLinePhase(template.phase))
    if (nonLineTemplates.some(template => template.phase == null)) {
      result.push(...nonLineTemplates)
    } else {
      result.push({ ...lineTemplates[0], phase: undefined }, ...nonLineTemplates)
    }
  }
  return result
}

const expandClockAlignedSnapshotSamples = (
  chargingStation: ChargingStation,
  connectorId: number,
  evseId: number | undefined,
  baseline: OCPP20SampledValue[],
  buildVersionedSampledValue: BuildVersionedSampledValue,
  measurandsKey: ConfigurationKeyType | undefined,
  context: MeterValueContext | undefined,
  registerValuesWithoutPhases: boolean,
  idle: boolean
): SampledValue[] => {
  const enabledMeasurands = resolveEnabledMeasurands(chargingStation, measurandsKey)
  const connectorStatus = chargingStation.getConnectorStatus(connectorId, evseId)
  const energyRegister = Math.max(
    0,
    !idle && chargingStation.stationInfo?.meteringPerTransaction === true
      ? (connectorStatus?.transactionEnergyActiveImportRegisterValue ?? 0)
      : (connectorStatus?.energyActiveImportRegisterValue ?? 0)
  )
  const numberOfPhases = Math.max(1, chargingStation.getNumberOfPhases())
  const expanded: SampledValue[] = []
  const resolvedTemplates = resolveClockAlignedTemplates(chargingStation, connectorId, evseId)
  const templates = registerValuesWithoutPhases
    ? applySnapshotRegisterValuesWithoutPhases(resolvedTemplates)
    : resolvedTemplates

  for (const template of templates) {
    const measurand = template.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
    if (enabledMeasurands != null && !enabledMeasurands.has(measurand)) continue
    const phaseFamily = resolveSnapshotPhaseFamily(template.phase)
    if (phaseFamily === 'Unsupported') continue
    const resolvedIdentity = resolveSampledValueFields(template, 0, context, template.phase)
    const exactSource = baseline.find(
      sample =>
        (sample.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER) === measurand &&
        sample.phase === template.phase &&
        sample.location === resolvedIdentity.location &&
        sample.unitOfMeasure?.unit === resolvedIdentity.unit
    )
    if (phaseFamily === 'Line') {
      const linePhaseIndex = resolveLinePhaseIndex(template.phase)
      if (
        chargingStation.stationInfo?.currentOutType !== CurrentType.AC ||
        linePhaseIndex == null ||
        linePhaseIndex > numberOfPhases
      ) {
        continue
      }
    }
    if (
      phaseFamily === 'Neutral' &&
      chargingStation.stationInfo?.currentOutType !== CurrentType.AC
    ) {
      continue
    }
    const aggregateSource = baseline.find(
      sample =>
        (sample.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER) === measurand &&
        sample.phase == null &&
        sample.location === resolvedIdentity.location &&
        sample.unitOfMeasure?.unit === resolvedIdentity.unit
    )
    const source =
      exactSource ??
      (phaseFamily === 'Aggregate' || phaseFamily === 'Line' ? aggregateSource : undefined)
    let rawValue: number | undefined
    if (measurand === MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER) {
      if (phaseFamily === 'Aggregate') {
        rawValue = energyRegister
      } else if (phaseFamily === 'Line') {
        rawValue = energyRegister / numberOfPhases
      }
    } else if (measurand === MeterValueMeasurand.CURRENT_IMPORT && phaseFamily === 'Neutral') {
      rawValue = 0
    } else if (measurand === MeterValueMeasurand.VOLTAGE && phaseFamily === 'Neutral') {
      rawValue = 0
    } else if (
      (measurand === MeterValueMeasurand.CURRENT_IMPORT ||
        measurand === MeterValueMeasurand.POWER_ACTIVE_IMPORT) &&
      (phaseFamily === 'LineToLine' || phaseFamily === 'Neutral')
    ) {
      continue
    } else if (
      measurand === MeterValueMeasurand.VOLTAGE &&
      phaseFamily === 'LineToLine' &&
      (numberOfPhases !== 3 || chargingStation.stationInfo?.currentOutType !== CurrentType.AC)
    ) {
      continue
    } else if (
      measurand === MeterValueMeasurand.STATE_OF_CHARGE &&
      (idle || phaseFamily !== 'Aggregate')
    ) {
      continue
    } else if (measurand === MeterValueMeasurand.VOLTAGE && isNotEmptyString(template.value)) {
      const nominal = getRandomFloatFluctuatedRounded(
        convertToFloat(template.value),
        template.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT
      )
      rawValue = nominal
    } else if (
      measurand === MeterValueMeasurand.STATE_OF_CHARGE &&
      isNotEmptyString(template.value)
    ) {
      rawValue = getRandomFloatFluctuatedRounded(
        convertToInt(template.value),
        template.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT
      )
    } else if (
      (measurand === MeterValueMeasurand.CURRENT_IMPORT ||
        measurand === MeterValueMeasurand.POWER_ACTIVE_IMPORT) &&
      (isNotEmptyString(template.value) ||
        (source == null && (phaseFamily === 'Aggregate' || phaseFamily === 'Line')))
    ) {
      if (idle) {
        rawValue = 0
      } else {
        const divider = resolveSnapshotUnitDivider(measurand, template.unit as string | undefined)
        const maximumValue =
          measurand === MeterValueMeasurand.POWER_ACTIVE_IMPORT
            ? chargingStation.getConnectorMaximumAvailablePower(connectorId, evseId) /
              (phaseFamily === 'Line' ? numberOfPhases : 1) /
              divider
            : chargingStation.stationInfo?.currentOutType === CurrentType.AC
              ? ACElectricUtils.amperagePerPhaseFromPower(
                numberOfPhases,
                chargingStation.getConnectorMaximumAvailablePower(connectorId, evseId),
                chargingStation.getVoltageOut()
              )
              : DCElectricUtils.amperage(
                chargingStation.getConnectorMaximumAvailablePower(connectorId, evseId),
                chargingStation.getVoltageOut()
              )
        const minimumValue = template.minimumValue ?? 0
        const value = isNotEmptyString(template.value)
          ? getRandomFloatFluctuatedRounded(
            getLimitFromSampledValueTemplateCustomValue(
              template.value,
              maximumValue,
              minimumValue,
              {
                fallbackValue: minimumValue,
                limitationEnabled: chargingStation.stationInfo?.customValueLimitationMeterValues,
              }
            ),
            template.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT
          )
          : getRandomFloatRounded(minimumValue, maximumValue)
        rawValue = value * divider
      }
    } else if (
      measurand === MeterValueMeasurand.STATE_OF_CHARGE &&
      source == null &&
      isValidRandomIntBounds(template.minimumValue ?? 0, Constants.SOC_MAXIMUM_PERCENT)
    ) {
      rawValue = randomInt(template.minimumValue ?? 0, Constants.SOC_MAXIMUM_PERCENT + 1)
    } else if (source != null) {
      rawValue = source.value * resolveSnapshotUnitDivider(measurand, source.unitOfMeasure?.unit)
      if (
        measurand === MeterValueMeasurand.POWER_ACTIVE_IMPORT &&
        source.phase == null &&
        phaseFamily === 'Line'
      ) {
        rawValue /= numberOfPhases
      }
    } else if (isNotEmptyString(template.value)) {
      rawValue = getRandomFloatFluctuatedRounded(
        convertToFloat(template.value),
        template.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT
      )
    } else if (measurand === MeterValueMeasurand.VOLTAGE) {
      const nominal =
        phaseFamily === 'LineToLine'
          ? chargingStation.getVoltageOut() * Math.sqrt(3)
          : chargingStation.getVoltageOut()
      rawValue = getRandomFloatFluctuatedRounded(
        nominal,
        template.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT
      )
    }
    if (rawValue == null) continue
    const value = roundTo(
      rawValue / resolveSnapshotUnitDivider(measurand, template.unit as string | undefined),
      2
    )
    expanded.push(buildVersionedSampledValue(template, value, context))
  }
  return applyClockAlignedVoltageControls(
    chargingStation,
    expanded as OCPP20SampledValue[],
    buildVersionedSampledValue,
    context
  )
}

const applyClockAlignedVoltageControls = (
  chargingStation: ChargingStation,
  sampledValues: OCPP20SampledValue[],
  buildVersionedSampledValue: BuildVersionedSampledValue,
  context: MeterValueContext | undefined
): OCPP20SampledValue[] => {
  if (
    chargingStation.getNumberOfPhases() !== 3 ||
    chargingStation.stationInfo?.currentOutType !== CurrentType.AC
  ) {
    return sampledValues
  }
  const aggregateVoltages = sampledValues.filter(
    sample => sample.measurand === MeterValueMeasurand.VOLTAGE && sample.phase == null
  )
  if (aggregateVoltages.length === 0) return sampledValues
  const configuredPhaseSamples = sampledValues.filter(
    sample => sample.measurand === MeterValueMeasurand.VOLTAGE && sample.phase != null
  )
  const automaticSamples: OCPP20SampledValue[] = []
  for (const aggregateVoltage of aggregateVoltages) {
    const configuredPhases = new Set(
      configuredPhaseSamples
        .filter(
          sample =>
            sample.location === aggregateVoltage.location &&
            sample.unitOfMeasure?.unit === aggregateVoltage.unitOfMeasure?.unit
        )
        .map(sample => sample.phase)
    )
    const template = {
      ...aggregateVoltage,
      unit: aggregateVoltage.unitOfMeasure?.unit,
    } as SampledValueTemplate
    const addPhase = (phase: OCPP20PhaseEnumType, value: number): void => {
      if (!configuredPhases.has(phase)) {
        automaticSamples.push(
          buildVersionedSampledValue(
            template,
            roundTo(value, 2),
            context,
            phase
          ) as OCPP20SampledValue
        )
      }
    }
    addPhase(OCPP20PhaseEnumType.L1_N, aggregateVoltage.value)
    addPhase(OCPP20PhaseEnumType.L2_N, aggregateVoltage.value)
    addPhase(OCPP20PhaseEnumType.L3_N, aggregateVoltage.value)
    if (chargingStation.stationInfo.phaseLineToLineVoltageMeterValues === true) {
      const lineToLineVoltage = aggregateVoltage.value * Math.sqrt(3)
      addPhase(OCPP20PhaseEnumType.L1_L2, lineToLineVoltage)
      addPhase(OCPP20PhaseEnumType.L2_L3, lineToLineVoltage)
      addPhase(OCPP20PhaseEnumType.L3_L1, lineToLineVoltage)
    }
  }
  const retainedSamples =
    chargingStation.stationInfo.mainVoltageMeterValues === true
      ? sampledValues
      : sampledValues.filter(
        sample => !(sample.measurand === MeterValueMeasurand.VOLTAGE && sample.phase == null)
      )
  return [...retainedSamples, ...automaticSamples]
}
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
  return buildIdentifiedMeterValue(
    chargingStation,
    { transactionId },
    interval,
    measurandsKey,
    context,
    debug
  )
}

/**
 * Builds a complete OCPP 2.0 MeterValue for a directly identified connector.
 * Active connectors may provide a transaction id to preserve coherent and
 * aligned-signing semantics; idle connectors omit it and stay unsigned.
 * @param chargingStation - Target charging station.
 * @param identity - Direct connector/EVSE identification.
 * @param identity.connectorId - Connector identifier.
 * @param identity.evseId - EVSE identifier.
 * @param identity.transactionId - Optional active transaction identifier.
 * @param interval - Clock-aligned data interval in milliseconds
 * @param measurandsKey - Configuration key for the sampled measurands list
 * @param context - Meter value reading context (Sample.Clock for aligned data)
 * @returns Populated OCPP 2.0 MeterValue object
 */
export const buildClockAlignedConnectorMeterValue = (
  chargingStation: ChargingStation,
  identity: { connectorId: number; evseId: number; transactionId?: number | string },
  interval: number,
  measurandsKey?: ConfigurationKeyType,
  context?: MeterValueContext
): OCPP20MeterValue => {
  if (!isOCPP20x(chargingStation.stationInfo?.ocppVersion)) {
    throw new OCPPError(
      ErrorType.INTERNAL_ERROR,
      `Cannot build clock-aligned MeterValue for OCPP version ${String(chargingStation.stationInfo?.ocppVersion)}`,
      RequestCommand.METER_VALUES
    )
  }
  return buildIdentifiedMeterValue(
    chargingStation,
    { ...identity, snapshot: true },
    interval,
    measurandsKey,
    context
  ) as OCPP20MeterValue
}

const buildIdentifiedMeterValue = (
  chargingStation: ChargingStation,
  identity: ResolvedMeterValueIdentity,
  interval: number,
  measurandsKey?: ConfigurationKeyType,
  context?: MeterValueContext,
  debug = false
): MeterValue => {
  const {
    buildUnsignedVersionedSampledValue,
    buildVersionedSampledValue: buildSignedVersionedSampledValue,
    connectorId,
    evseId,
    signingConfig,
    signingState,
  } = createVersionedSampledValueDispatcher(chargingStation, identity, context)
  const snapshot = identity.snapshot === true
  // Coherent MeterValues strategy gate. Placed AFTER the versioned dispatcher
  // is available (so the coherent path can emit versioned SampledValues) and
  // BEFORE the random/fixed measurand generation runs. When coherent mode
  // is not active for this station or no session exists for the transaction,
  // this is a no-op and the random/fixed code path is unchanged.
  const coherentSession =
    identity.transactionId != null
      ? chargingStation.getCoherentSession(identity.transactionId)
      : undefined
  const registerValuesWithoutPhases = isOCPP20FlagEnabled(
    chargingStation,
    OCPP20ComponentName.SampledDataCtrlr,
    OCPP20OptionalVariableName.RegisterValuesWithoutPhases
  )
  const connectorStatus = chargingStation.getConnectorStatus(connectorId, evseId)
  if (isCoherentModeActive(coherentSession)) {
    const timestamp = new Date()
    if (signingConfig != null) signingConfig.timestamp = timestamp
    const enabledMeasurands = resolveEnabledMeasurands(chargingStation, measurandsKey)
    const coherentSnapshotEnergyRegister = Math.max(
      0,
      chargingStation.stationInfo?.meteringPerTransaction === true
        ? (connectorStatus?.transactionEnergyActiveImportRegisterValue ?? 0)
        : (connectorStatus?.energyActiveImportRegisterValue ?? 0)
    )
    const coherentMeterValue = snapshot
      ? buildCoherentMeterValueSnapshot(
        chargingStation,
        coherentSession,
        buildSignedVersionedSampledValue,
        context,
        enabledMeasurands,
        registerValuesWithoutPhases,
        timestamp,
        connectorStatus,
        evseId,
        coherentSnapshotEnergyRegister
      )
      : buildCoherentMeterValue(
        chargingStation,
        coherentSession,
        buildSignedVersionedSampledValue,
        {
          intervalMs: interval,
          nowMs: Date.now(),
          rootSeed: resolveRootSeed(chargingStation.stationInfo),
        },
        context,
        enabledMeasurands,
        registerValuesWithoutPhases,
        timestamp,
        connectorStatus,
        evseId
      )
    if (snapshot) {
      const coherentOcpp20MeterValue = coherentMeterValue as OCPP20MeterValue
      coherentOcpp20MeterValue.sampledValue = applyClockAlignedVoltageControls(
        chargingStation,
        coherentOcpp20MeterValue.sampledValue,
        buildSignedVersionedSampledValue,
        context
      )
    }
    // Only transactional builds may flip the one-time public-key flag. A
    // coherent session always carries a transactionId, but guard explicitly to
    // stay symmetric with the random/fixed path below and robust to any future
    // coherent-session model change.
    if (
      identity.transactionId != null &&
      signingState.publicKeyIncluded &&
      connectorStatus != null
    ) {
      connectorStatus.publicKeySentInTransaction = true
    }
    return coherentMeterValue
  }
  const buildVersionedSampledValue = snapshot
    ? buildUnsignedVersionedSampledValue
    : buildSignedVersionedSampledValue
  const meterValue: { sampledValue: SampledValue[]; timestamp: Date } = buildEmptyMeterValue()
  if (signingConfig != null) {
    signingConfig.timestamp = meterValue.timestamp
  }
  // SoC only has transaction semantics in the simulator. An idle connector
  // has no EV state to report.
  if (identity.transactionId != null) {
    const socMeasurand = buildSocMeasurandValue(
      chargingStation,
      connectorId,
      evseId,
      measurandsKey,
      snapshot
    )
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
        Constants.SOC_MAXIMUM_PERCENT,
        socSampledValue.measurand,
        debug
      )
    }
  }
  // Voltage measurand
  const voltageMeasurand = buildVoltageMeasurandValue(
    chargingStation,
    connectorId,
    evseId,
    measurandsKey,
    snapshot
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
        voltageMeasurand.value,
        evseId,
        snapshot
      )
      if (chargingStation.stationInfo?.phaseLineToLineVoltageMeterValues === true) {
        const nextPhase =
          (phase + 1) % chargingStation.getNumberOfPhases() !== 0
            ? ((phase + 1) % chargingStation.getNumberOfPhases()).toString()
            : chargingStation.getNumberOfPhases().toString()
        const lineToLineLabel = `L${phase.toString()}-L${nextPhase}` as MeterValuePhase
        // `V_LL = sqrt(3) * V_LN` in a balanced 3-phase Y system; the
        // sqrt(3) factor comes from the 30-degree phase separation, not
        // from the phase count itself. Emitting L-L values makes physical
        // sense only for `numberOfPhases === 3`; single-phase has no L-L
        // pair, and `numberOfPhases === 2` is unsupported by contract.
        const lineToLineNominalVoltage = roundTo(Math.sqrt(3) * chargingStation.getVoltageOut(), 2)
        addPhaseVoltageToMeterValue(
          chargingStation,
          connectorId,
          meterValue,
          voltageMeasurand,
          lineToLineLabel,
          lineToLineNominalVoltage,
          buildVersionedSampledValue,
          measurandsKey,
          context,
          undefined,
          evseId,
          snapshot
        )
      }
    }
  }
  // Power.Active.Import measurand
  const idle = identity.transactionId == null
  const powerMeasurand = buildPowerMeasurandValue(
    chargingStation,
    connectorId,
    evseId,
    measurandsKey,
    idle,
    snapshot
  )
  if (powerMeasurand?.values.allPhases != null) {
    const unitDivider =
      powerMeasurand.template.unit === MeterValueUnit.KILO_WATT ? Constants.UNIT_DIVIDER_KILO : 1
    const connectorMaximumAvailablePower = chargingStation.getConnectorMaximumAvailablePower(
      connectorId,
      evseId
    )
    const connectorMaximumPower = Math.round(connectorMaximumAvailablePower)
    const connectorMinimumPower = idle ? 0 : Math.round(powerMeasurand.template.minimumValue ?? 0)

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
    measurandsKey,
    idle,
    snapshot
  )
  if (currentMeasurand?.values.allPhases != null) {
    const connectorMaximumAvailablePower = chargingStation.getConnectorMaximumAvailablePower(
      connectorId,
      evseId
    )
    const connectorMaximumAmperage =
      chargingStation.stationInfo?.currentOutType === CurrentType.AC
        ? ACElectricUtils.amperagePerPhaseFromPower(
          chargingStation.getNumberOfPhases(),
          connectorMaximumAvailablePower,
          chargingStation.getVoltageOut()
        )
        : DCElectricUtils.amperage(connectorMaximumAvailablePower, chargingStation.getVoltageOut())
    const connectorMinimumAmperage = idle ? 0 : (currentMeasurand.template.minimumValue ?? 0)

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
    measurandsKey,
    snapshot
  )
  if (energyMeasurand != null) {
    // Reporting snapshots never evolve physical state.
    if (identity.transactionId != null && !snapshot) {
      updateConnectorEnergyValues(connectorStatus, energyMeasurand.value)
    }
    const unitDivider =
      energyMeasurand.template.unit === MeterValueUnit.KILO_WATT_HOUR
        ? Constants.UNIT_DIVIDER_KILO
        : 1
    const energySampledValue = buildVersionedSampledValue(
      energyMeasurand.template,
      roundTo(
        (snapshot
          ? Math.max(0, connectorStatus?.energyActiveImportRegisterValue ?? 0)
          : chargingStation.getEnergyActiveImportRegisterByConnectorId(
            connectorId,
            false,
            evseId
          )) / unitDivider,
        2
      ),
      context
    )
    meterValue.sampledValue.push(energySampledValue)
    const connectorMaximumAvailablePower = chargingStation.getConnectorMaximumAvailablePower(
      connectorId,
      evseId
    )
    const connectorMaximumEnergyRounded = roundTo(
      (connectorMaximumAvailablePower * interval) / Constants.MS_PER_HOUR,
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
  // Snapshot builds re-project the full configured template identity set
  // (location/unit/context/format families, fixed-value measurands,
  // RegisterValuesWithoutPhases) from the base samples above, which only serve
  // as the value source. The second pass is intentional (per-identity/phase
  // coherence), not redundant computation.
  if (snapshot) {
    meterValue.sampledValue = expandClockAlignedSnapshotSamples(
      chargingStation,
      connectorId,
      evseId,
      meterValue.sampledValue as OCPP20SampledValue[],
      buildSignedVersionedSampledValue,
      measurandsKey,
      context,
      registerValuesWithoutPhases,
      idle
    )
  }
  // Only transactional builds may flip the one-time public-key flag; an idle
  // clock-aligned tick must never suppress the key of the next transaction.
  if (identity.transactionId != null && signingState.publicKeyIncluded && connectorStatus != null) {
    connectorStatus.publicKeySentInTransaction = true
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
    logger.error(
      `${chargingStation.logPrefix()} ${moduleName}.checkMeasurandPowerDivider: ${errorMsg}`
    )
    throw new OCPPError(ErrorType.INTERNAL_ERROR, errorMsg, RequestCommand.METER_VALUES)
  } else if (chargingStation.powerDivider <= 0) {
    const errorMsg = `MeterValues measurand ${
      measurandType ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
    }: powerDivider has a value of zero or less ${chargingStation.powerDivider.toString()}`
    logger.error(
      `${chargingStation.logPrefix()} ${moduleName}.checkMeasurandPowerDivider: ${errorMsg}`
    )
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
  // Number.parseFloat preserved: NaN sentinel drives the POSITIVE_INFINITY fallback below;
  // convertToFloat throws on NaN and would break the fallback branch.
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
  return supportedMeasurands.includes(measurand)
}

/**
 * Retrieves the sampled value template matching the given measurand and phase from configuration.
 * @param chargingStation - Target charging station
 * @param connectorId - Connector ID to look up templates for
 * @param measurandsKey - Configuration key containing the list of sampled measurands
 * @param measurand - Meter value measurand to match
 * @param evseId - Optional EVSE ID for OCPP 2.0.1 template lookup
 * @param phase - Optional phase to match in the template
 * @param connectorLocalFallback - Use only the identified connector when EVSE templates are empty.
 * @returns Matching sampled value template, or undefined if not found
 */
export const getSampledValueTemplate = (
  chargingStation: ChargingStation,
  connectorId: number,
  measurandsKey: ConfigurationKeyType = StandardParametersKey.MeterValuesSampledData,
  measurand: MeterValueMeasurand = MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
  evseId?: number,
  phase?: MeterValuePhase,
  connectorLocalFallback = false
): SampledValueTemplate | undefined => {
  const onPhaseStr = phase != null ? `on phase ${phase} ` : ''
  if (!isMeasurandSupported(measurand)) {
    logger.warn(
      `${chargingStation.logPrefix()} ${moduleName}.getSampledValueTemplate: Trying to get unsupported MeterValues measurand '${measurand}' ${onPhaseStr}in template on connector id ${connectorId.toString()}`
    )
    return
  }
  if (
    measurand !== MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER &&
    getConfigurationKey(chargingStation, measurandsKey)?.value?.includes(measurand) === false
  ) {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.getSampledValueTemplate: Trying to get MeterValues measurand '${measurand}' ${onPhaseStr}in template on connector id ${connectorId.toString()} not found in sampled data OCPP parameter`
    )
    return
  }
  let sampledValueTemplates: SampledValueTemplate[] | undefined
  if (evseId != null) {
    const evseStatus = chargingStation.getEvseStatus(evseId)
    if (evseStatus != null) {
      if (isNotEmptyArray(evseStatus.MeterValues)) {
        sampledValueTemplates = evseStatus.MeterValues
      } else if (connectorLocalFallback) {
        sampledValueTemplates = chargingStation.getConnectorStatus(connectorId, evseId)?.MeterValues
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
        `${chargingStation.logPrefix()} ${moduleName}.getSampledValueTemplate: Unsupported MeterValues measurand '${measurand}' ${onPhaseStr}in template on connector id ${connectorId.toString()}`
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
    logger.error(
      `${chargingStation.logPrefix()} ${moduleName}.getSampledValueTemplate: ${errorMsg}`
    )
    throw new BaseError(errorMsg)
  }
  logger.debug(
    `${chargingStation.logPrefix()} ${moduleName}.getSampledValueTemplate: No MeterValues for measurand '${measurand}' ${onPhaseStr}in template on connector id ${connectorId.toString()}`
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
    sampledValueTemplate.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
  return {
    context: context ?? sampledValueTemplate.context ?? MeterValueContext.SAMPLE_PERIODIC,
    location: sampledValueTemplate.location ?? getMeasurandDefaultLocation(sampledValueMeasurand),
    measurand: sampledValueMeasurand,
    phase: phase ?? sampledValueTemplate.phase,
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
      `${chargingStation.logPrefix()} ${moduleName}.isConnectorIdValid: ${ocppCommand} incoming request received with invalid connector id ${connectorId.toString()}`
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
  logger.warn(
    `${chargingStation.logPrefix()} ${moduleName}.isIncomingRequestCommandSupported: Unknown incoming OCPP command '${command}'`
  )
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
  logger.warn(
    `${chargingStation.logPrefix()} ${moduleName}.isMessageTriggerSupported: Unknown incoming OCPP message trigger '${messageTrigger}'`
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
  logger.error(
    `${chargingStation.logPrefix()} ${moduleName}.isRequestCommandSupported: Unknown outgoing OCPP command '${command}'`
  )
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
function parseJsonSchemaFile<T extends JsonType> (
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
