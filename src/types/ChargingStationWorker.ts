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

// export interface ChargingStationUI {
//   hashId: string;
//   data: {
//     id: string;
//     stationInfo: ChargingStationInfo;
//   };
// }

enum ChargingStationMessageEvents {
  STARTED = 'started',
  STOPPED = 'stopped',
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
  data: unknown;
  id: ChargingStationWorkerMessageEvents;
}
