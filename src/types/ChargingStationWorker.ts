import { WorkerData, WorkerMessage, WorkerMessageEvents } from './Worker';

import ChargingStationInfo from './ChargingStationInfo';
import { JsonObject } from './JsonType';

export interface ChargingStationWorkerOptions extends JsonObject {
  elementStartDelay?: number;
}

export interface ChargingStationWorkerData extends WorkerData {
  index: number;
  templateFile: string;
  chargingStationWorkerOptions?: ChargingStationWorkerOptions;
}

export interface ChargingStationSubData {
  id: string;
  stationInfo: ChargingStationInfo;
}

export interface ChargingStationData {
  hashId: string;
  data: ChargingStationSubData;
}

enum ChargingStationMessageEvents {
  STARTED = 'started',
  STOPPED = 'stopped',
  PERFORMANCE_STATISTICS = 'performanceStatistics',
}

export interface ChargingStationMessage {
  data: ChargingStationData;
  id: ChargingStationMessageEvents;
}

export type ChargingStationWorkerMessageEvents = WorkerMessageEvents | ChargingStationMessageEvents;

export const ChargingStationWorkerMessageEvents = {
  ...WorkerMessageEvents,
  ...ChargingStationMessageEvents,
};

export interface ChargingStationWorkerMessage
  extends Omit<WorkerMessage<ChargingStationWorkerData>, 'id'> {
  id: ChargingStationWorkerMessageEvents;
}

export interface InternalChargingStationWorkerMessage {
  data: unknown;
  id: ChargingStationWorkerMessageEvents;
}
