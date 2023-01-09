import type { JsonObject } from '../../JsonType';
import type { DefaultStatus, RegistrationStatusEnumType } from '../Responses';

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
  status: DefaultStatus;
  statusInfo?: StatusInfoType;
} & JsonObject;
