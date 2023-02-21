import type {
  EmptyObject,
  GenericStatus,
  InstallCertificateStatusEnumType,
  JsonObject,
  OCPP20SetVariableResultType,
  RegistrationStatusEnumType,
  StatusInfoType,
} from '../../internal';

export type OCPP20BootNotificationResponse = {
  currentTime: Date;
  status: RegistrationStatusEnumType;
  interval: number;
  statusInfo?: StatusInfoType;
} & JsonObject;

export type OCPP20HeartbeatResponse = {
  currentTime: Date;
} & JsonObject;

export type OCPP20ClearCacheResponse = {
  status: GenericStatus;
  statusInfo?: StatusInfoType;
} & JsonObject;

export type OCPP20StatusNotificationResponse = EmptyObject;

export type OCPP20SetVariablesResponse = {
  setVariableResult: OCPP20SetVariableResultType[];
} & JsonObject;

export type OCPP20InstallCertificateResponse = {
  status: InstallCertificateStatusEnumType;
  statusInfo?: StatusInfoType;
} & JsonObject;
