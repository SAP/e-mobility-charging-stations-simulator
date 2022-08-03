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

export enum CommandCode {
  LIST_CHARGING_STATIONS = 'listChargingStations',
  START_TRANSACTION = 'startTransaction',
  STOP_TRANSACTION = 'stopTransaction',
}

export type ProtocolMessage = ProtocolRequest;

export type ProtocolRequest = [uuidType, CommandCode, JsonType];

export type uuidType = string;

export type ProtocolRequestHandler = (
  payload: JsonType
) => void | Promise<void> | JsonType | Promise<JsonType>;
