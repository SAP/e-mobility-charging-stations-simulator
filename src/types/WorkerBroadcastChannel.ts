import { JsonObject } from './JsonType';

export type BroadcastChannelRequest = [string, BroadcastChannelProcedureName, RequestPayload];
export type BroadcastChannelResponse = [string, ResponsePayload];

export enum BroadcastChannelProcedureName {
  START_CHARGING_STATION = 'startChargingStation',
  STOP_CHARGING_STATION = 'stopChargingStation',
  START_TRANSACTION = 'startTransaction',
  STOP_TRANSACTION = 'stopTransaction',
}

interface BasePayload extends JsonObject {
  hashId: string;
}

export interface RequestPayload extends BasePayload {
  connectorId?: number;
  transactionId?: number;
  idTag?: string;
}

export type ResponsePayload = BasePayload;
