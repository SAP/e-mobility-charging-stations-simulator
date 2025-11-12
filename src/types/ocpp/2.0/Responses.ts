import type { EmptyObject } from '../../EmptyObject.js'
import type { JsonObject } from '../../JsonType.js'
import type { RegistrationStatusEnumType } from '../Common.js'
import type {
  CustomDataType,
  GenericDeviceModelStatusEnumType,
  GenericStatusEnumType,
  InstallCertificateStatusEnumType,
  ResetStatusEnumType,
  StatusInfoType,
} from './Common.js'
import type { RequestStartStopStatusEnumType } from './Transaction.js'
import type { OCPP20GetVariableResultType, OCPP20SetVariableResultType } from './Variables.js'

export interface OCPP20BootNotificationResponse extends JsonObject {
  currentTime: Date
  customData?: CustomDataType
  interval: number
  status: RegistrationStatusEnumType
  statusInfo?: StatusInfoType
}

export interface OCPP20ClearCacheResponse extends JsonObject {
  customData?: CustomDataType
  status: GenericStatusEnumType
  statusInfo?: StatusInfoType
}

export interface OCPP20GetBaseReportResponse extends JsonObject {
  customData?: CustomDataType
  status: GenericDeviceModelStatusEnumType
  statusInfo?: StatusInfoType
}

export interface OCPP20GetVariablesResponse extends JsonObject {
  customData?: CustomDataType
  getVariableResult: OCPP20GetVariableResultType[]
}

export interface OCPP20HeartbeatResponse extends JsonObject {
  currentTime: Date
  customData?: CustomDataType
}

export interface OCPP20InstallCertificateResponse extends JsonObject {
  customData?: CustomDataType
  status: InstallCertificateStatusEnumType
  statusInfo?: StatusInfoType
}

export type OCPP20NotifyReportResponse = EmptyObject

export interface OCPP20RequestStartTransactionResponse extends JsonObject {
  customData?: CustomDataType
  status: RequestStartStopStatusEnumType
  statusInfo?: StatusInfoType
  transactionId?: `${string}-${string}-${string}-${string}-${string}`
}

export interface OCPP20RequestStopTransactionResponse extends JsonObject {
  customData?: CustomDataType
  status: RequestStartStopStatusEnumType
  statusInfo?: StatusInfoType
}

export interface OCPP20ResetResponse extends JsonObject {
  customData?: CustomDataType
  status: ResetStatusEnumType
  statusInfo?: StatusInfoType
}

export interface OCPP20SetVariablesResponse extends JsonObject {
  customData?: CustomDataType
  setVariableResult: OCPP20SetVariableResultType[]
}

export type OCPP20StatusNotificationResponse = EmptyObject
