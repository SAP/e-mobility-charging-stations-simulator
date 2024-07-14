import type { ChargingStationTemplate } from './ChargingStationTemplate.js'
import type { FirmwareStatus } from './ocpp/Requests.js'

export type ChargingStationInfo = Omit<
  ChargingStationTemplate,
  | 'Connectors'
  | 'Evses'
  | 'Configuration'
  | 'AutomaticTransactionGenerator'
  | 'numberOfConnectors'
  | 'power'
  | 'powerUnit'
  | 'chargeBoxSerialNumberPrefix'
  | 'chargePointSerialNumberPrefix'
  | 'meterSerialNumberPrefix'
> & {
  hashId: string
  templateIndex: number
  templateName: string
  /** @deprecated Use `hashId` instead. */
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
