import type { EVSEType, StatusInfoType } from './Common';
import type { JsonObject } from '../../JsonType';

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
  TxCtrlr = 'TxCtrlr',
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
  TxUpdatedInterval = 'TxUpdatedInterval',
}

export enum OCPP20OptionalVariableName {
  HeartbeatInterval = 'HeartbeatInterval',
  WebSocketPingInterval = 'WebSocketPingInterval',
}

export enum OCPP20VendorVariableName {
  ConnectionUrl = 'ConnectionUrl',
}

enum AttributeEnumType {
  Actual = 'Actual',
  Target = 'Target',
  MinSet = 'MinSet',
  MaxSet = 'MaxSet',
}

type ComponentType = {
  name: string | OCPP20ComponentName;
  instance?: string;
  evse?: EVSEType;
} & JsonObject;

type VariableName =
  | string
  | OCPP20RequiredVariableName
  | OCPP20OptionalVariableName
  | OCPP20VendorVariableName;

type VariableType = {
  name: VariableName;
  instance?: string;
} & JsonObject;

export type OCPP20SetVariableDataType = {
  attributeType?: AttributeEnumType;
  attributeValue: string;
  component: ComponentType;
  variable: VariableType;
} & JsonObject;

enum SetVariableStatusEnumType {
  Accepted = 'Accepted',
  Rejected = 'Rejected',
  UnknownComponent = 'UnknownComponent',
  UnknownVariable = 'UnknownVariable',
  NotSupportedAttributeType = 'NotSupportedAttributeType',
  RebootRequired = 'RebootRequired',
}

export type OCPP20SetVariableResultType = {
  attributeType?: AttributeEnumType;
  attributeStatus: SetVariableStatusEnumType;
  component: ComponentType;
  variable: VariableType;
  attributeStatusInfo?: StatusInfoType;
} & JsonObject;

type OCPP20ComponentVariableType = {
  component: ComponentType;
  variable?: VariableType;
} & JsonObject;
