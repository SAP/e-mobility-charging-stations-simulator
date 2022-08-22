import { ConnectorStatus } from './ConnectorStatus';
import { WorkerData } from './Worker';

// TODO: use a base UI payload type and extends it per procedure name
export interface SimulatorUI extends WorkerData {
  hashId: string;
  stationInfo: ChargingStationInfoUI;
  connectors: ConnectorStatus[];
  connectorId?: number;
  idTag?: string | null;
}

export type ChargingStationInfoUI = {
  chargePointModel: string;
  chargePointVendor: string;
  chargingStationId?: string;
  firmwareVersion?: string;
  numberOfConnectors?: number | number[];
};
