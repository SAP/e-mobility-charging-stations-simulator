import type {
  ChargingStationAutomaticTransactionGeneratorConfiguration,
  ChargingStationInfoConfiguration,
  ChargingStationOcppConfiguration,
} from './internal';

export type ChargingStationConfiguration = ChargingStationInfoConfiguration &
  ChargingStationOcppConfiguration &
  ChargingStationAutomaticTransactionGeneratorConfiguration & {
    configurationHash?: string;
  };
