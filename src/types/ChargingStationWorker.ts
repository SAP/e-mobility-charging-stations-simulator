import type { WebSocket } from 'ws';

import type { ChargingStationAutomaticTransactionGeneratorConfiguration } from './AutomaticTransactionGenerator';
import type { ChargingStationInfo } from './ChargingStationInfo';
import type { ConnectorStatus } from './ConnectorStatus';
import type { JsonObject } from './JsonType';
import type { BootNotificationResponse } from './ocpp/Responses';
import type { Statistics } from './Statistics';
import { WorkerData, WorkerMessage, WorkerMessageEvents } from './Worker';

export interface ChargingStationWorkerOptions extends JsonObject {
  elementStartDelay?: number;
}

export interface ChargingStationWorkerData extends WorkerData {
  index: number;
  templateFile: string;
  chargingStationWorkerOptions?: ChargingStationWorkerOptions;
}

export interface ChargingStationData extends WorkerData {
  stationInfo: ChargingStationInfo;
  started: boolean;
  wsState?:
    | typeof WebSocket.CONNECTING
    | typeof WebSocket.OPEN
    | typeof WebSocket.CLOSING
    | typeof WebSocket.CLOSED;
  bootNotificationResponse: BootNotificationResponse;
  connectors: ConnectorStatus[];
  automaticTransactionGenerator?: ChargingStationAutomaticTransactionGeneratorConfiguration;
}

enum ChargingStationMessageEvents {
  STARTED = 'started',
  STOPPED = 'stopped',
  UPDATED = 'updated',
  PERFORMANCE_STATISTICS = 'performanceStatistics',
}

export type ChargingStationWorkerMessageEvents = WorkerMessageEvents | ChargingStationMessageEvents;

export const ChargingStationWorkerMessageEvents = {
  ...WorkerMessageEvents,
  ...ChargingStationMessageEvents,
};

export type ChargingStationWorkerMessageData = ChargingStationData | Statistics;

export type ChargingStationWorkerMessage<T extends ChargingStationWorkerMessageData> = Omit<
  WorkerMessage<T>,
  'id'
> & {
  id: ChargingStationWorkerMessageEvents;
};
