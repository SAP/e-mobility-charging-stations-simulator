import { JsonObject } from './JsonType';
import { WorkerData, WorkerMessage, WorkerMessageEvents } from './Worker';

export interface ChargingStationWorkerOptions extends JsonObject {
  elementStartDelay?: number;
}

export interface ChargingStationWorkerData extends WorkerData {
  index: number;
  templateFile: string;
  chargingStationWorkerOptions?: ChargingStationWorkerOptions;
}

enum ChargingStationMessageEvents {
  STARTED = 'started',
  STOPPED = 'stopped',
  // UPDATED = 'updated',
  PERFORMANCE_STATISTICS = 'performanceStatistics',
}

export type ChargingStationWorkerMessageEvents = WorkerMessageEvents | ChargingStationMessageEvents;

export const ChargingStationWorkerMessageEvents = {
  ...WorkerMessageEvents,
  ...ChargingStationMessageEvents,
};

export interface ChargingStationWorkerMessage<T extends WorkerData>
  extends Omit<WorkerMessage<T>, 'id'> {
  id: ChargingStationWorkerMessageEvents;
}
