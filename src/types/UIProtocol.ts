import type { JsonObject } from './JsonType';
import type { BroadcastChannelResponsePayload } from './WorkerBroadcastChannel';

export enum Protocol {
  UI = 'ui',
}

export enum ApplicationProtocol {
  HTTP = 'http',
  WS = 'ws',
}

export enum AuthenticationType {
  BASIC_AUTH = 'basic-auth',
}

export enum ProtocolVersion {
  '0.0.1' = '0.0.1',
}

export type ProtocolRequest = [string, ProcedureName, RequestPayload];
export type ProtocolResponse = [string, ResponsePayload];

export type ProtocolRequestHandler = (
  uuid?: string,
  payload?: RequestPayload
) => undefined | Promise<undefined> | ResponsePayload | Promise<ResponsePayload>;

export enum ProcedureName {
  LIST_CHARGING_STATIONS = 'listChargingStations',
  START_CHARGING_STATION = 'startChargingStation',
  STOP_CHARGING_STATION = 'stopChargingStation',
  START_SIMULATOR = 'startSimulator',
  STOP_SIMULATOR = 'stopSimulator',
  OPEN_CONNECTION = 'openConnection',
  CLOSE_CONNECTION = 'closeConnection',
  START_TRANSACTION = 'startTransaction',
  STOP_TRANSACTION = 'stopTransaction',
  START_AUTOMATIC_TRANSACTION_GENERATOR = 'startAutomaticTransactionGenerator',
  STOP_AUTOMATIC_TRANSACTION_GENERATOR = 'stopAutomaticTransactionGenerator',
}

export interface RequestPayload extends JsonObject {
  hashIds?: string[];
  connectorIds?: number[];
}

export enum ResponseStatus {
  SUCCESS = 'success',
  FAILURE = 'failure',
}

export interface ResponsePayload extends JsonObject {
  status: ResponseStatus;
  hashIdsSucceeded?: string[];
  hashIdsFailed?: string[];
  responsesFailed?: BroadcastChannelResponsePayload[];
}
