import { ConnectorStatus } from './ConnectorStatus';

export type SimulatorUI = {
  hashId: string;
  stationInfo: ChargingStationInfoUI;
  connectors: Array<ConnectorStatus>;
};

export type ChargingStationInfoUI = {
  chargePointModel: string;
  chargePointVendor: string;
  chargingStationId?: string;
  firmwareVersion?: string;
};
