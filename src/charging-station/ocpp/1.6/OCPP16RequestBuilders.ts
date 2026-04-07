import {
  type ChargingStationInfo,
  type MeterValueContext,
  type MeterValuePhase,
  type OCPP16BootNotificationRequest,
  type OCPP16MeterValueContext,
  OCPP16MeterValueFormat,
  OCPP16MeterValueLocation,
  OCPP16MeterValueMeasurand,
  type OCPP16SampledValue,
  type OCPP16SignedMeterValue,
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

/**
 * Builds a signed OCPP 1.6 sampled value from a SignedMeterValue payload.
 * Per OCA Application Note v1.0 section 3.2.1, the value field contains
 * the JSON-serialized SignedMeterValueType.
 * @param context - The reading context for the signed value
 * @param signedData - The signed meter value data
 * @returns Signed OCPP 1.6 sampled value with format=SignedData
 */
export const buildSignedOCPP16SampledValue = (
  context: OCPP16MeterValueContext,
  signedData: OCPP16SignedMeterValue
): OCPP16SampledValue => ({
  context,
  format: OCPP16MeterValueFormat.SIGNED_DATA,
  location: OCPP16MeterValueLocation.OUTLET,
  measurand: OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
  value: JSON.stringify(signedData),
})
