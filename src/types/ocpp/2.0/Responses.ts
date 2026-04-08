import type { EmptyObject } from '../../EmptyObject.js'
import type { JsonObject, JsonType } from '../../JsonType.js'
import type { UUIDv4 } from '../../UUID.js'
import type { RegistrationStatusEnumType } from '../Common.js'
import type {
  CertificateHashDataChainType,
  CertificateSignedStatusEnumType,
  ChangeAvailabilityStatusEnumType,
  CustomDataType,
  CustomerInformationStatusEnumType,
  DataTransferStatusEnumType,
  DeleteCertificateStatusEnumType,
  GenericDeviceModelStatusEnumType,
  GenericStatusEnumType,
  GetCertificateStatusEnumType,
  GetInstalledCertificateStatusEnumType,
  InstallCertificateStatusEnumType,
  Iso15118EVCertificateStatusEnumType,
  LogStatusEnumType,
  ResetStatusEnumType,
  SetNetworkProfileStatusEnumType,
  StatusInfoType,
  TriggerMessageStatusEnumType,
  UnlockStatusEnumType,
  UpdateFirmwareStatusEnumType,
} from './Common.js'
import type { OCPP20IdTokenInfoType, RequestStartStopStatusEnumType } from './Transaction.js'
import type { OCPP20GetVariableResultType, OCPP20SetVariableResultType } from './Variables.js'

export enum OCPP20SendLocalListStatusEnumType {
  Accepted = 'Accepted',
  Failed = 'Failed',
  VersionMismatch = 'VersionMismatch',
}

export interface OCPP20AuthorizeResponse extends JsonObject {
  customData?: CustomDataType
  idTokenInfo: OCPP20IdTokenInfoType
}

export interface OCPP20BootNotificationResponse extends JsonObject {
  currentTime: Date
  customData?: CustomDataType
  interval: number
  status: RegistrationStatusEnumType
  statusInfo?: StatusInfoType
}

export interface OCPP20CertificateSignedResponse extends JsonObject {
  customData?: CustomDataType
  status: CertificateSignedStatusEnumType
  statusInfo?: StatusInfoType
}

export interface OCPP20ChangeAvailabilityResponse extends JsonObject {
  customData?: CustomDataType
  status: ChangeAvailabilityStatusEnumType
  statusInfo?: StatusInfoType
}

export interface OCPP20ClearCacheResponse extends JsonObject {
  customData?: CustomDataType
  status: GenericStatusEnumType
  statusInfo?: StatusInfoType
}

export interface OCPP20CustomerInformationResponse extends JsonObject {
  customData?: CustomDataType
  status: CustomerInformationStatusEnumType
  statusInfo?: StatusInfoType
}

export interface OCPP20DataTransferResponse extends JsonObject {
  customData?: CustomDataType
  data?: JsonType
  status: DataTransferStatusEnumType
  statusInfo?: StatusInfoType
}

export interface OCPP20DeleteCertificateResponse extends JsonObject {
  customData?: CustomDataType
  status: DeleteCertificateStatusEnumType
  statusInfo?: StatusInfoType
}

export type OCPP20FirmwareStatusNotificationResponse = EmptyObject

export interface OCPP20Get15118EVCertificateResponse extends JsonObject {
  customData?: CustomDataType
  exiResponse: string
  status: Iso15118EVCertificateStatusEnumType
  statusInfo?: StatusInfoType
}

export interface OCPP20GetBaseReportResponse extends JsonObject {
  customData?: CustomDataType
  status: GenericDeviceModelStatusEnumType
  statusInfo?: StatusInfoType
}

export interface OCPP20GetCertificateStatusResponse extends JsonObject {
  customData?: CustomDataType
  ocspResult?: string
  status: GetCertificateStatusEnumType
  statusInfo?: StatusInfoType
}

export interface OCPP20GetInstalledCertificateIdsResponse extends JsonObject {
  certificateHashDataChain?: CertificateHashDataChainType[]
  customData?: CustomDataType
  status: GetInstalledCertificateStatusEnumType
  statusInfo?: StatusInfoType
}

export interface OCPP20GetLocalListVersionResponse extends JsonObject {
  customData?: CustomDataType
  versionNumber: number
}

export interface OCPP20GetLogResponse extends JsonObject {
  customData?: CustomDataType
  filename?: string
  status: LogStatusEnumType
  statusInfo?: StatusInfoType
}

export interface OCPP20GetTransactionStatusResponse extends JsonObject {
  customData?: CustomDataType
  messagesInQueue: boolean
  ongoingIndicator?: boolean
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

export type OCPP20LogStatusNotificationResponse = EmptyObject

export type OCPP20NotifyCustomerInformationResponse = EmptyObject

export type OCPP20NotifyReportResponse = EmptyObject

export interface OCPP20RequestStartTransactionResponse extends JsonObject {
  customData?: CustomDataType
  status: RequestStartStopStatusEnumType
  statusInfo?: StatusInfoType
  transactionId?: UUIDv4
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

export type OCPP20SecurityEventNotificationResponse = EmptyObject

export interface OCPP20SendLocalListResponse extends JsonObject {
  customData?: CustomDataType
  status: OCPP20SendLocalListStatusEnumType
  statusInfo?: StatusInfoType
}

export interface OCPP20SetNetworkProfileResponse extends JsonObject {
  customData?: CustomDataType
  status: SetNetworkProfileStatusEnumType
  statusInfo?: StatusInfoType
}

export type { OCPP20TransactionEventResponse } from './Transaction.js'

export interface OCPP20SetVariablesResponse extends JsonObject {
  customData?: CustomDataType
  setVariableResult: OCPP20SetVariableResultType[]
}

export interface OCPP20SignCertificateResponse extends JsonObject {
  customData?: CustomDataType
  status: GenericStatusEnumType
  statusInfo?: StatusInfoType
}

export type OCPP20StatusNotificationResponse = EmptyObject

export interface OCPP20TriggerMessageResponse extends JsonObject {
  customData?: CustomDataType
  status: TriggerMessageStatusEnumType
  statusInfo?: StatusInfoType
}

export interface OCPP20UnlockConnectorResponse extends JsonObject {
  customData?: CustomDataType
  status: UnlockStatusEnumType
  statusInfo?: StatusInfoType
}

export interface OCPP20UpdateFirmwareResponse extends JsonObject {
  customData?: CustomDataType
  status: UpdateFirmwareStatusEnumType
  statusInfo?: StatusInfoType
}
