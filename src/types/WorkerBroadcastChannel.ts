import { ChargingStationData } from './ChargingStationWorker';

// TODO: use a base payload type and extends it per procedure name
export interface WorkerBroadcastChannelData extends ChargingStationData {
  connectorId?: number;
  transactionId?: number;
  idTag?: string;
}
