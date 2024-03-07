import type { EmptyObject } from '../../EmptyObject.js'
import type { JsonObject } from '../../JsonType.js'
import type {
  BootReasonEnumType,
  InstallCertificateUseEnumType,
  OCPP20ConnectorStatusEnumType
} from './Common.js'
import type { OCPP20SetVariableDataType } from './Variables.js'

export enum OCPP20RequestCommand {
  BOOT_NOTIFICATION = 'BootNotification',
  HEARTBEAT = 'Heartbeat',
  STATUS_NOTIFICATION = 'StatusNotification'
}

export enum OCPP20IncomingRequestCommand {
  CLEAR_CACHE = 'ClearCache',
  REQUEST_START_TRANSACTION = 'RequestStartTransaction',
  REQUEST_STOP_TRANSACTION = 'RequestStopTransaction'
}

interface ModemType extends JsonObject {
  iccid?: string
  imsi?: string
}

interface ChargingStationType extends JsonObject {
  serialNumber?: string
  model: string
  vendorName: string
  firmwareVersion?: string
  modem?: ModemType
}

export interface OCPP20BootNotificationRequest extends JsonObject {
  reason: BootReasonEnumType
  chargingStation: ChargingStationType
}

export type OCPP20HeartbeatRequest = EmptyObject

export type OCPP20ClearCacheRequest = EmptyObject

export interface OCPP20StatusNotificationRequest extends JsonObject {
  timestamp: Date
  connectorStatus: OCPP20ConnectorStatusEnumType
  evseId: number
  connectorId: number
}

export interface OCPP20SetVariablesRequest extends JsonObject {
  setVariableData: OCPP20SetVariableDataType[]
}

export interface OCPP20InstallCertificateRequest extends JsonObject {
  certificateType: InstallCertificateUseEnumType
  certificate: string
}
