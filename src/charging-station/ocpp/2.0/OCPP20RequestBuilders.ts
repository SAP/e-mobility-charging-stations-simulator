import {
  BootReasonEnumType,
  type ChargingStationInfo,
  type OCPP20BootNotificationRequest,
} from '../../../types/index.js'

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
