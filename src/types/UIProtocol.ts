import { JsonArray, JsonType } from './JsonType';

export enum Protocol {
  UI = 'ui',
}

export enum ProtocolVersion {
  '0.0.1' = '0.0.1',
}

export enum ProtocolCommand {
  LIST_CHARGING_STATIONS = 'listChargingStations',
  START_TRANSACTION = 'startTransaction',
  STOP_TRANSACTION = 'stopTransaction',
  UNKNOWN = 'unknown',
}

export type JsonTemp = JsonType | JsonArray; // until JsonType is fixed

export type ProtocolRequest = [ProtocolCommand, JsonTemp];

export type ProtocolRequestHandler = (payload: JsonTemp) => JsonTemp | Promise<JsonTemp>;
