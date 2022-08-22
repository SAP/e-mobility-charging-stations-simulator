import { ConnectorStatus } from './ConnectorStatus';
import { WorkerData } from './Worker';

export interface SimulatorUI extends WorkerData {
  hashId: string;
  stationInfo: ChargingStationInfoUI;
  connectors: ConnectorStatus[];
}

export type ChargingStationInfoUI = {
  chargePointModel: string;
  chargePointVendor: string;
  chargingStationId?: string;
  firmwareVersion?: string;
};
