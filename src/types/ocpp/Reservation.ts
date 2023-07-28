import type { OCPP16ReserveNowRequest } from './1.6/Requests';

export type Reservation = OCPP16ReserveNowRequest;

export enum ReservationTerminationReason {
  EXPIRED = 'Expired',
  TRANSACTION_STARTED = 'TransactionStarted',
  CONNECTOR_STATE_CHANGED = 'ConnectorStateChanged',
  RESERVATION_CANCELED = 'ReservationCanceled',
  REPLACE_EXISTING = 'ReplaceExisting',
}

export enum ReservationFilterKey {
  RESERVATION_ID = 'reservationId',
  ID_TAG = 'idTag',
  PARENT_ID_TAG = 'parentIdTag',
  CONNECTOR_ID = 'connectorId',
  EVSE_ID = 'evseId',
}
