import { JsonObject, JsonType } from './JsonType';

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

export enum ProcedureName {
  LIST_CHARGING_STATIONS = 'listChargingStations',
  START_TRANSACTION = 'startTransaction',
  STOP_TRANSACTION = 'stopTransaction',
  START_SIMULATOR = 'startSimulator',
  STOP_SIMULATOR = 'stopSimulator',
}

export enum ResponseStatus {
  SUCCESS = 'success',
  FAILURE = 'failure',
}

export interface ResponsePayload extends JsonObject {
  status: ResponseStatus;
}

export type ProtocolRequest = [string, ProcedureName, JsonType];
export type ProtocolResponse = [string, ResponsePayload];

export type ProtocolRequestHandler = (
  payload: JsonType
) => void | Promise<void> | ResponsePayload | Promise<ResponsePayload>;
