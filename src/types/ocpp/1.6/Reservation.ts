export interface OCPP16Reservation {
  connectorId: number;
  expiryDate: Date;
  idTag: string;
  parentIdTag?: string;
  reservationId: number;
}
