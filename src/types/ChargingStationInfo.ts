import type { ChargingStationTemplate } from './ChargingStationTemplate.js'
import type { FirmwareStatus } from './ocpp/Requests.js'

export type ChargingStationInfo = Omit<
  ChargingStationTemplate,
  | 'AutomaticTransactionGenerator'
  | 'chargeBoxSerialNumberPrefix'
  | 'chargePointSerialNumberPrefix'
  | 'Configuration'
  | 'Connectors'
  | 'Evses'
  | 'meterSerialNumberPrefix'
  | 'numberOfConnectors'
  | 'power'
  | 'powerUnit'
> & {
  chargeBoxSerialNumber?: string
  chargePointSerialNumber?: string
  chargingStationId?: string
  firmwareStatus?: FirmwareStatus
  hashId: string
  /** @deprecated Use `hashId` instead. */
  infoHash?: string
  maximumAmperage?: number // Always in Ampere
  maximumPower?: number // Always in Watt
  meterSerialNumber?: string
  templateIndex: number
  templateName: string
}

export interface ChargingStationInfoConfiguration {
  stationInfo?: ChargingStationInfo
}
