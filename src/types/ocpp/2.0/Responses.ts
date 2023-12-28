import type {
  GenericStatusEnumType,
  InstallCertificateStatusEnumType,
  StatusInfoType,
} from './Common.js';
import type { OCPP20SetVariableResultType } from './Variables.js';
import type { EmptyObject } from '../../EmptyObject.js';
import type { JsonObject } from '../../JsonType.js';
import type { RegistrationStatusEnumType } from '../Common.js';

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
