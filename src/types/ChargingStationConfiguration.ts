import { ChargingStationInfoConfiguration } from './ChargingStationInfo';
import ChargingStationOcppConfiguration from './ChargingStationOcppConfiguration';

// export enum Section {
//   configurationKey,
//   stationInfo,
// }

export default interface ChargingStationConfiguration
  extends ChargingStationInfoConfiguration,
    ChargingStationOcppConfiguration {
  configurationHash?: string;
}
