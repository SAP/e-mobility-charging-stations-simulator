import { WorkerData, WorkerMessage, WorkerMessageEvents } from './Worker';

import ChargingStationInfo from './ChargingStationInfo';
import { JsonObject } from './JsonType';
import { SimulatorUI } from './SimulatorUI';
import Statistics from './Statistics';

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
  UPDATE = 'update',
  PERFORMANCE_STATISTICS = 'performanceStatistics',
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
  id: ChargingStationWorkerMessageEvents;
  payload: SimulatorUI | Statistics;
}
