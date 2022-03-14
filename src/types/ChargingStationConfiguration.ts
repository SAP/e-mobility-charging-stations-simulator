import { ChargingStationInfoConfiguration } from './ChargingStationInfo';
import ChargingStationOcppConfiguration from './ChargingStationOcppConfiguration';

export enum Section {
  ocppConfiguration,
  stationInfo,
}

export default interface ChargingStationConfiguration
  extends ChargingStationInfoConfiguration,
    ChargingStationOcppConfiguration {}
