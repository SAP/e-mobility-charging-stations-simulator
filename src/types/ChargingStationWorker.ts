import type { WebSocket } from 'ws';

import type {
  BootNotificationResponse,
  ChargingStationAutomaticTransactionGeneratorConfiguration,
  ChargingStationInfo,
  ConnectorStatus,
  JsonObject,
  Statistics,
} from './internal';
import { type WorkerData, type WorkerMessage, WorkerMessageEvents } from '../worker';

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
  bootNotificationResponse?: BootNotificationResponse;
  connectors: ConnectorStatus[];
  automaticTransactionGenerator?: ChargingStationAutomaticTransactionGeneratorConfiguration;
}

enum ChargingStationMessageEvents {
  STARTED = 'started',
  STOPPED = 'stopped',
  UPDATED = 'updated',
  PERFORMANCE_STATISTICS = 'performanceStatistics',
}

export const ChargingStationWorkerMessageEvents = {
  ...WorkerMessageEvents,
  ...ChargingStationMessageEvents,
} as const;
export type ChargingStationWorkerMessageEvents = WorkerMessageEvents | ChargingStationMessageEvents;

export type ChargingStationWorkerMessageData = ChargingStationData | Statistics;

export type ChargingStationWorkerMessage<T extends ChargingStationWorkerMessageData> = Omit<
  WorkerMessage<T>,
  'id'
> & {
  id: ChargingStationWorkerMessageEvents;
};
