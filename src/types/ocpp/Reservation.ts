import type { OCPP16ReserveNowRequest } from './1.6/Requests';

export type Reservation = OCPP16ReserveNowRequest;

export enum ReservationTerminationReason {
  EXPIRED = 'Expired',
  TRANSACTION_STARTED = 'TransactionStarted',
  CONNECTOR_STATE_CHANGED = 'ConnectorStateChanged',
  RESERVATION_CANCELED = 'ReservationCanceled',
  REPLACE_EXISTING = 'ReplaceExisting',
}

export type ReservationFilterKey = keyof OCPP16ReserveNowRequest;
