import type { EmptyObject } from '../../EmptyObject.js'
import type { JsonObject } from '../../JsonType.js'
import type { RegistrationStatusEnumType } from '../Common.js'
import type {
  GenericStatusEnumType,
  InstallCertificateStatusEnumType,
  StatusInfoType,
} from './Common.js'
import type { OCPP20SetVariableResultType } from './Variables.js'

export interface OCPP20BootNotificationResponse extends JsonObject {
  currentTime: Date
  status: RegistrationStatusEnumType
  interval: number
  statusInfo?: StatusInfoType
}

export interface OCPP20HeartbeatResponse extends JsonObject {
  currentTime: Date
}

export interface OCPP20ClearCacheResponse extends JsonObject {
  status: GenericStatusEnumType
  statusInfo?: StatusInfoType
}

export type OCPP20StatusNotificationResponse = EmptyObject

export interface OCPP20SetVariablesResponse extends JsonObject {
  setVariableResult: OCPP20SetVariableResultType[]
}

export interface OCPP20InstallCertificateResponse extends JsonObject {
  status: InstallCertificateStatusEnumType
  statusInfo?: StatusInfoType
}
