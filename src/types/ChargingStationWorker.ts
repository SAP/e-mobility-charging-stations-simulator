import { WorkerData, WorkerMessage, WorkerMessageEvents } from './Worker';

import ChargingStationInfo from '../types/ChargingStationInfo';
import { JsonType } from './JsonType';
import Statistics from './Statistics';

export interface ChargingStationWorkerOptions extends JsonType {
  elementStartDelay?: number;
}

export interface ChargingStationWorkerData extends WorkerData {
  index: number;
  templateFile: string;
  chargingStationWorkerOptions?: ChargingStationWorkerOptions;
}

export interface ChargingStationData {
  id: string;
  hashId: string;
  stationInfo: ChargingStationInfo;
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
