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

export const AuthorizationStatus = {
  ...OCPP16AuthorizationStatus,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type AuthorizationStatus = OCPP16AuthorizationStatus

export type AuthorizeRequest = OCPP16AuthorizeRequest

export type AuthorizeResponse = OCPP16AuthorizeResponse

export const StopTransactionReason = {
  ...OCPP16StopTransactionReason,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type StopTransactionReason = OCPP16StopTransactionReason

export type StartTransactionRequest = OCPP16StartTransactionRequest

export type StartTransactionResponse = OCPP16StartTransactionResponse

export type StopTransactionRequest = OCPP16StopTransactionRequest

export type StopTransactionResponse = OCPP16StopTransactionResponse
