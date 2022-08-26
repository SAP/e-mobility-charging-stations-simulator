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
  OPEN_CONNECTION = 'openConnection',
  CLOSE_CONNECTION = 'closeConnection',
}

interface BaseBroadcastChannelRequestPayload extends Omit<RequestPayload, 'hashId' | 'hashIds'> {
  connectorId?: number;
  transactionId?: number;
  idTag?: string;
}

interface HashIdBroadcastChannelRequestPayload extends BaseBroadcastChannelRequestPayload {
  hashId: string;
}

interface HashIdsBroadcastChannelRequestPayload extends BaseBroadcastChannelRequestPayload {
  hashIds: string[];
}

export type BroadcastChannelRequestPayload =
  | HashIdBroadcastChannelRequestPayload
  | HashIdsBroadcastChannelRequestPayload;

export type BroadcastChannelResponsePayload = ResponsePayload;

export type MessageEvent = { data: BroadcastChannelRequest | BroadcastChannelResponse };
