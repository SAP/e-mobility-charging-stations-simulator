import type ChargingStationTemplate from './ChargingStationTemplate';

export default interface ChargingStationInfo
  extends Omit<
    ChargingStationTemplate,
    | 'AutomaticTransactionGenerator'
    | 'Configuration'
    | 'power'
    | 'powerUnit'
    | 'chargeBoxSerialNumberPrefix'
    | 'chargePointSerialNumberPrefix'
    | 'meterSerialNumberPrefix'
  > {
  hashId: string;
  infoHash?: string;
  chargingStationId?: string;
  chargeBoxSerialNumber?: string;
  chargePointSerialNumber?: string;
  meterSerialNumber?: string;
  maximumPower?: number; // Always in Watt
  maximumAmperage?: number; // Always in Ampere
}

export type ChargingStationInfoConfiguration = {
  stationInfo?: ChargingStationInfo;
};
