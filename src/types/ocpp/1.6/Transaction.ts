import type { JsonObject } from '../../JsonType.js'
import type { OCPP16MeterValue } from './MeterValues.js'

export enum OCPP16StopTransactionReason {
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

interface IdTagInfo extends JsonObject {
  status: OCPP16AuthorizationStatus
  parentIdTag?: string
  expiryDate?: Date
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
  timestamp: Date
  reservationId?: number
}

export interface OCPP16StartTransactionResponse extends JsonObject {
  idTagInfo: IdTagInfo
  transactionId: number
}

export interface OCPP16StopTransactionRequest extends JsonObject {
  idTag?: string
  meterStop: number
  timestamp: Date
  transactionId: number
  reason?: OCPP16StopTransactionReason
  transactionData?: OCPP16MeterValue[]
}

export interface OCPP16StopTransactionResponse extends JsonObject {
  idTagInfo?: IdTagInfo
}
