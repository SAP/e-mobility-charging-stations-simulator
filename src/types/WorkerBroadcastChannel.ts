import type { RequestPayload, ResponsePayload } from './UIProtocol';

export type BroadcastChannelRequest = [
  string,
  BroadcastChannelProcedureName,
  BroadcastChannelRequestPayload
];
export type BroadcastChannelResponse = [string, BroadcastChannelResponsePayload];

export enum BroadcastChannelProcedureName {
  START_CHARGING_STATION = 'startChargingStation',
  STOP_CHARGING_STATION = 'stopChargingStation',
  OPEN_CONNECTION = 'openConnection',
  CLOSE_CONNECTION = 'closeConnection',
  START_TRANSACTION = 'startTransaction',
  STOP_TRANSACTION = 'stopTransaction',
  START_AUTOMATIC_TRANSACTION_GENERATOR = 'startAutomaticTransactionGenerator',
  STOP_AUTOMATIC_TRANSACTION_GENERATOR = 'stopAutomaticTransactionGenerator',
  STATUS_NOTIFICATION = 'statusNotification',
}

export interface BroadcastChannelRequestPayload extends RequestPayload {
  connectorId?: number;
  transactionId?: number;
  idTag?: string;
}

export interface BroadcastChannelResponsePayload
  extends Omit<ResponsePayload, 'hashIdsSucceeded' | 'hashIdsFailed' | 'responsesFailed'> {
  hashId: string;
}

export type MessageEvent = { data: BroadcastChannelRequest | BroadcastChannelResponse };
