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

export interface InternalChargingStationWorkerData {
  id: string;
  hashId: string;
  stationInfo: ChargingStationInfo;
}

enum InternalChargingStationWorkerMessageEvents {
  STARTED = 'started',
  STOPPED = 'stopped',
  PERFORMANCE_STATISTICS = 'performanceStatistics',
}

export type ChargingStationWorkerMessageEvents =
  | WorkerMessageEvents
  | InternalChargingStationWorkerMessageEvents;

export const ChargingStationWorkerMessageEvents = {
  ...WorkerMessageEvents,
  ...InternalChargingStationWorkerMessageEvents,
};

export type ChargingStationWorkerMessage = WorkerMessage<ChargingStationWorkerData>;
//   extends Omit<WorkerMessage<ChargingStationWorkerData>, 'id'> {
//   id: WorkerMessageEvents;
// }

export interface InternalChargingStationWorkerMessage
  extends Omit<WorkerMessage<InternalChargingStationWorkerData> | WorkerMessage<Statistics>, 'id'> {
  id: InternalChargingStationWorkerMessageEvents;
}

export type OverallChargingStationWorkerMessage =
  | ChargingStationWorkerMessage
  | InternalChargingStationWorkerMessage;
