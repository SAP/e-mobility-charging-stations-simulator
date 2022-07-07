import ChargingStationInfo from './ChargingStationInfo';
import { JsonType } from './JsonType';
import { ProtocolRequest } from './UIProtocol';

export type Message = [number, ProtocolRequest];

export interface ChargingStationUI {
  hashId: string;
  data: {
    id: string;
    stationInfo: ChargingStationInfo;
  };
}
