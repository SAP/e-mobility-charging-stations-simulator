import type { EmptyObject } from '../../EmptyObject.js'
import type { JsonObject } from '../../JsonType.js'
import type {
  BootReasonEnumType,
  CertificateActionEnumType,
  CertificateHashDataType,
  CertificateSigningUseEnumType,
  ChargingStationType,
  CustomDataType,
  GetCertificateIdUseEnumType,
  InstallCertificateUseEnumType,
  OCSPRequestDataType,
  ReportBaseEnumType,
  ResetEnumType,
} from './Common.js'
import type {
  OCPP20ChargingProfileType,
  OCPP20ConnectorStatusEnumType,
  OCPP20IdTokenType,
} from './Transaction.js'
import type {
  OCPP20GetVariableDataType,
  OCPP20SetVariableDataType,
  ReportDataType,
} from './Variables.js'

export const enum OCPP20IncomingRequestCommand {
  CLEAR_CACHE = 'ClearCache',
  GET_BASE_REPORT = 'GetBaseReport',
  GET_VARIABLES = 'GetVariables',
  INSTALL_CERTIFICATE = 'InstallCertificate',
  REQUEST_START_TRANSACTION = 'RequestStartTransaction',
  REQUEST_STOP_TRANSACTION = 'RequestStopTransaction',
  RESET = 'Reset',
  SET_VARIABLES = 'SetVariables',
}

export const enum OCPP20RequestCommand {
  BOOT_NOTIFICATION = 'BootNotification',
  HEARTBEAT = 'Heartbeat',
  NOTIFY_REPORT = 'NotifyReport',
  STATUS_NOTIFICATION = 'StatusNotification',
  TRANSACTION_EVENT = 'TransactionEvent',
}

export interface OCPP20BootNotificationRequest extends JsonObject {
  chargingStation: ChargingStationType
  customData?: CustomDataType
  reason: BootReasonEnumType
}

export type OCPP20ClearCacheRequest = EmptyObject

export interface OCPP20GetBaseReportRequest extends JsonObject {
  customData?: CustomDataType
  reportBase: ReportBaseEnumType
  requestId: number
}

export interface OCPP20GetVariablesRequest extends JsonObject {
  customData?: CustomDataType
  getVariableData: OCPP20GetVariableDataType[]
}

export type OCPP20HeartbeatRequest = EmptyObject

export interface OCPP20InstallCertificateRequest extends JsonObject {
  certificate: string
  certificateType: InstallCertificateUseEnumType
  customData?: CustomDataType
}

export interface OCPP20NotifyReportRequest extends JsonObject {
  customData?: CustomDataType
  generatedAt: Date
  reportData?: ReportDataType[]
  requestId: number
  seqNo: number
  tbc?: boolean
}

export interface OCPP20RequestStartTransactionRequest extends JsonObject {
  chargingProfile?: OCPP20ChargingProfileType
  customData?: CustomDataType
  evseId?: number
  groupIdToken?: OCPP20IdTokenType
  idToken: OCPP20IdTokenType
  remoteStartId: number
}

export interface OCPP20RequestStopTransactionRequest extends JsonObject {
  customData?: CustomDataType
  transactionId: UUIDv4
}

export interface OCPP20ResetRequest extends JsonObject {
  customData?: CustomDataType
  evseId?: number
  type: ResetEnumType
}

export interface OCPP20SetVariablesRequest extends JsonObject {
  customData?: CustomDataType
  setVariableData: OCPP20SetVariableDataType[]
}

export interface OCPP20StatusNotificationRequest extends JsonObject {
  connectorId: number
  connectorStatus: OCPP20ConnectorStatusEnumType
  customData?: CustomDataType
  evseId: number
  timestamp: Date
}

export interface OCPP20CertificateSignedRequest extends JsonObject {
  certificateChain: string
  certificateType?: CertificateSigningUseEnumType
  customData?: CustomDataType
}

export interface OCPP20DeleteCertificateRequest extends JsonObject {
  certificateHashData: CertificateHashDataType
  customData?: CustomDataType
}

export interface OCPP20Get15118EVCertificateRequest extends JsonObject {
  action: CertificateActionEnumType
  customData?: CustomDataType
  exiRequest: string
  iso15118SchemaVersion: string
}

export interface OCPP20GetCertificateStatusRequest extends JsonObject {
  customData?: CustomDataType
  ocspRequestData: OCSPRequestDataType
}

export interface OCPP20GetInstalledCertificateIdsRequest extends JsonObject {
  certificateType?: GetCertificateIdUseEnumType[]
  customData?: CustomDataType
}

export interface OCPP20SignCertificateRequest extends JsonObject {
  certificateType?: CertificateSigningUseEnumType
  csr: string
  customData?: CustomDataType
}
