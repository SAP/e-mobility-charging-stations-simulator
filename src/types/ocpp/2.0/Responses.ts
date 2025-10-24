import type { EmptyObject } from '../../EmptyObject.js'
import type { JsonObject } from '../../JsonType.js'
import type { RegistrationStatusEnumType } from '../Common.js'
import type {
  GenericDeviceModelStatusEnumType,
  GenericStatusEnumType,
  InstallCertificateStatusEnumType,
  ResetStatusEnumType,
  StatusInfoType,
} from './Common.js'
import type { OCPP20GetVariableResultType, OCPP20SetVariableResultType } from './Variables.js'

export interface OCPP20BootNotificationResponse extends JsonObject {
  currentTime: Date
  interval: number
  status: RegistrationStatusEnumType
  statusInfo?: StatusInfoType
}

export interface OCPP20ClearCacheResponse extends JsonObject {
  status: GenericStatusEnumType
  statusInfo?: StatusInfoType
}

export interface OCPP20GetBaseReportResponse extends JsonObject {
  status: GenericDeviceModelStatusEnumType
  statusInfo?: StatusInfoType
}

export interface OCPP20GetVariablesResponse extends JsonObject {
  getVariableResult: OCPP20GetVariableResultType[]
}

export interface OCPP20HeartbeatResponse extends JsonObject {
  currentTime: Date
}

export interface OCPP20InstallCertificateResponse extends JsonObject {
  status: InstallCertificateStatusEnumType
  statusInfo?: StatusInfoType
}

export type OCPP20NotifyReportResponse = EmptyObject

export interface OCPP20ResetResponse extends JsonObject {
  status: ResetStatusEnumType
  statusInfo?: StatusInfoType
}

export interface OCPP20SetVariablesResponse extends JsonObject {
  setVariableResult: OCPP20SetVariableResultType[]
}

export type OCPP20StatusNotificationResponse = EmptyObject
