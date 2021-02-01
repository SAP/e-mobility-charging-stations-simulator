import { OCPPConfigurationKey } from '../Configuration';

export interface HeartbeatResponse {
  currentTime: string;
}

export enum DefaultStatus {
  ACCEPTED = 'Accepted',
  REJECTED = 'Rejected'
}

export interface DefaultResponse {
  status: DefaultStatus;
}

export enum UnlockStatus {
  UNLOCKED = 'Unlocked',
  UNLOCK_FAILED = 'UnlockFailed',
  NOT_SUPPORTED = 'NotSupported'
}

export interface UnlockConnectorResponse {
  status: UnlockStatus;
}

export enum ConfigurationStatus {
  ACCEPTED = 'Accepted',
  REJECTED = 'Rejected',
  REBOOT_REQUIRED = 'RebootRequired',
  NOT_SUPPORTED = 'NotSupported'
}

export interface ChangeConfigurationResponse {
  status: ConfigurationStatus;
}

export enum OCPP16RegistrationStatus {
  ACCEPTED = 'Accepted',
  PENDING = 'Pending',
  REJECTED = 'Rejected'
}

export interface OCPP16BootNotificationResponse {
  status: OCPP16RegistrationStatus;
  currentTime: string;
  interval: number;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface StatusNotificationResponse { }

export interface GetConfigurationResponse {
  configurationKey: OCPPConfigurationKey[];
  unknownKey: string[];
}

export enum ChargingProfileStatus {
  ACCEPTED = 'Accepted',
  REJECTED = 'Rejected',
  NOT_SUPPORTED = 'NotSupported',
}

export interface SetChargingProfileResponse {
  status: ChargingProfileStatus;
}

export enum AvailabilityStatus {
  ACCEPTED = 'Accepted',
  REJECTED = 'Rejected',
  SCHEDULED = 'Scheduled'
}

export interface ChangeAvailabilityResponse {
  status: AvailabilityStatus;
}

export enum ClearChargingProfileStatus {
  ACCEPTED = 'Accepted',
  UNKNOWN = 'Unknown'
}

export interface ClearChargingProfileResponse {
  status: ClearChargingProfileStatus;
}
