import { ChargingStationInfoConfiguration } from './ChargingStationInfo';
import ChargingStationOcppConfiguration from './ChargingStationOcppConfiguration';

export default interface ChargingStationConfiguration
  extends ChargingStationInfoConfiguration,
    ChargingStationOcppConfiguration {
  configurationHash?: string;
}
