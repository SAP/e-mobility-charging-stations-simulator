import type { OCPP16ReserveNowRequest } from './1.6/Requests.js'

export type Reservation = OCPP16ReserveNowRequest

export type ReservationKey = keyof Reservation

export enum ReservationTerminationReason {
  EXPIRED = 'Expired',
  TRANSACTION_STARTED = 'TransactionStarted',
  CONNECTOR_STATE_CHANGED = 'ConnectorStateChanged',
  RESERVATION_CANCELED = 'ReservationCanceled',
  REPLACE_EXISTING = 'ReplaceExisting'
}
