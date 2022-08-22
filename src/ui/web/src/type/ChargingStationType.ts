export type ChargingStationData = {
  hashId: string;
  stationInfo: ChargingStationInfo;
  connectors: ConnectorStatus[];
};

export type ChargingStationInfo = {
  chargingStationId?: string;
  chargePointModel: string;
  chargePointVendor: string;
  firmwareVersion?: string;
  numberOfConnectors?: number | number[];
  baseName: string;
  infoHash?: string;
  chargeBoxSerialNumber?: string;
  chargePointSerialNumber?: string;
  meterSerialNumber?: string;
  maximumPower?: number; // Always in Watt
  maximumAmperage?: number; // Always in Ampere
  templateHash?: string;
  supervisionUrls?: string | string[];
  supervisionUrlOcppConfiguration?: boolean;
  supervisionUrlOcppKey?: string;
  supervisionUser?: string;
  supervisionPassword?: string;
  ocppVersion?: OCPPVersion;
  ocppProtocol?: OCPPProtocol;
  ocppStrictCompliance?: boolean;
  ocppPersistentConfiguration?: boolean;
  stationInfoPersistentConfiguration?: boolean;
  authorizationFile?: string;
  nameSuffix?: string;
  fixedName?: boolean;
  iccid?: string;
  imsi?: string;
  meterType?: string;
  powerSharedByConnectors?: boolean;
  currentOutType?: CurrentType;
  voltageOut?: Voltage;
  numberOfPhases?: number;
  useConnectorId0?: boolean;
  randomConnectors?: boolean;
  resetTime?: number;
  autoRegister?: boolean;
  autoReconnectMaxRetries?: number;
  reconnectExponentialDelay?: boolean;
  registrationMaxRetries?: number;
  enableStatistics?: boolean;
  mayAuthorizeAtRemoteStart: boolean;
  amperageLimitationOcppKey?: string;
  amperageLimitationUnit?: AmpereUnits;
  beginEndMeterValues?: boolean;
  outOfOrderEndMeterValues?: boolean;
  meteringPerTransaction?: boolean;
  transactionDataMeterValues?: boolean;
  mainVoltageMeterValues?: boolean;
  phaseLineToLineVoltageMeterValues?: boolean;
  customValueLimitationMeterValues?: boolean;
  // commandsSupport?: CommandsSupport;
};

export enum OCPPVersion {
  VERSION_16 = '1.6',
  VERSION_20 = '2.0',
}

export enum OCPPProtocol {
  SOAP = 'soap',
  JSON = 'json',
}

export enum CurrentType {
  AC = 'AC',
  DC = 'DC',
}

export enum Voltage {
  VOLTAGE_110 = 110,
  VOLTAGE_230 = 230,
  VOLTAGE_400 = 400,
  VOLTAGE_800 = 800,
}

export enum AmpereUnits {
  MILLI_AMPERE = 'mA',
  CENTI_AMPERE = 'cA',
  DECI_AMPERE = 'dA',
  AMPERE = 'A',
}

export type ConnectorStatus = {
  availability: AvailabilityType;
  bootStatus?: ChargePointStatus;
  status?: ChargePointStatus;
  authorizeIdTag?: string;
  idTagAuthorized?: boolean;
  localAuthorizeIdTag?: string;
  idTagLocalAuthorized?: boolean;
  transactionRemoteStarted?: boolean;
  transactionStarted?: boolean;
  transactionId?: number;
  transactionIdTag?: string;
  energyActiveImportRegisterValue?: number; // In Wh
  transactionEnergyActiveImportRegisterValue?: number; // In Wh
};

export type AvailabilityType = OCPP16AvailabilityType;

export enum OCPP16AvailabilityType {
  INOPERATIVE = 'Inoperative',
  OPERATIVE = 'Operative',
}

export type ChargePointStatus = OCPP16ChargePointStatus;

export enum OCPP16ChargePointStatus {
  AVAILABLE = 'Available',
  PREPARING = 'Preparing',
  CHARGING = 'Charging',
  OCCUPIED = 'Occupied',
  SUSPENDED_EVSE = 'SuspendedEVSE',
  SUSPENDED_EV = 'SuspendedEV',
  FINISHING = 'Finishing',
  RESERVED = 'Reserved',
  UNAVAILABLE = 'Unavailable',
  FAULTED = 'Faulted',
}
