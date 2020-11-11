import ChargingStationTemplate from './ChargingStationTemplate';

export default interface ChargingStationInfo extends ChargingStationTemplate {
  name?: string;
  chargeBoxSerialNumber?: string;
  maxPower?: number;
  powerDivider?: number;
}
