import type { WebSocket } from 'ws';

import type {
  BootNotificationResponse,
  ChargingStationAutomaticTransactionGeneratorConfiguration,
  ChargingStationInfo,
  ChargingStationOcppConfiguration,
  ConnectorStatus,
  EvseStatus,
  JsonObject,
  Statistics,
} from './internal';
import { type WorkerData, type WorkerMessage, WorkerMessageEvents } from '../worker';

interface ChargingStationWorkerOptions extends JsonObject {
  elementStartDelay?: number;
}

export interface ChargingStationWorkerData extends WorkerData {
  index: number;
  templateFile: string;
  chargingStationWorkerOptions?: ChargingStationWorkerOptions;
}

type EvseStatusType = Omit<EvseStatus, 'connectors'> & {
  connectors?: ConnectorStatus[];
};

export interface ChargingStationData extends WorkerData {
  started: boolean;
  stationInfo: ChargingStationInfo;
  connectors: ConnectorStatus[];
  evses: EvseStatusType[];
  ocppConfiguration: ChargingStationOcppConfiguration;
  wsState?:
    | typeof WebSocket.CONNECTING
    | typeof WebSocket.OPEN
    | typeof WebSocket.CLOSING
    | typeof WebSocket.CLOSED;
  bootNotificationResponse?: BootNotificationResponse;
  automaticTransactionGenerator?: ChargingStationAutomaticTransactionGeneratorConfiguration;
}

enum ChargingStationMessageEvents {
  started = 'started',
  stopped = 'stopped',
  updated = 'updated',
  performanceStatistics = 'performanceStatistics',
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
