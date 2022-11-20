import type { JsonObject } from './JsonType';

export enum Protocol {
  UI = 'ui',
}

export enum ApplicationProtocol {
  HTTP = 'http',
  WS = 'ws',
}

export enum ProtocolVersion {
  '0.0.1' = '0.0.1',
}

export type ProtocolRequest = [string, ProcedureName, RequestPayload];
export type ProtocolResponse = [string, ResponsePayload];

export type ProtocolRequestHandler = (
  payload: RequestPayload
) => ResponsePayload | Promise<ResponsePayload>;

export enum ProcedureName {
  START_SIMULATOR = 'startSimulator',
  STOP_SIMULATOR = 'stopSimulator',
  LIST_CHARGING_STATIONS = 'listChargingStations',
  START_CHARGING_STATION = 'startChargingStation',
  STOP_CHARGING_STATION = 'stopChargingStation',
  OPEN_CONNECTION = 'openConnection',
  CLOSE_CONNECTION = 'closeConnection',
  START_AUTOMATIC_TRANSACTION_GENERATOR = 'startAutomaticTransactionGenerator',
  STOP_AUTOMATIC_TRANSACTION_GENERATOR = 'stopAutomaticTransactionGenerator',
  START_TRANSACTION = 'startTransaction',
  STOP_TRANSACTION = 'stopTransaction',
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
  hashIds?: string[];
}
