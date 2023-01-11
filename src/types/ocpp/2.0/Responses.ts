import type { EmptyObject } from '../../EmptyObject';
import type { JsonObject } from '../../JsonType';
import type { GenericStatus, RegistrationStatusEnumType } from '../Responses';

export type StatusInfoType = {
  reasonCode: string;
  additionalInfo?: string;
} & JsonObject;

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
