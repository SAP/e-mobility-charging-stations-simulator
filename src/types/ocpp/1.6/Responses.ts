import type { EmptyObject } from '../../EmptyObject';
import type { JsonObject } from '../../JsonType';
import type { OCPPConfigurationKey } from '../Configuration';

export interface OCPP16HeartbeatResponse extends JsonObject {
  currentTime: string;
}

export enum OCPP16UnlockStatus {
  UNLOCKED = 'Unlocked',
  UNLOCK_FAILED = 'UnlockFailed',
  NOT_SUPPORTED = 'NotSupported',
}

export interface UnlockConnectorResponse extends JsonObject {
  status: OCPP16UnlockStatus;
}

export enum OCPP16ConfigurationStatus {
  ACCEPTED = 'Accepted',
  REJECTED = 'Rejected',
  REBOOT_REQUIRED = 'RebootRequired',
  NOT_SUPPORTED = 'NotSupported',
}

export interface ChangeConfigurationResponse extends JsonObject {
  status: OCPP16ConfigurationStatus;
}

export enum OCPP16RegistrationStatus {
  ACCEPTED = 'Accepted',
  PENDING = 'Pending',
  REJECTED = 'Rejected',
}

export interface OCPP16BootNotificationResponse extends JsonObject {
  status: OCPP16RegistrationStatus;
  currentTime: string;
  interval: number;
}

export type OCPP16StatusNotificationResponse = EmptyObject;

export interface GetConfigurationResponse extends JsonObject {
  configurationKey: OCPPConfigurationKey[];
  unknownKey: string[];
}

export enum OCPP16ChargingProfileStatus {
  ACCEPTED = 'Accepted',
  REJECTED = 'Rejected',
  NOT_SUPPORTED = 'NotSupported',
}

export interface SetChargingProfileResponse extends JsonObject {
  status: OCPP16ChargingProfileStatus;
}

export enum OCPP16AvailabilityStatus {
  ACCEPTED = 'Accepted',
  REJECTED = 'Rejected',
  SCHEDULED = 'Scheduled',
}

export interface ChangeAvailabilityResponse extends JsonObject {
  status: OCPP16AvailabilityStatus;
}

export enum OCPP16ClearChargingProfileStatus {
  ACCEPTED = 'Accepted',
  UNKNOWN = 'Unknown',
}

export interface ClearChargingProfileResponse extends JsonObject {
  status: OCPP16ClearChargingProfileStatus;
}

export interface GetDiagnosticsResponse extends JsonObject {
  fileName?: string;
}

export type DiagnosticsStatusNotificationResponse = EmptyObject;

export enum OCPP16TriggerMessageStatus {
  ACCEPTED = 'Accepted',
  REJECTED = 'Rejected',
  NOT_IMPLEMENTED = 'NotImplemented',
}

export interface OCPP16TriggerMessageResponse extends JsonObject {
  status: OCPP16TriggerMessageStatus;
}

export enum OCPP16DataTransferStatus {
  ACCEPTED = 'Accepted',
  REJECTED = 'Rejected',
  UNKNOWN_MESSAGE_ID = 'UnknownMessageId',
  UNKNOWN_VENDOR_ID = 'UnknownVendorId',
}

export interface OCPP16DataTransferResponse extends JsonObject {
  status: OCPP16DataTransferStatus;
  data?: string;
}
