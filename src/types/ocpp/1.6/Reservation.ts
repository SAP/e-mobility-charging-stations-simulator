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
  CANCELED = 'ReservationCanceled',
}
