import type { EmptyObject } from '../../EmptyObject.js'
import type { JsonObject } from '../../JsonType.js'
import type {
  BootReasonEnumType,
  InstallCertificateUseEnumType,
  OCPP20ConnectorStatusEnumType,
  ReportBaseEnumType,
} from './Common.js'
import type { OCPP20SetVariableDataType } from './Variables.js'

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

export interface OCPP20NotifyReportRequest extends JsonObject {
  generatedAt: Date
  requestId: number
  reportData?: ReportDataType[]
  seqNo: number
  tbc?: boolean
}

export interface OCPP20InstallCertificateRequest extends JsonObject {
  certificate: string
  certificateType: InstallCertificateUseEnumType
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

interface ChargingStationType extends JsonObject {
  firmwareVersion?: string
  model: string
  modem?: ModemType
  serialNumber?: string
  vendorName: string
}

interface ModemType extends JsonObject {
  iccid?: string
  imsi?: string
}

interface ReportDataType extends JsonObject {
  component: ComponentType
  variable: VariableType
  variableAttribute?: VariableAttributeType[]
  variableCharacteristics?: VariableCharacteristicsType
}

interface ComponentType extends JsonObject {
  evse?: EVSEType
  instance?: string
  name: string
}

interface VariableType extends JsonObject {
  instance?: string
  name: string
}

interface VariableAttributeType extends JsonObject {
  type?: string
  value?: string
}

interface VariableCharacteristicsType extends JsonObject {
  dataType: string
  supportsMonitoring: boolean
}

interface EVSEType extends JsonObject {
  connectorId?: number
  id: number
}
