import { JsonObject } from './JsonType';

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
  LIST_CHARGING_STATIONS = 'listChargingStations',
  START_CHARGING_STATION = 'startChargingStation',
  STOP_CHARGING_STATION = 'stopChargingStation',
  START_TRANSACTION = 'startTransaction',
  STOP_TRANSACTION = 'stopTransaction',
  START_SIMULATOR = 'startSimulator',
  STOP_SIMULATOR = 'stopSimulator',
  OPEN_CONNECTION = 'openConnection',
  CLOSE_CONNECTION = 'closeConnection',
}
export interface RequestPayload extends JsonObject {
  hashId?: string;
  hashIds?: string[];
}

export enum ResponseStatus {
  SUCCESS = 'success',
  FAILURE = 'failure',
}

export interface ResponsePayload extends JsonObject {
  status: ResponseStatus;
}
