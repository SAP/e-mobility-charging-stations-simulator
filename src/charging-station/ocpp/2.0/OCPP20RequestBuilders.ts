import type { StopTransactionReason } from '../../../types/index.js'

import {
  BootReasonEnumType,
  type ChargingStationInfo,
  type MeterValueContext,
  type MeterValuePhase,
  OCPP16StopTransactionReason,
  type OCPP20BootNotificationRequest,
  OCPP20MeasurandEnumType,
  OCPP20ReasonEnumType,
  type OCPP20SampledValue,
  OCPP20TriggerReasonEnumType,
  type PublicKeyWithSignedMeterValueEnumType,
  type SampledValueTemplate,
} from '../../../types/index.js'
import { resolveSampledValueFields } from '../OCPPServiceUtils.js'
import { generateSignedMeterData, type SignedMeterDataParams } from '../SignedMeterDataGenerator.js'
import { shouldIncludePublicKey } from '../SignedMeterValueUtils.js'

export interface OCPP20SampledValueSigningConfig {
  enabled: boolean
  meterSerialNumber: string
  publicKeyHex?: string
  publicKeySentInTransaction: boolean
  publicKeyWithSignedMeterValue: PublicKeyWithSignedMeterValueEnumType
  timestamp?: Date
  transactionId: number | string
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

export interface OCPP20SampledValueSigningResult {
  publicKeyIncluded: boolean
  sampledValue: OCPP20SampledValue
}

/**
 * Builds an OCPP 2.0 sampled value from a template and measurement data.
 * @param sampledValueTemplate - The sampled value template to use.
 * @param value - The measured value.
 * @param context - The reading context.
 * @param phase - The phase of the measurement.
 * @param signingConfig - Optional signing configuration for generating signedMeterValue.
 * @returns The built OCPP 2.0 sampled value with signing metadata.
 */
export function buildOCPP20SampledValue (
  sampledValueTemplate: SampledValueTemplate,
  value: number,
  context?: MeterValueContext,
  phase?: MeterValuePhase,
  signingConfig?: OCPP20SampledValueSigningConfig
): OCPP20SampledValueSigningResult {
  const fields = resolveSampledValueFields(sampledValueTemplate, value, context, phase)
  const sampledValue: OCPP20SampledValue = {
    context: fields.context,
    location: fields.location,
    measurand: fields.measurand,
    ...(fields.unit != null && { unitOfMeasure: { unit: fields.unit } }),
    value: fields.value,
    ...(fields.phase != null && { phase: fields.phase }),
  } as OCPP20SampledValue

  let publicKeyIncluded = false

  if (
    signingConfig?.enabled === true &&
    fields.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
  ) {
    const includePublicKey = shouldIncludePublicKey(
      signingConfig.publicKeyWithSignedMeterValue,
      signingConfig.publicKeySentInTransaction
    )
    const signedMeterDataParams: SignedMeterDataParams = {
      context: fields.context,
      meterSerialNumber: signingConfig.meterSerialNumber,
      meterValue: fields.value,
      meterValueUnit: fields.unit,
      timestamp: signingConfig.timestamp ?? new Date(),
      transactionId: signingConfig.transactionId,
    }
    sampledValue.signedMeterValue = {
      ...generateSignedMeterData(
        signedMeterDataParams,
        includePublicKey ? signingConfig.publicKeyHex : undefined
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
