import type { ChargingStationAutomaticTransactionGeneratorConfiguration } from './AutomaticTransactionGenerator';
import type { ChargingStationInfoConfiguration } from './ChargingStationInfo';
import type { ChargingStationOcppConfiguration } from './ChargingStationOcppConfiguration';
import type { ConnectorStatus } from './ConnectorStatus';
import type { EvseStatus } from './Evse';

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
