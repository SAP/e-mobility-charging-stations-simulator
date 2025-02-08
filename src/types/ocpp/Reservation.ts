import type { OCPP16ReserveNowRequest } from './1.6/Requests.js'

export enum ReservationTerminationReason {
  CONNECTOR_STATE_CHANGED = 'ConnectorStateChanged',
  EXPIRED = 'Expired',
  REPLACE_EXISTING = 'ReplaceExisting',
  RESERVATION_CANCELED = 'ReservationCanceled',
  TRANSACTION_STARTED = 'TransactionStarted',
}

export type Reservation = OCPP16ReserveNowRequest

export type ReservationKey = keyof Reservation
