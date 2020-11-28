import { ConfigurationKey } from '../../ChargingStationConfiguration';

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

export enum RegistrationStatus {
  ACCEPTED = 'Accepted',
  PENDING = 'Pending',
  REJECTED = 'Rejected'
}

export interface BootNotificationResponse {
  status: RegistrationStatus;
  currentTime: string;
  interval: number;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface StatusNotificationResponse {}

export interface GetConfigurationResponse {
  configurationKey: ConfigurationKey[];
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
