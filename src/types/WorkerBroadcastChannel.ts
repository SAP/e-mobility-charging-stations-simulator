import { JsonObject } from './JsonType';
import { RequestPayload, ResponsePayload } from './UIProtocol';

export type BroadcastChannelRequest = [
  string,
  BroadcastChannelProcedureName,
  BroadcastChannelRequestPayload
];
export type BroadcastChannelResponse = [string, BroadcastChannelResponsePayload];

export enum BroadcastChannelProcedureName {
  START_CHARGING_STATION = 'startChargingStation',
  STOP_CHARGING_STATION = 'stopChargingStation',
  START_TRANSACTION = 'startTransaction',
  STOP_TRANSACTION = 'stopTransaction',
}

export interface BroadcastChannelRequestPayload extends Omit<RequestPayload, 'hashId'> {
  hashId: string;
  connectorId?: number;
  transactionId?: number;
  idTag?: string;
}

export type BroadcastChannelResponsePayload = ResponsePayload;

export type MessageEvent = { data: BroadcastChannelRequest | BroadcastChannelResponse };
