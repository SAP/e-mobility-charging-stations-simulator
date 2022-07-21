import ChargingStationInfo from './ChargingStationInfo';
import { ConnectorStatus } from './ConnectorStatus';

export type SimulatorUI = {
  hashId: string;
  stationInfo: ChargingStationInfo;
  connectors: Array<ConnectorStatus>;
};

export type ChargingStationInfoUI = {
  chargePointModel: string;
  chargePointVendor: string;
  chargingStationId?: string;
  firmwareVersion?: string;
  numberOfConnectors?: number | number[];
};
