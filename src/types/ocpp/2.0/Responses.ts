import type {
  EmptyObject,
  GenericStatus,
  JsonObject,
  RegistrationStatusEnumType,
} from '../../internal';

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
