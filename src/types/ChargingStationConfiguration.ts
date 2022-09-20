import type { ChargingStationAutomaticTransactionGeneratorConfiguration } from './AutomaticTransactionGenerator';
import type { ChargingStationInfoConfiguration } from './ChargingStationInfo';
import type { ChargingStationOcppConfiguration } from './ChargingStationOcppConfiguration';

export type ChargingStationConfiguration = ChargingStationInfoConfiguration &
  ChargingStationOcppConfiguration &
  ChargingStationAutomaticTransactionGeneratorConfiguration & {
    configurationHash?: string;
  };
