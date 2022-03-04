import { JsonType } from '../../JsonType';
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
  DE_AUTHORIZED = 'DeAuthorized',
}

export enum OCPP16AuthorizationStatus {
  ACCEPTED = 'Accepted',
  BLOCKED = 'Blocked',
  EXPIRED = 'Expired',
  INVALID = 'Invalid',
  CONCURRENT_TX = 'ConcurrentTx',
}

export interface IdTagInfo extends JsonType {
  status: OCPP16AuthorizationStatus;
  parentIdTag?: string;
  expiryDate?: Date;
}

export interface AuthorizeRequest extends JsonType {
  idTag: string;
}

export interface OCPP16AuthorizeResponse extends JsonType {
  idTagInfo: IdTagInfo;
}

export interface StartTransactionRequest extends JsonType {
  connectorId: number;
  idTag: string;
  meterStart: number;
  reservationId?: number;
  timestamp: string;
}

export interface OCPP16StartTransactionResponse extends JsonType {
  idTagInfo: IdTagInfo;
  transactionId: number;
}

export interface StopTransactionRequest extends JsonType {
  idTag?: string;
  meterStop: number;
  timestamp: string;
  transactionId: number;
  reason?: OCPP16StopTransactionReason;
  transactionData?: OCPP16MeterValue[];
}

export interface OCPP16StopTransactionResponse extends JsonType {
  idTagInfo?: IdTagInfo;
}
