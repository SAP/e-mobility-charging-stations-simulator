import type { ChargingStationTemplate, FirmwareStatus } from './internal';

enum x509CertificateType {
  V2GRootCertificate = 'V2GRootCertificate',
  MORootCertificate = 'MORootCertificate',
  CSMSRootCertificate = 'CSMSRootCertificate',
  ManufacturerRootCertificate = 'ManufacturerRootCertificate',
  ChargingStationCertificate = 'ChargingStationCertificate',
  V2GCertificate = 'V2GCertificate',
}

export type ChargingStationInfo = Omit<
  ChargingStationTemplate,
  | 'AutomaticTransactionGenerator'
  | 'Configuration'
  | 'power'
  | 'powerUnit'
  | 'chargeBoxSerialNumberPrefix'
  | 'chargePointSerialNumberPrefix'
  | 'meterSerialNumberPrefix'
> & {
  hashId: string;
  infoHash?: string;
  chargingStationId?: string;
  chargeBoxSerialNumber?: string;
  chargePointSerialNumber?: string;
  meterSerialNumber?: string;
  maximumPower?: number; // Always in Watt
  maximumAmperage?: number; // Always in Ampere
  firmwareStatus?: FirmwareStatus;
  x509Certificates?: Record<x509CertificateType, string>;
};

export type ChargingStationInfoConfiguration = {
  stationInfo?: ChargingStationInfo;
};
