import ChargingStationTemplate from './ChargingStationTemplate';

export default interface ChargingStationInfo extends ChargingStationTemplate {
  chargingStationId?: string;
  chargeBoxSerialNumber?: string;
  maxPower?: number; // Always in Watt
  powerDivider?: number;
}
