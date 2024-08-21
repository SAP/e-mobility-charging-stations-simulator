import type { JsonObject } from '../../JsonType.js'
import type { OCPP16MeterValue } from './MeterValues.js'

export enum OCPP16StopTransactionReason {
  DE_AUTHORIZED = 'DeAuthorized',
  EMERGENCY_STOP = 'EmergencyStop',
  EV_DISCONNECTED = 'EVDisconnected',
  HARD_RESET = 'HardReset',
  LOCAL = 'Local',
  OTHER = 'Other',
  POWER_LOSS = 'PowerLoss',
  REBOOT = 'Reboot',
  REMOTE = 'Remote',
  SOFT_RESET = 'SoftReset',
  UNLOCK_COMMAND = 'UnlockCommand'
}

export enum OCPP16AuthorizationStatus {
  ACCEPTED = 'Accepted',
  BLOCKED = 'Blocked',
  CONCURRENT_TX = 'ConcurrentTx',
  EXPIRED = 'Expired',
  INVALID = 'Invalid'
}

interface IdTagInfo extends JsonObject {
  expiryDate?: Date
  parentIdTag?: string
  status: OCPP16AuthorizationStatus
}

export interface OCPP16AuthorizeRequest extends JsonObject {
  idTag: string
}

export interface OCPP16AuthorizeResponse extends JsonObject {
  idTagInfo: IdTagInfo
}

export interface OCPP16StartTransactionRequest extends JsonObject {
  connectorId: number
  idTag: string
  meterStart: number
  reservationId?: number
  timestamp: Date
}

export interface OCPP16StartTransactionResponse extends JsonObject {
  idTagInfo: IdTagInfo
  transactionId: number
}

export interface OCPP16StopTransactionRequest extends JsonObject {
  idTag?: string
  meterStop: number
  reason?: OCPP16StopTransactionReason
  timestamp: Date
  transactionData?: OCPP16MeterValue[]
  transactionId: number
}

export interface OCPP16StopTransactionResponse extends JsonObject {
  idTagInfo?: IdTagInfo
}
