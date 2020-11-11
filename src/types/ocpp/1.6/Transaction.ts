export enum StopTransactionReason {
  NONE = '',
  EMERGENCY_STOP = 'EmergencyStop',
  EV_DISCONNECTED = 'EVDisconnected',
  HARD_RESET = 'HardReset',
  LOCAL = 'Local',
  OTHER = 'Other',
  POWER_LOSS = 'PowerLoss',
  REBOOT = 'Reboot',
  REMOTE = 'Remote',
  SOFT_RESET = 'SoftReset',
  UNLOCK_COMMAND = 'UnlockCommand',
  DE_AUTHORIZED = 'DeAuthorized'
}

export enum AuthorizationStatus {
  ACCEPTED = 'Accepted',
  BLOCKED = 'Blocked',
  EXPIRED = 'Expired',
  INVALID = 'Invalid',
  CONCURENT_TX = 'ConcurrentTx'
}

export interface IdTagInfo {
  status: AuthorizationStatus;
  parentIdTag?: string;
  expiryDate?: Date;
}

export interface StartTransactionResponse {
  idTagInfo: IdTagInfo;
  transactionId: number;
}

export interface StopTransactionResponse {
  idTagInfo?: IdTagInfo;
}
