import { JsonType } from './JsonType';

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

export type ProtocolRequest = [string, ProcedureName, JsonType];
export type ProtocolResponse = [string, JsonType];

export type ProtocolRequestHandler = (
  payload: JsonType
) => void | Promise<void> | JsonType | Promise<JsonType>;
