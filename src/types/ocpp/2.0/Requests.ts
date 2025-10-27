import type { EmptyObject } from '../../EmptyObject.js'
import type { JsonObject } from '../../JsonType.js'
import type {
  BootReasonEnumType,
  ChargingStationType,
  InstallCertificateUseEnumType,
  OCPP20ConnectorStatusEnumType,
  ReportBaseEnumType,
  ReportDataType,
  ResetEnumType,
} from './Common.js'
import type { OCPP20GetVariableDataType, OCPP20SetVariableDataType } from './Variables.js'

export enum OCPP20IncomingRequestCommand {
  CLEAR_CACHE = 'ClearCache',
  GET_BASE_REPORT = 'GetBaseReport',
  GET_VARIABLES = 'GetVariables',
  REQUEST_START_TRANSACTION = 'RequestStartTransaction',
  REQUEST_STOP_TRANSACTION = 'RequestStopTransaction',
  RESET = 'Reset',
  SET_VARIABLES = 'SetVariables',
}

export enum OCPP20RequestCommand {
  BOOT_NOTIFICATION = 'BootNotification',
  HEARTBEAT = 'Heartbeat',
  NOTIFY_REPORT = 'NotifyReport',
  STATUS_NOTIFICATION = 'StatusNotification',
}

export interface OCPP20BootNotificationRequest extends JsonObject {
  chargingStation: ChargingStationType
  reason: BootReasonEnumType
}

export type OCPP20ClearCacheRequest = EmptyObject

export interface OCPP20GetBaseReportRequest extends JsonObject {
  reportBase: ReportBaseEnumType
  requestId: number
}

export interface OCPP20GetVariablesRequest extends JsonObject {
  getVariableData: OCPP20GetVariableDataType[]
}

export type OCPP20HeartbeatRequest = EmptyObject

export interface OCPP20InstallCertificateRequest extends JsonObject {
  certificate: string
  certificateType: InstallCertificateUseEnumType
}

export interface OCPP20NotifyReportRequest extends JsonObject {
  generatedAt: Date
  reportData?: ReportDataType[]
  requestId: number
  seqNo: number
  tbc?: boolean
}

export interface OCPP20ResetRequest extends JsonObject {
  evseId?: number
  type: ResetEnumType
}

export interface OCPP20SetVariablesRequest extends JsonObject {
  setVariableData: OCPP20SetVariableDataType[]
}

export interface OCPP20StatusNotificationRequest extends JsonObject {
  connectorId: number
  connectorStatus: OCPP20ConnectorStatusEnumType
  evseId: number
  timestamp: Date
}
