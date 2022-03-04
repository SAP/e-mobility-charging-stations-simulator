import { WorkerData, WorkerMessage, WorkerMessageEvents } from './Worker';

import { JsonType } from './JsonType';

export interface ChargingStationWorkerOptions extends JsonType {
  elementStartDelay?: number;
}

export interface ChargingStationWorkerData extends WorkerData {
  index: number;
  templateFile: string;
  chargingStationWorkerOptions?: ChargingStationWorkerOptions;
}

enum InternalChargingStationWorkerMessageEvents {
  STARTED = 'started',
  STOPPED = 'stopped',
  PERFORMANCE_STATISTICS = 'performanceStatistics'
}

export type ChargingStationWorkerMessageEvents = WorkerMessageEvents | InternalChargingStationWorkerMessageEvents;

export const ChargingStationWorkerMessageEvents = {
  ...WorkerMessageEvents,
  ...InternalChargingStationWorkerMessageEvents
};


export interface ChargingStationWorkerMessage extends Omit<WorkerMessage<ChargingStationWorkerData>, 'id'> {
  id: ChargingStationWorkerMessageEvents;
}
