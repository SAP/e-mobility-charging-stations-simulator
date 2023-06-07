export interface OCPP16Reservation {
  id: number;
  connectorId: number;
  expiryDate: Date;
  idTag: string;
  parentIdTag?: string;
}

export enum ReservationTerminationReason {
  EXPIRED = 'Expired',
  TRANSACTION_STARTED = 'TransactionStarted',
  CONNECTOR_STATE_CHANGED = 'ConnectorStateChanged',
  RESERVATION_CANCELED = 'ReservationCanceled',
  REPLACE_EXISTING = 'ReplaceExisting',
}

export enum ReservationFilterKey {
  RESERVATION_ID = 'id',
  ID_TAG = 'idTag',
  PARENT_ID_TAG = 'parentIdTag',
  CONNECTOR_ID = 'connectorId',
  EVSE_ID = 'evseId',
}
