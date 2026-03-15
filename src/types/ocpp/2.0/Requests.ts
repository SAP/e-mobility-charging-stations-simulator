import type { EmptyObject } from '../../EmptyObject.js'
import type { JsonObject, JsonType } from '../../JsonType.js'
import type { UUIDv4 } from '../../UUID.js'
import type {
  BootReasonEnumType,
  CertificateActionEnumType,
  CertificateHashDataType,
  CertificateSigningUseEnumType,
  ChargingStationType,
  CustomDataType,
  FirmwareStatusEnumType,
  FirmwareType,
  GetCertificateIdUseEnumType,
  InstallCertificateUseEnumType,
  LogEnumType,
  LogParametersType,
  MessageTriggerEnumType,
  NetworkConnectionProfileType,
  OCSPRequestDataType,
  OperationalStatusEnumType,
  ReportBaseEnumType,
  ResetEnumType,
  UploadLogStatusEnumType,
} from './Common.js'
import type {
  OCPP20ChargingProfileType,
  OCPP20ConnectorStatusEnumType,
  OCPP20EVSEType,
  OCPP20IdTokenType,
} from './Transaction.js'
import type {
  OCPP20GetVariableDataType,
  OCPP20SetVariableDataType,
  ReportDataType,
} from './Variables.js'

export enum OCPP20IncomingRequestCommand {
  CERTIFICATE_SIGNED = 'CertificateSigned',
  CHANGE_AVAILABILITY = 'ChangeAvailability',
  CLEAR_CACHE = 'ClearCache',
  CUSTOMER_INFORMATION = 'CustomerInformation',
  DATA_TRANSFER = 'DataTransfer',
  DELETE_CERTIFICATE = 'DeleteCertificate',
  GET_BASE_REPORT = 'GetBaseReport',
  GET_INSTALLED_CERTIFICATE_IDS = 'GetInstalledCertificateIds',
  GET_LOG = 'GetLog',
  GET_TRANSACTION_STATUS = 'GetTransactionStatus',
  GET_VARIABLES = 'GetVariables',
  INSTALL_CERTIFICATE = 'InstallCertificate',
  REQUEST_START_TRANSACTION = 'RequestStartTransaction',
  REQUEST_STOP_TRANSACTION = 'RequestStopTransaction',
  RESET = 'Reset',
  SET_NETWORK_PROFILE = 'SetNetworkProfile',
  SET_VARIABLES = 'SetVariables',
  TRIGGER_MESSAGE = 'TriggerMessage',
  UNLOCK_CONNECTOR = 'UnlockConnector',
  UPDATE_FIRMWARE = 'UpdateFirmware',
}

export enum OCPP20RequestCommand {
  BOOT_NOTIFICATION = 'BootNotification',
  FIRMWARE_STATUS_NOTIFICATION = 'FirmwareStatusNotification',
  GET_15118_EV_CERTIFICATE = 'Get15118EVCertificate',
  GET_CERTIFICATE_STATUS = 'GetCertificateStatus',
  HEARTBEAT = 'Heartbeat',
  LOG_STATUS_NOTIFICATION = 'LogStatusNotification',
  METER_VALUES = 'MeterValues',
  NOTIFY_CUSTOMER_INFORMATION = 'NotifyCustomerInformation',
  NOTIFY_REPORT = 'NotifyReport',
  SECURITY_EVENT_NOTIFICATION = 'SecurityEventNotification',
  SIGN_CERTIFICATE = 'SignCertificate',
  STATUS_NOTIFICATION = 'StatusNotification',
  TRANSACTION_EVENT = 'TransactionEvent',
}

export interface OCPP20BootNotificationRequest extends JsonObject {
  chargingStation: ChargingStationType
  customData?: CustomDataType
  reason: BootReasonEnumType
}

export interface OCPP20CertificateSignedRequest extends JsonObject {
  certificateChain: string
  certificateType?: CertificateSigningUseEnumType
  customData?: CustomDataType
}

export interface OCPP20ChangeAvailabilityRequest extends JsonObject {
  customData?: CustomDataType
  evse?: OCPP20EVSEType
  operationalStatus: OperationalStatusEnumType
}

export type OCPP20ClearCacheRequest = EmptyObject

export interface OCPP20CustomerInformationRequest extends JsonObject {
  clear: boolean
  customData?: CustomDataType
  customerCertificate?: CertificateHashDataType
  customerIdentifier?: string
  idToken?: OCPP20IdTokenType
  report: boolean
  requestId: number
}

export interface OCPP20DataTransferRequest extends JsonObject {
  customData?: CustomDataType
  data?: JsonType
  messageId?: string
  vendorId: string
}

export interface OCPP20DeleteCertificateRequest extends JsonObject {
  certificateHashData: CertificateHashDataType
  customData?: CustomDataType
}

export interface OCPP20FirmwareStatusNotificationRequest extends JsonObject {
  customData?: CustomDataType
  requestId?: number
  status: FirmwareStatusEnumType
}

export interface OCPP20Get15118EVCertificateRequest extends JsonObject {
  action: CertificateActionEnumType
  customData?: CustomDataType
  exiRequest: string
  iso15118SchemaVersion: string
}

export interface OCPP20GetBaseReportRequest extends JsonObject {
  customData?: CustomDataType
  reportBase: ReportBaseEnumType
  requestId: number
}

export interface OCPP20GetCertificateStatusRequest extends JsonObject {
  customData?: CustomDataType
  ocspRequestData: OCSPRequestDataType
}

export interface OCPP20GetInstalledCertificateIdsRequest extends JsonObject {
  certificateType?: GetCertificateIdUseEnumType[]
  customData?: CustomDataType
}

export interface OCPP20GetLogRequest extends JsonObject {
  customData?: CustomDataType
  log: LogParametersType
  logType: LogEnumType
  requestId: number
  retries?: number
  retryInterval?: number
}

export interface OCPP20GetTransactionStatusRequest extends JsonObject {
  customData?: CustomDataType
  transactionId?: string
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

export interface OCPP20LogStatusNotificationRequest extends JsonObject {
  customData?: CustomDataType
  requestId?: number
  status: UploadLogStatusEnumType
}

export interface OCPP20NotifyCustomerInformationRequest extends JsonObject {
  customData?: CustomDataType
  data: string
  generatedAt: Date
  requestId: number
  seqNo: number
  tbc?: boolean
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

export interface OCPP20SecurityEventNotificationRequest extends JsonObject {
  customData?: CustomDataType
  techInfo?: string
  timestamp: Date
  type: string
}

export interface OCPP20SetNetworkProfileRequest extends JsonObject {
  configurationSlot: number
  connectionData: NetworkConnectionProfileType
  customData?: CustomDataType
}

export interface OCPP20SetVariablesRequest extends JsonObject {
  customData?: CustomDataType
  setVariableData: OCPP20SetVariableDataType[]
}

export interface OCPP20SignCertificateRequest extends JsonObject {
  certificateType?: CertificateSigningUseEnumType
  csr: string
  customData?: CustomDataType
}

export interface OCPP20StatusNotificationRequest extends JsonObject {
  connectorId: number
  connectorStatus: OCPP20ConnectorStatusEnumType
  customData?: CustomDataType
  evseId: number
  timestamp: Date
}

export interface OCPP20TriggerMessageRequest extends JsonObject {
  customData?: CustomDataType
  evse?: OCPP20EVSEType
  requestedMessage: MessageTriggerEnumType
}

export interface OCPP20UnlockConnectorRequest extends JsonObject {
  connectorId: number
  customData?: CustomDataType
  evseId: number
}

export interface OCPP20UpdateFirmwareRequest extends JsonObject {
  customData?: CustomDataType
  firmware: FirmwareType
  requestId: number
  retries?: number
  retryInterval?: number
}
