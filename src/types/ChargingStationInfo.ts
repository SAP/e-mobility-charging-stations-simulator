import type { ChargingStationTemplate } from './ChargingStationTemplate.js'
import type { FirmwareStatus } from './ocpp/Requests.js'

export type ChargingStationInfo = Omit<
ChargingStationTemplate,
| 'AutomaticTransactionGenerator'
| 'Configuration'
| 'Connectors'
| 'Evses'
| 'power'
| 'powerUnit'
| 'chargeBoxSerialNumberPrefix'
| 'chargePointSerialNumberPrefix'
| 'meterSerialNumberPrefix'
> & {
  hashId: string
  /** @deprecated Use hashId instead */
  infoHash?: string
  chargingStationId?: string
  chargeBoxSerialNumber?: string
  chargePointSerialNumber?: string
  meterSerialNumber?: string
  maximumPower?: number // Always in Watt
  maximumAmperage?: number // Always in Ampere
  firmwareStatus?: FirmwareStatus
}

export interface ChargingStationInfoConfiguration {
  stationInfo?: ChargingStationInfo
}
