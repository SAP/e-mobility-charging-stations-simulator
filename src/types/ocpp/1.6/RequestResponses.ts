export enum DefaultResponseStatus {
  ACCEPTED = 'Accepted',
  REJECTED = 'Rejected'
}

export interface DefaultRequestResponse {
  status: DefaultResponseStatus;
}

export enum UnlockStatus {
  UNLOCKED = 'Unlocked',
  UNLOCK_FAILED = 'UnlockFailed',
  NOT_SUPPORTED = 'NotSupported'
}

export interface UnlockResponse {
  status: UnlockStatus;
}

export enum ConfigurationStatus {
  ACCEPTED = 'Accepted',
  REJECTED = 'Rejected',
  REBOOT_REQUIRED = 'RebootRequired',
  NOT_SUPPORTED = 'NotSupported'
}

export interface ConfigurationResponse {
  status: ConfigurationStatus;
}
