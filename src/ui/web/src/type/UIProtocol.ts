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

export enum MessageCode {
  REQUEST = 0,
  ANSWER = 1,
  ERROR = 2,
}

export type ProtocolMessage = [MessageCode, ...ProtocolRequest];

export type ProtocolRequest = [number, ...ProtocolCommand];

export enum CommandCode {
  LIST_CHARGING_STATIONS = 'listChargingStations',
  START_TRANSACTION = 'startTransaction',
  STOP_TRANSACTION = 'stopTransaction',
}

export type ProtocolCommand = [CommandCode, JsonType];

export type ProtocolRequestHandler = (
  payload: JsonType
) => void | Promise<void> | JsonType | Promise<JsonType>;
