import type { JsonObject } from '../../JsonType.js'
import type { CustomDataType, StatusInfoType } from './Common.js'
import type { ComponentType } from './Transaction.js'

export enum AttributeEnumType {
  Actual = 'Actual',
  MaxSet = 'MaxSet',
  MinSet = 'MinSet',
  Target = 'Target',
}

export enum GetVariableStatusEnumType {
  Accepted = 'Accepted',
  NotSupportedAttributeType = 'NotSupportedAttributeType',
  Rejected = 'Rejected',
  UnknownComponent = 'UnknownComponent',
  UnknownVariable = 'UnknownVariable',
}

export enum MutabilityEnumType {
  ReadOnly = 'ReadOnly',
  ReadWrite = 'ReadWrite',
  WriteOnly = 'WriteOnly',
}

export enum OCPP20DeviceInfoVariableName {
  AvailabilityState = 'AvailabilityState',
  ConnectorType = 'ConnectorType',
  FirmwareVersion = 'FirmwareVersion',
  Model = 'Model',
  SerialNumber = 'SerialNumber',
  VendorName = 'VendorName',
}

export enum OCPP20OptionalVariableName {
  AllowReset = 'AllowReset',
  CertSigningRepeatTimes = 'CertSigningRepeatTimes',
  CertSigningWaitMinimum = 'CertSigningWaitMinimum',
  ConfigurationValueSize = 'ConfigurationValueSize',
  HeartbeatInterval = 'HeartbeatInterval',
  MasterPassGroupId = 'MasterPassGroupId',
  MaxCertificateChainSize = 'MaxCertificateChainSize',
  MaxEnergyOnInvalidId = 'MaxEnergyOnInvalidId',
  NonEvseSpecific = 'NonEvseSpecific',
  ReportingValueSize = 'ReportingValueSize',
  RetryBackOffRandomRange = 'RetryBackOffRandomRange',
  RetryBackOffRepeatTimes = 'RetryBackOffRepeatTimes',
  RetryBackOffWaitMinimum = 'RetryBackOffWaitMinimum',
  ValueSize = 'ValueSize',
  WebSocketPingInterval = 'WebSocketPingInterval',
}

export enum OCPP20RequiredVariableName {
  AlignedDataInterval = 'Interval',
  AuthorizeRemoteStart = 'AuthorizeRemoteStart',
  BytesPerMessage = 'BytesPerMessage',
  CertificateEntries = 'CertificateEntries',
  DateTime = 'DateTime',
  Enabled = 'Enabled',
  EVConnectionTimeOut = 'EVConnectionTimeOut',
  FileTransferProtocols = 'FileTransferProtocols',
  ItemsPerMessage = 'ItemsPerMessage',
  LocalAuthorizationOffline = 'LocalAuthorizationOffline',
  LocalPreAuthorization = 'LocalPreAuthorization',
  Measurands = 'Measurands',
  MessageAttemptInterval = 'MessageAttemptInterval',
  MessageAttempts = 'MessageAttempts',
  MessageTimeout = 'MessageTimeout',
  NetworkConfigurationPriority = 'NetworkConfigurationPriority',
  NetworkProfileConnectionAttempts = 'NetworkProfileConnectionAttempts',
  OfflineThreshold = 'OfflineThreshold',
  OrganizationName = 'OrganizationName',
  ResetRetries = 'ResetRetries',
  SecurityProfile = 'SecurityProfile',
  StopTxOnEVSideDisconnect = 'StopTxOnEVSideDisconnect',
  StopTxOnInvalidId = 'StopTxOnInvalidId',
  TimeSource = 'TimeSource',
  TxEndedInterval = 'TxEndedInterval',
  TxEndedMeasurands = 'TxEndedMeasurands',
  TxStartedMeasurands = 'TxStartedMeasurands',
  TxStartPoint = 'TxStartPoint',
  TxStopPoint = 'TxStopPoint',
  TxUpdatedInterval = 'TxUpdatedInterval',
  TxUpdatedMeasurands = 'TxUpdatedMeasurands',
  UnlockOnEVSideDisconnect = 'UnlockOnEVSideDisconnect',
}

export enum OCPP20VendorVariableName {
  CertificatePrivateKey = 'CertificatePrivateKey',
  ConnectionUrl = 'ConnectionUrl',
  SimulateSignatureVerificationFailure = 'SimulateSignatureVerificationFailure',
}

export enum PersistenceEnumType {
  Persistent = 'Persistent',
  Volatile = 'Volatile',
}

export enum SetVariableStatusEnumType {
  Accepted = 'Accepted',
  NotSupportedAttributeType = 'NotSupportedAttributeType',
  RebootRequired = 'RebootRequired',
  Rejected = 'Rejected',
  UnknownComponent = 'UnknownComponent',
  UnknownVariable = 'UnknownVariable',
}

export interface OCPP20ComponentVariableType extends JsonObject {
  component: ComponentType
  variable?: VariableType
}

export interface OCPP20GetVariableDataType extends JsonObject {
  attributeType?: AttributeEnumType
  component: ComponentType
  customData?: CustomDataType
  variable: VariableType
}

export interface OCPP20GetVariableResultType extends JsonObject {
  attributeStatus: GetVariableStatusEnumType
  attributeStatusInfo?: StatusInfoType
  attributeType?: AttributeEnumType
  attributeValue?: string
  component: ComponentType
  customData?: CustomDataType
  variable: VariableType
}

export interface OCPP20SetVariableDataType extends JsonObject {
  attributeType?: AttributeEnumType
  attributeValue: string
  component: ComponentType
  customData?: CustomDataType
  variable: VariableType
}

export interface OCPP20SetVariableResultType extends JsonObject {
  attributeStatus: SetVariableStatusEnumType
  attributeStatusInfo?: StatusInfoType
  attributeType?: AttributeEnumType
  component: ComponentType
  customData?: CustomDataType
  variable: VariableType
}

export interface ReportDataType extends JsonObject {
  component: ComponentType
  customData?: CustomDataType
  variable: VariableType
  variableAttribute: VariableAttributeType[]
  variableCharacteristics?: VariableCharacteristicsType
}

export type VariableName =
  | OCPP20DeviceInfoVariableName
  | OCPP20OptionalVariableName
  | OCPP20RequiredVariableName
  | OCPP20VendorVariableName
  | string

export interface VariableType extends JsonObject {
  customData?: CustomDataType
  instance?: string
  name: VariableName
}

interface VariableAttributeType extends JsonObject {
  type?: AttributeEnumType
  value?: string
}

interface VariableCharacteristicsType extends JsonObject {
  dataType: string
  supportsMonitoring: boolean
}
