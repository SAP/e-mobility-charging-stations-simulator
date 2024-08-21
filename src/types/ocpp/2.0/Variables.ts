import type { JsonObject } from '../../JsonType.js'
import type { EVSEType, StatusInfoType } from './Common.js'

enum OCPP20ComponentName {
  AlignedDataCtrlr = 'AlignedDataCtrlr',
  AuthCacheCtrlr = 'AuthCacheCtrlr',
  AuthCtrlr = 'AuthCtrlr',
  CHAdeMOCtrlr = 'CHAdeMOCtrlr',
  ClockCtrlr = 'ClockCtrlr',
  CustomizationCtrlr = 'CustomizationCtrlr',
  DeviceDataCtrlr = 'DeviceDataCtrlr',
  DisplayMessageCtrlr = 'DisplayMessageCtrlr',
  ISO15118Ctrlr = 'ISO15118Ctrlr',
  LocalAuthListCtrlr = 'LocalAuthListCtrlr',
  MonitoringCtrlr = 'MonitoringCtrlr',
  OCPPCommCtrlr = 'OCPPCommCtrlr',
  ReservationCtrlr = 'ReservationCtrlr',
  SampledDataCtrlr = 'SampledDataCtrlr',
  SecurityCtrlr = 'SecurityCtrlr',
  SmartChargingCtrlr = 'SmartChargingCtrlr',
  TariffCostCtrlr = 'TariffCostCtrlr',
  TxCtrlr = 'TxCtrlr'
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
  UnlockOnEVSideDisconnect = 'UnlockOnEVSideDisconnect'
}

export enum OCPP20OptionalVariableName {
  HeartbeatInterval = 'HeartbeatInterval',
  WebSocketPingInterval = 'WebSocketPingInterval'
}

export enum OCPP20VendorVariableName {
  ConnectionUrl = 'ConnectionUrl'
}

enum AttributeEnumType {
  Actual = 'Actual',
  MaxSet = 'MaxSet',
  MinSet = 'MinSet',
  Target = 'Target'
}

interface ComponentType extends JsonObject {
  evse?: EVSEType
  instance?: string
  name: OCPP20ComponentName | string
}

type VariableName =
  | OCPP20OptionalVariableName
  | OCPP20RequiredVariableName
  | OCPP20VendorVariableName
  | string

interface VariableType extends JsonObject {
  instance?: string
  name: VariableName
}

export interface OCPP20SetVariableDataType extends JsonObject {
  attributeType?: AttributeEnumType
  attributeValue: string
  component: ComponentType
  variable: VariableType
}

enum SetVariableStatusEnumType {
  Accepted = 'Accepted',
  NotSupportedAttributeType = 'NotSupportedAttributeType',
  RebootRequired = 'RebootRequired',
  Rejected = 'Rejected',
  UnknownComponent = 'UnknownComponent',
  UnknownVariable = 'UnknownVariable'
}

export interface OCPP20SetVariableResultType extends JsonObject {
  attributeStatus: SetVariableStatusEnumType
  attributeStatusInfo?: StatusInfoType
  attributeType?: AttributeEnumType
  component: ComponentType
  variable: VariableType
}

export interface OCPP20ComponentVariableType extends JsonObject {
  component: ComponentType
  variable?: VariableType
}
