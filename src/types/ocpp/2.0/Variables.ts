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
  MessageTimeout = 'MessageTimeout',
  FileTransferProtocols = 'FileTransferProtocols',
  NetworkConfigurationPriority = 'NetworkConfigurationPriority',
  NetworkProfileConnectionAttempts = 'NetworkProfileConnectionAttempts',
  OfflineThreshold = 'OfflineThreshold',
  MessageAttempts = 'TransactionEvent',
  MessageAttemptInterval = 'MessageAttemptInterval',
  UnlockOnEVSideDisconnect = 'UnlockOnEVSideDisconnect',
  ResetRetries = 'ResetRetries',
  ItemsPerMessage = 'ItemsPerMessage',
  BytesPerMessage = 'BytesPerMessage',
  DateTime = 'DateTime',
  TimeSource = 'TimeSource',
  OrganizationName = 'OrganizationName',
  CertificateEntries = 'CertificateEntries',
  SecurityProfile = 'SecurityProfile',
  AuthorizeRemoteStart = 'AuthorizeRemoteStart',
  LocalAuthorizeOffline = 'LocalAuthorizeOffline',
  LocalPreAuthorize = 'LocalPreAuthorize',
  EVConnectionTimeOut = 'EVConnectionTimeOut',
  StopTxOnEVSideDisconnect = 'StopTxOnEVSideDisconnect',
  TxStartPoint = 'TxStartPoint',
  TxStopPoint = 'TxStopPoint',
  StopTxOnInvalidId = 'StopTxOnInvalidId',
  TxEndedMeasurands = 'TxEndedMeasurands',
  TxStartedMeasurands = 'TxStartedMeasurands',
  TxUpdatedMeasurands = 'TxUpdatedMeasurands',
  TxUpdatedInterval = 'TxUpdatedInterval'
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
  Target = 'Target',
  MinSet = 'MinSet',
  MaxSet = 'MaxSet'
}

interface ComponentType extends JsonObject {
  name: string | OCPP20ComponentName
  instance?: string
  evse?: EVSEType
}

type VariableName =
  | string
  | OCPP20RequiredVariableName
  | OCPP20OptionalVariableName
  | OCPP20VendorVariableName

interface VariableType extends JsonObject {
  name: VariableName
  instance?: string
}

export interface OCPP20SetVariableDataType extends JsonObject {
  attributeType?: AttributeEnumType
  attributeValue: string
  component: ComponentType
  variable: VariableType
}

enum SetVariableStatusEnumType {
  Accepted = 'Accepted',
  Rejected = 'Rejected',
  UnknownComponent = 'UnknownComponent',
  UnknownVariable = 'UnknownVariable',
  NotSupportedAttributeType = 'NotSupportedAttributeType',
  RebootRequired = 'RebootRequired'
}

export interface OCPP20SetVariableResultType extends JsonObject {
  attributeType?: AttributeEnumType
  attributeStatus: SetVariableStatusEnumType
  component: ComponentType
  variable: VariableType
  attributeStatusInfo?: StatusInfoType
}

export interface OCPP20ComponentVariableType extends JsonObject {
  component: ComponentType
  variable?: VariableType
}
