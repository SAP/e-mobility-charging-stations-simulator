import { EmptyObject } from '../../EmptyObject';
import { JsonType } from '../../JsonType';
import { OCPPConfigurationKey } from '../Configuration';

export interface OCPP16HeartbeatResponse extends JsonType {
  currentTime: string;
}

export enum OCPP16UnlockStatus {
  UNLOCKED = 'Unlocked',
  UNLOCK_FAILED = 'UnlockFailed',
  NOT_SUPPORTED = 'NotSupported',
}

export interface UnlockConnectorResponse extends JsonType {
  status: OCPP16UnlockStatus;
}

export enum OCPP16ConfigurationStatus {
  ACCEPTED = 'Accepted',
  REJECTED = 'Rejected',
  REBOOT_REQUIRED = 'RebootRequired',
  NOT_SUPPORTED = 'NotSupported',
}

export interface ChangeConfigurationResponse extends JsonType {
  status: OCPP16ConfigurationStatus;
}

export enum OCPP16RegistrationStatus {
  ACCEPTED = 'Accepted',
  PENDING = 'Pending',
  REJECTED = 'Rejected',
}

export interface OCPP16BootNotificationResponse extends JsonType {
  status: OCPP16RegistrationStatus;
  currentTime: string;
  interval: number;
}

export type OCPP16StatusNotificationResponse = EmptyObject;

export interface GetConfigurationResponse extends JsonType {
  configurationKey: OCPPConfigurationKey[];
  unknownKey: string[];
}

export enum OCPP16ChargingProfileStatus {
  ACCEPTED = 'Accepted',
  REJECTED = 'Rejected',
  NOT_SUPPORTED = 'NotSupported',
}

export interface SetChargingProfileResponse extends JsonType {
  status: OCPP16ChargingProfileStatus;
}

export enum OCPP16AvailabilityStatus {
  ACCEPTED = 'Accepted',
  REJECTED = 'Rejected',
  SCHEDULED = 'Scheduled',
}

export interface ChangeAvailabilityResponse extends JsonType {
  status: OCPP16AvailabilityStatus;
}

export enum OCPP16ClearChargingProfileStatus {
  ACCEPTED = 'Accepted',
  UNKNOWN = 'Unknown',
}

export interface ClearChargingProfileResponse extends JsonType {
  status: OCPP16ClearChargingProfileStatus;
}

export interface GetDiagnosticsResponse extends JsonType {
  fileName?: string;
}

export type DiagnosticsStatusNotificationResponse = EmptyObject;

export enum OCPP16TriggerMessageStatus {
  ACCEPTED = 'Accepted',
  REJECTED = 'Rejected',
  NOT_IMPLEMENTED = 'NotImplemented',
}

export interface OCPP16TriggerMessageResponse extends JsonType {
  status: OCPP16TriggerMessageStatus;
}
