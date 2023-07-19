import type { WebSocket } from 'ws';

import type { ChargingStationAutomaticTransactionGeneratorConfiguration } from './AutomaticTransactionGenerator';
import type { ChargingStationInfo } from './ChargingStationInfo';
import type { ChargingStationOcppConfiguration } from './ChargingStationOcppConfiguration';
import type { ConnectorStatus } from './ConnectorStatus';
import type { EvseStatus } from './Evse';
import type { JsonObject } from './JsonType';
import type { BootNotificationResponse } from './ocpp/Responses';
import type { Statistics } from './Statistics';
import { type WorkerData, type WorkerMessage, WorkerMessageEvents } from '../worker';

interface ChargingStationWorkerOptions extends JsonObject {
  elementStartDelay?: number;
}

export interface ChargingStationWorkerData extends WorkerData {
  index: number;
  templateFile: string;
  chargingStationWorkerOptions?: ChargingStationWorkerOptions;
}

export type EvseStatusWorkerType = Omit<EvseStatus, 'connectors'> & {
  connectors?: ConnectorStatus[];
};

export interface ChargingStationData extends WorkerData {
  started: boolean;
  stationInfo: ChargingStationInfo;
  connectors: ConnectorStatus[];
  evses: EvseStatusWorkerType[];
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
  'event'
> & {
  event: ChargingStationWorkerMessageEvents;
};
