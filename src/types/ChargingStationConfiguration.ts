import type { ChargingStationInfoConfiguration } from './ChargingStationInfo';
import type ChargingStationOcppConfiguration from './ChargingStationOcppConfiguration';

export default interface ChargingStationConfiguration
  extends ChargingStationInfoConfiguration,
    ChargingStationOcppConfiguration {
  configurationHash?: string;
}
