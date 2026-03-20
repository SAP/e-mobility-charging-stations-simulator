import {
  OCPP16AuthorizationStatus,
  type OCPP16AuthorizeRequest,
  type OCPP16AuthorizeResponse,
  type OCPP16StartTransactionRequest,
  type OCPP16StartTransactionResponse,
  OCPP16StopTransactionReason,
  type OCPP16StopTransactionRequest,
  type OCPP16StopTransactionResponse,
} from './1.6/Transaction.js'
import { OCPP20AuthorizationStatusEnumType, OCPP20ReasonEnumType } from './2.0/Transaction.js'

export const AuthorizationStatus = {
  ...OCPP16AuthorizationStatus,
  ...OCPP20AuthorizationStatusEnumType,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type AuthorizationStatus = OCPP16AuthorizationStatus | OCPP20AuthorizationStatusEnumType

export type AuthorizeRequest = OCPP16AuthorizeRequest

export type AuthorizeResponse = OCPP16AuthorizeResponse

export type StartTransactionRequest = OCPP16StartTransactionRequest

export type StartTransactionResponse = OCPP16StartTransactionResponse

export const StopTransactionReason = {
  ...OCPP16StopTransactionReason,
  ...OCPP20ReasonEnumType,
} as const
export interface StartTransactionResult {
  readonly accepted: boolean
}

// eslint-disable-next-line @typescript-eslint/no-redeclare
export type StopTransactionReason = OCPP16StopTransactionReason | OCPP20ReasonEnumType

export type StopTransactionRequest = OCPP16StopTransactionRequest

export type StopTransactionResponse = OCPP16StopTransactionResponse

export interface StopTransactionResult {
  readonly accepted: boolean
}
