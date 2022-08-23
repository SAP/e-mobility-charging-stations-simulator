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

interface BroadcastChannelBasePayload extends JsonObject {
  hashId: string;
}

export interface BroadcastChannelRequestPayload
  extends BroadcastChannelBasePayload,
    Omit<RequestPayload, 'hashId'> {
  connectorId?: number;
  transactionId?: number;
  idTag?: string;
}

export type BroadcastChannelResponsePayload = ResponsePayload;
