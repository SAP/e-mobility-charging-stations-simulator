import ChargingStationTemplate from './ChargingStationTemplate';

export default interface ChargingStationInfo extends ChargingStationTemplate {
  infoHash?: string;
  chargingStationId?: string;
  chargeBoxSerialNumber?: string;
  chargePointSerialNumber?: string;
  meterSerialNumber?: string;
  maximumPower?: number; // Always in Watt
  powerDivider?: number;
  maximumAmperage?: number; // Always in Ampere
}

export interface ChargingStationInfoConfiguration {
  stationInfo?: ChargingStationInfo;
}
