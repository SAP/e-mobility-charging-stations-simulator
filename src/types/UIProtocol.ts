
export enum ProtocolVersion {
  '0.0.1' = '0.0.1',
  '0.0.2' = '0.0.2',
}

export enum ProtocolCommand {
  LIST_CHARGING_STATIONS = 'listChargingStations',
  START_TRANSACTION = 'startTransaction',
  STOP_TRANSACTION = 'stopTransaction',
  UNKNOWN = 'unknown',
}

export type ProtocolRequest = [ProtocolVersion, ProtocolCommand, Record<string, unknown>];

export type ProtocolRequestHandler = (payload: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown>>;
