import ChargingStationInfo from './ChargingStationInfo';

export interface ChargingStationUI {
  hashId: string;
  data: {
    id: string;
    stationInfo: ChargingStationInfo;
  };
}
