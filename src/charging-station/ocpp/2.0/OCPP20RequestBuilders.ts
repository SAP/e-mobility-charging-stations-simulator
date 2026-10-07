import type { StopTransactionReason } from '../../../types/index.js'

import { BaseError } from '../../../exception/index.js'
import {
  BootReasonEnumType,
  type ChargingStationInfo,
  type MeterValueContext,
  type MeterValuePhase,
  MeterValueUnit,
  OCPP16StopTransactionReason,
  type OCPP20BootNotificationRequest,
  OCPP20LocationEnumType,
  OCPP20MeasurandEnumType,
  OCPP20PhaseEnumType,
  OCPP20ReadingContextEnumType,
  OCPP20ReasonEnumType,
  type OCPP20SampledValue,
  OCPP20TriggerReasonEnumType,
  type SampledValueTemplate,
} from '../../../types/index.js'
import { convertToFloat, getEnumStringValue } from '../../../utils/index.js'
import {
  areMeterValueUnitsCompatible,
  getMeterValueUnitFamily,
  resolveMeterValueUnitScale,
} from '../../meter-values/index.js'
import { resolveSampledValueFields } from '../OCPPServiceUtils.js'
import {
  generateSignedMeterData,
  type SignedMeterDataParams,
} from '../OCPPSignedMeterDataGenerator.js'
import {
  type SampledValueSigningConfig,
  shouldIncludePublicKey,
  type SignedSampledValueResult,
} from '../OCPPSignedMeterValueUtils.js'

const requireOCPP20EnumValue = <T extends string>(
  enumObject: Readonly<Record<string, T>>,
  value: string | undefined,
  fieldName: string
): T | undefined => {
  if (value == null) return undefined
  const resolvedValue = getEnumStringValue(enumObject, value)
  if (resolvedValue == null) {
    throw new BaseError(`Invalid OCPP 2.0.x sampled value ${fieldName} '${value}'`)
  }
  return resolvedValue
}

export const buildOCPP20BootNotificationRequest = (
  stationInfo: ChargingStationInfo,
  bootReason: BootReasonEnumType = BootReasonEnumType.PowerUp
): OCPP20BootNotificationRequest => ({
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
  reason: bootReason,
})

/**
 * Builds an OCPP 2.0.1 sampled value from a template and measurement data.
 * @param sampledValueTemplate - The sampled value template to use.
 * @param value - The measured value expressed in the template's flat/default unit.
 * @param context - The reading context.
 * @param phase - The phase of the measurement.
 * @param signingConfig - Optional signing configuration for generating signedMeterValue.
 * @returns The built OCPP 2.0.1 sampled value with signing metadata.
 */
export function buildOCPP20SampledValue (
  sampledValueTemplate: SampledValueTemplate,
  value: number,
  context?: MeterValueContext,
  phase?: MeterValuePhase,
  signingConfig?: SampledValueSigningConfig
): SignedSampledValueResult<OCPP20SampledValue> {
  const fields = resolveSampledValueFields(sampledValueTemplate, value, context, phase)
  const resolvedContext = requireOCPP20EnumValue(
    OCPP20ReadingContextEnumType,
    fields.context,
    'context'
  )
  const resolvedLocation = requireOCPP20EnumValue(
    OCPP20LocationEnumType,
    fields.location,
    'location'
  )
  const resolvedMeasurand = requireOCPP20EnumValue(
    OCPP20MeasurandEnumType,
    fields.measurand,
    'measurand'
  )
  const resolvedPhase = requireOCPP20EnumValue(OCPP20PhaseEnumType, fields.phase, 'phase')
  const sourceUnit = fields.unit
  const emittedUnit = sampledValueTemplate.unitOfMeasure?.unit ?? sourceUnit
  if (
    sourceUnit != null &&
    emittedUnit != null &&
    sourceUnit !== emittedUnit &&
    !areMeterValueUnitsCompatible(fields.measurand, sourceUnit, emittedUnit)
  ) {
    throw new BaseError(
      `Cannot convert OCPP 2.0.x sampled value unit '${sourceUnit}' to '${emittedUnit}'`
    )
  }
  const unitOfMeasure =
    sampledValueTemplate.unitOfMeasure != null || sourceUnit != null
      ? {
          ...sampledValueTemplate.unitOfMeasure,
          ...(sampledValueTemplate.unitOfMeasure?.unit == null &&
            sourceUnit != null && { unit: sourceUnit }),
        }
      : undefined
  const emittedScale = resolveMeterValueUnitScale(
    fields.measurand,
    emittedUnit,
    unitOfMeasure?.multiplier
  )
  const emittedValue =
    (convertToFloat(fields.value) * resolveMeterValueUnitScale(fields.measurand, sourceUnit)) /
    emittedScale
  const sampledValue: OCPP20SampledValue = {
    ...(sampledValueTemplate.customData != null && {
      customData: sampledValueTemplate.customData,
    }),
    ...(resolvedContext != null && { context: resolvedContext }),
    ...(resolvedLocation != null && { location: resolvedLocation }),
    ...(resolvedMeasurand != null && { measurand: resolvedMeasurand }),
    ...(unitOfMeasure != null && { unitOfMeasure }),
    value: emittedValue,
    ...(resolvedPhase != null && { phase: resolvedPhase }),
  }

  let publicKeyIncluded = false

  if (
    signingConfig?.enabled === true &&
    fields.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
  ) {
    const includePublicKey = shouldIncludePublicKey(
      signingConfig.publicKeyWithSignedMeterValue,
      signingConfig.publicKeySentInTransaction
    )
    const unitFamily = getMeterValueUnitFamily(fields.measurand, emittedUnit)
    const signedMeterDataParams: SignedMeterDataParams = {
      context: fields.context,
      meterSerialNumber: signingConfig.meterSerialNumber,
      meterValue: emittedValue * emittedScale,
      meterValueUnit: getEnumStringValue(MeterValueUnit, unitFamily?.baseUnit ?? emittedUnit),
      timestamp: signingConfig.timestamp ?? new Date(),
      transactionId: signingConfig.transactionId,
    }
    sampledValue.signedMeterValue = {
      ...generateSignedMeterData(
        signedMeterDataParams,
        includePublicKey ? signingConfig.publicKeyHex : undefined,
        signingConfig.signingMethod
      ),
    }
    publicKeyIncluded = includePublicKey && signingConfig.publicKeyHex != null
  }

  return { publicKeyIncluded, sampledValue }
}

export const mapStopReasonToOCPP20 = (
  reason?: StopTransactionReason
): {
  stoppedReason: OCPP20ReasonEnumType
  triggerReason: OCPP20TriggerReasonEnumType
} => {
  switch (reason) {
    case OCPP16StopTransactionReason.DE_AUTHORIZED:
    case OCPP20ReasonEnumType.DeAuthorized:
      return {
        stoppedReason: OCPP20ReasonEnumType.DeAuthorized,
        triggerReason: OCPP20TriggerReasonEnumType.Deauthorized,
      }
    case OCPP16StopTransactionReason.EMERGENCY_STOP:
    case OCPP20ReasonEnumType.EmergencyStop:
      return {
        stoppedReason: OCPP20ReasonEnumType.EmergencyStop,
        triggerReason: OCPP20TriggerReasonEnumType.AbnormalCondition,
      }
    case OCPP16StopTransactionReason.EV_DISCONNECTED:
    case OCPP20ReasonEnumType.EVDisconnected:
      return {
        stoppedReason: OCPP20ReasonEnumType.EVDisconnected,
        triggerReason: OCPP20TriggerReasonEnumType.EVDeparted,
      }
    case OCPP16StopTransactionReason.HARD_RESET:
    case OCPP16StopTransactionReason.REBOOT:
    case OCPP16StopTransactionReason.SOFT_RESET:
    case OCPP20ReasonEnumType.ImmediateReset:
    case OCPP20ReasonEnumType.Reboot:
      return {
        stoppedReason: OCPP20ReasonEnumType.ImmediateReset,
        triggerReason: OCPP20TriggerReasonEnumType.ResetCommand,
      }
    case OCPP16StopTransactionReason.OTHER:
    case OCPP20ReasonEnumType.Other:
      return {
        stoppedReason: OCPP20ReasonEnumType.Other,
        triggerReason: OCPP20TriggerReasonEnumType.AbnormalCondition,
      }
    case OCPP16StopTransactionReason.POWER_LOSS:
    case OCPP20ReasonEnumType.PowerLoss:
      return {
        stoppedReason: OCPP20ReasonEnumType.PowerLoss,
        triggerReason: OCPP20TriggerReasonEnumType.AbnormalCondition,
      }
    case OCPP16StopTransactionReason.REMOTE:
    case OCPP20ReasonEnumType.Remote:
      return {
        stoppedReason: OCPP20ReasonEnumType.Remote,
        triggerReason: OCPP20TriggerReasonEnumType.RemoteStop,
      }
    case OCPP20ReasonEnumType.TimeLimitReached:
      return {
        stoppedReason: OCPP20ReasonEnumType.TimeLimitReached,
        triggerReason: OCPP20TriggerReasonEnumType.TimeLimitReached,
      }
    case OCPP16StopTransactionReason.LOCAL:
    case OCPP20ReasonEnumType.Local:
    case undefined:
    default:
      return {
        stoppedReason: OCPP20ReasonEnumType.Local,
        triggerReason: OCPP20TriggerReasonEnumType.StopAuthorized,
      }
  }
}
