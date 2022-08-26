import ChargingStationInfo from './ChargingStationInfo';
import { ConnectorStatus } from './ConnectorStatus';
import { JsonObject } from './JsonType';
import { BootNotificationResponse } from './ocpp/Responses';
import Statistics from './Statistics';
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
  hashId: string;
  stationInfo: ChargingStationInfo;
  stopped: boolean;
  bootNotificationResponse: BootNotificationResponse;
  connectors: ConnectorStatus[];
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
