import { WorkerData, WorkerMessage, WorkerMessageEvents } from './Worker';

export interface ChargingStationWorkerData extends WorkerData {
  index: number;
  templateFile: string;
}

enum InternalChargingStationWorkerMessageEvents {
  PERFORMANCE_STATISTICS = 'performanceStatistics'
}

export type ChargingStationWorkerMessageEvents = WorkerMessageEvents | InternalChargingStationWorkerMessageEvents;

export const ChargingStationWorkerMessageEvents = {
  ...WorkerMessageEvents,
  ...InternalChargingStationWorkerMessageEvents
};


export interface ChargingStationWorkerMessage extends Omit<WorkerMessage, 'id'> {
  id: ChargingStationWorkerMessageEvents;
}
