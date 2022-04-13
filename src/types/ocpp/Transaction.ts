import {
  OCPP16AuthorizationStatus,
  OCPP16AuthorizeRequest,
  OCPP16AuthorizeResponse,
  OCPP16StartTransactionRequest,
  OCPP16StartTransactionResponse,
  OCPP16StopTransactionReason,
  OCPP16StopTransactionRequest,
  OCPP16StopTransactionResponse,
} from './1.6/Transaction';

export type AuthorizationStatus = OCPP16AuthorizationStatus;

export const AuthorizationStatus = {
  ...OCPP16AuthorizationStatus,
};

export type AuthorizeRequest = OCPP16AuthorizeRequest;

export type AuthorizeResponse = OCPP16AuthorizeResponse;

export type StopTransactionReason = OCPP16StopTransactionReason;

export const StopTransactionReason = {
  ...OCPP16StopTransactionReason,
};

export type StartTransactionRequest = OCPP16StartTransactionRequest;

export type StartTransactionResponse = OCPP16StartTransactionResponse;

export type StopTransactionRequest = OCPP16StopTransactionRequest;

export type StopTransactionResponse = OCPP16StopTransactionResponse;
