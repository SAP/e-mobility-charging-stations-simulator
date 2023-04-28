import type {
  ChargingStationAutomaticTransactionGeneratorConfiguration,
  ChargingStationInfoConfiguration,
  ChargingStationOcppConfiguration,
  ConnectorStatus,
  EvseStatus,
} from './internal';

type ConnectorsConfiguration = {
  connectorsStatus?: ConnectorStatus[];
};

export type EvseStatusConfiguration = Omit<EvseStatus, 'connectors'> & {
  connectorsStatus?: ConnectorStatus[];
};

type EvsesConfiguration = {
  evsesStatus?: EvseStatusConfiguration[];
};

export type ChargingStationConfiguration = ChargingStationInfoConfiguration &
  ChargingStationOcppConfiguration &
  ChargingStationAutomaticTransactionGeneratorConfiguration &
  ConnectorsConfiguration &
  EvsesConfiguration & {
    configurationHash?: string;
  };
