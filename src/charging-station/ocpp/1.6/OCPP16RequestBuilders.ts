import type { ChargingStationInfo, OCPP16BootNotificationRequest } from '../../../types/index.js'

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
