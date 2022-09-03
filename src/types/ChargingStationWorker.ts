import type { Status } from './AutomaticTransactionGenerator';
import type ChargingStationInfo from './ChargingStationInfo';
import type { ConnectorStatus } from './ConnectorStatus';
import type { JsonObject } from './JsonType';
import type { BootNotificationResponse } from './ocpp/Responses';
import type Statistics from './Statistics';
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
  wsState?: number;
  bootNotificationResponse: BootNotificationResponse;
  connectors: ConnectorStatus[];
  automaticTransactionGeneratorStatuses?: Status[];
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

export interface ChargingStationWorkerMessage<T extends WorkerData>
  extends Omit<WorkerMessage<T>, 'id'> {
  id: ChargingStationWorkerMessageEvents;
}
