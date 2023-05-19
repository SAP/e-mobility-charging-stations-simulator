import type {
  GenericStatusEnumType,
  InstallCertificateStatusEnumType,
  StatusInfoType,
} from './Common';
import type { OCPP20SetVariableResultType } from './Variables';
import type { EmptyObject } from '../../EmptyObject';
import type { JsonObject } from '../../JsonType';
import type { RegistrationStatusEnumType } from '../Responses';

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
  status: GenericStatusEnumType;
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
