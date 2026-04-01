import {
  type ChargingStationInfo,
  type MeterValueContext,
  type MeterValuePhase,
  type OCPP16BootNotificationRequest,
  type OCPP16SampledValue,
  type SampledValueTemplate,
} from '../../../types/index.js'
import { resolveSampledValueFields } from '../OCPPServiceUtils.js'

export const buildOCPP16BootNotificationRequest = (
  stationInfo: ChargingStationInfo
): OCPP16BootNotificationRequest => ({
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
})

/**
 * Builds an OCPP 1.6 sampled value from a template and measurement data.
 * @param sampledValueTemplate - The sampled value template to use.
 * @param value - The measured value.
 * @param context - The reading context.
 * @param phase - The phase of the measurement.
 * @returns The built OCPP 1.6 sampled value.
 */
export function buildOCPP16SampledValue (
  sampledValueTemplate: SampledValueTemplate,
  value: number,
  context?: MeterValueContext,
  phase?: MeterValuePhase
): OCPP16SampledValue {
  const fields = resolveSampledValueFields(sampledValueTemplate, value, context, phase)
  return {
    context: fields.context,
    location: fields.location,
    measurand: fields.measurand,
    ...(fields.unit != null && { unit: fields.unit }),
    value: fields.value.toString(),
    ...(fields.phase != null && { phase: fields.phase }),
  } as OCPP16SampledValue
}
