import type { JsonObject } from '../../JsonType.js'
import type { ComponentType, StatusInfoType } from './Common.js'

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

export enum OCPP20OptionalVariableName {
  HeartbeatInterval = 'HeartbeatInterval',
  WebSocketPingInterval = 'WebSocketPingInterval',
}

export enum OCPP20RequiredVariableName {
  AuthorizeRemoteStart = 'AuthorizeRemoteStart',
  BytesPerMessage = 'BytesPerMessage',
  CertificateEntries = 'CertificateEntries',
  DateTime = 'DateTime',
  EVConnectionTimeOut = 'EVConnectionTimeOut',
  FileTransferProtocols = 'FileTransferProtocols',
  ItemsPerMessage = 'ItemsPerMessage',
  LocalAuthorizeOffline = 'LocalAuthorizeOffline',
  LocalPreAuthorize = 'LocalPreAuthorize',
  MessageAttemptInterval = 'MessageAttemptInterval',
  MessageAttempts = 'TransactionEvent',
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
  TxEndedMeasurands = 'TxEndedMeasurands',
  TxStartedMeasurands = 'TxStartedMeasurands',
  TxStartPoint = 'TxStartPoint',
  TxStopPoint = 'TxStopPoint',
  TxUpdatedInterval = 'TxUpdatedInterval',
  TxUpdatedMeasurands = 'TxUpdatedMeasurands',
  UnlockOnEVSideDisconnect = 'UnlockOnEVSideDisconnect',
}

export enum OCPP20VariableName {
  AvailabilityState = 'AvailabilityState',
  ConnectorType = 'ConnectorType',
  FirmwareVersion = 'FirmwareVersion',
  Model = 'Model',
  SerialNumber = 'SerialNumber',
  VendorName = 'VendorName',
}

export enum OCPP20VendorVariableName {
  ConnectionUrl = 'ConnectionUrl',
}

enum SetVariableStatusEnumType {
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
  variable: VariableType
}

export interface OCPP20GetVariableResultType extends JsonObject {
  attributeStatus: GetVariableStatusEnumType
  attributeStatusInfo?: StatusInfoType
  attributeType?: AttributeEnumType
  attributeValue?: string
  component: ComponentType
  variable: VariableType
}

export interface OCPP20SetVariableDataType extends JsonObject {
  attributeType?: AttributeEnumType
  attributeValue: string
  component: ComponentType
  variable: VariableType
}

export interface OCPP20SetVariableResultType extends JsonObject {
  attributeStatus: SetVariableStatusEnumType
  attributeStatusInfo?: StatusInfoType
  attributeType?: AttributeEnumType
  component: ComponentType
  variable: VariableType
}

export interface VariableType extends JsonObject {
  instance?: string
  name: VariableName
}

type VariableName =
  | OCPP20OptionalVariableName
  | OCPP20RequiredVariableName
  | OCPP20VariableName
  | OCPP20VendorVariableName
  | string
