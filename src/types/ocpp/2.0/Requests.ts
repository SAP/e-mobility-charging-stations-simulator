import type { EmptyObject } from '../../EmptyObject.js'
import type { JsonObject } from '../../JsonType.js'
import type {
  BootReasonEnumType,
  InstallCertificateUseEnumType,
  OCPP20ConnectorStatusEnumType,
} from './Common.js'
import type { OCPP20SetVariableDataType } from './Variables.js'

export enum OCPP20RequestCommand {
  BOOT_NOTIFICATION = 'BootNotification',
  HEARTBEAT = 'Heartbeat',
  STATUS_NOTIFICATION = 'StatusNotification',
}

export enum OCPP20IncomingRequestCommand {
  CLEAR_CACHE = 'ClearCache',
  REQUEST_START_TRANSACTION = 'RequestStartTransaction',
  REQUEST_STOP_TRANSACTION = 'RequestStopTransaction',
}

interface ModemType extends JsonObject {
  iccid?: string
  imsi?: string
}

interface ChargingStationType extends JsonObject {
  firmwareVersion?: string
  model: string
  modem?: ModemType
  serialNumber?: string
  vendorName: string
}

export interface OCPP20BootNotificationRequest extends JsonObject {
  chargingStation: ChargingStationType
  reason: BootReasonEnumType
}

export type OCPP20HeartbeatRequest = EmptyObject

export type OCPP20ClearCacheRequest = EmptyObject

export interface OCPP20StatusNotificationRequest extends JsonObject {
  connectorId: number
  connectorStatus: OCPP20ConnectorStatusEnumType
  evseId: number
  timestamp: Date
}

export interface OCPP20SetVariablesRequest extends JsonObject {
  setVariableData: OCPP20SetVariableDataType[]
}

export interface OCPP20InstallCertificateRequest extends JsonObject {
  certificate: string
  certificateType: InstallCertificateUseEnumType
}
