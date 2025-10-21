import type { EmptyObject } from '../../EmptyObject.js'
import type { JsonObject } from '../../JsonType.js'
import type {
  BootReasonEnumType,
  InstallCertificateUseEnumType,
  OCPP20ConnectorStatusEnumType,
  ReportBaseEnumType,
} from './Common.js'
import type {
  ChargingStationType,
  ComponentType,
  OCPP20SetVariableDataType,
  VariableType,
} from './Variables.js'

export enum OCPP20IncomingRequestCommand {
  CLEAR_CACHE = 'ClearCache',
  GET_BASE_REPORT = 'GetBaseReport',
  REQUEST_START_TRANSACTION = 'RequestStartTransaction',
  REQUEST_STOP_TRANSACTION = 'RequestStopTransaction',
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

export interface OCPP20SetVariablesRequest extends JsonObject {
  setVariableData: OCPP20SetVariableDataType[]
}

export interface OCPP20StatusNotificationRequest extends JsonObject {
  connectorId: number
  connectorStatus: OCPP20ConnectorStatusEnumType
  evseId: number
  timestamp: Date
}

export interface ReportDataType extends JsonObject {
  component: ComponentType
  variable: VariableType
  variableAttribute?: VariableAttributeType[]
  variableCharacteristics?: VariableCharacteristicsType
}

export interface VariableAttributeType extends JsonObject {
  type?: string
  value?: string
}

export interface VariableCharacteristicsType extends JsonObject {
  dataType: string
  supportsMonitoring: boolean
}
