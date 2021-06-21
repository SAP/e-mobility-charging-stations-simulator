import { OCPP16MeterValue } from './MeterValues';

export enum OCPP16StopTransactionReason {
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

export enum OCPP16AuthorizationStatus {
  ACCEPTED = 'Accepted',
  BLOCKED = 'Blocked',
  EXPIRED = 'Expired',
  INVALID = 'Invalid',
  CONCURRENT_TX = 'ConcurrentTx'
}

export interface IdTagInfo {
  status: OCPP16AuthorizationStatus;
  parentIdTag?: string;
  expiryDate?: Date;
}

export interface AuthorizeRequest {
  idTag: string;
}

export interface OCPP16AuthorizeResponse {
  idTagInfo: IdTagInfo;
}

export interface StartTransactionRequest {
  connectorId: number;
  idTag: string;
  meterStart: number;
  reservationId?: number;
  timestamp: string;
}

export interface OCPP16StartTransactionResponse {
  idTagInfo: IdTagInfo;
  transactionId: number;
}

export interface StopTransactionRequest {
  idTag?: string;
  meterStop: number;
  timestamp: string;
  transactionId: number;
  reason?: OCPP16StopTransactionReason;
  transactionData?: OCPP16MeterValue[];
}

export interface OCPP16StopTransactionResponse {
  idTagInfo?: IdTagInfo;
}
