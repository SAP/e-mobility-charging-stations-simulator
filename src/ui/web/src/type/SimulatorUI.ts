import { JsonObject } from '@/type/JsonType';

export type SimulatorUI = {
  hashId: string;
  stationInfo: ChargingStationInfoUI;
  connectors: ConnectorStatus[];
};

export type ChargingStationInfoUI = {
  chargingStationId?: string;
  chargePointModel: string;
  chargePointVendor: string;
  firmwareVersion?: string;
  numberOfConnectors?: number | number[];
  /*
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
  */
};
/*
export enum OCPPVersion {
  VERSION_12 = '1.2',
  VERSION_15 = '1.5',
  VERSION_16 = '1.6',
  VERSION_20 = '2.0',
}

export enum OCPPProtocol {
  SOAP = 'soap',
  JSON = 'json',
}
*/

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

export interface SampledValueTemplate extends SampledValue {
  fluctuationPercent?: number;
}

export type SampledValue = OCPP16SampledValue;

export interface OCPP16SampledValue extends JsonObject {
  value?: string;
  unit?: MeterValueUnit;
  context?: MeterValueContext;
  measurand?: OCPP16MeterValueMeasurand;
  phase?: OCPP16MeterValuePhase;
  location?: MeterValueLocation;
  format?: MeterValueFormat;
}

export enum MeterValueUnit {
  WATT_HOUR = 'Wh',
  KILO_WATT_HOUR = 'kWh',
  VAR_HOUR = 'varh',
  KILO_VAR_HOUR = 'kvarh',
  WATT = 'W',
  KILO_WATT = 'kW',
  VOLT_AMP = 'VA',
  KILO_VOLT_AMP = 'kVA',
  VAR = 'var',
  KILO_VAR = 'kvar',
  AMP = 'A',
  VOLT = 'V',
  TEMP_CELSIUS = 'Celsius',
  TEMP_FAHRENHEIT = 'Fahrenheit',
  TEMP_KELVIN = 'K',
  PERCENT = 'Percent',
}

export enum MeterValueContext {
  INTERRUPTION_BEGIN = 'Interruption.Begin',
  INTERRUPTION_END = 'Interruption.End',
  OTHER = 'Other',
  SAMPLE_CLOCK = 'Sample.Clock',
  SAMPLE_PERIODIC = 'Sample.Periodic',
  TRANSACTION_BEGIN = 'Transaction.Begin',
  TRANSACTION_END = 'Transaction.End',
  TRIGGER = 'Trigger',
}

export enum OCPP16MeterValueMeasurand {
  CURRENT_EXPORT = 'Current.Export',
  CURRENT_IMPORT = 'Current.Import',
  CURRENT_OFFERED = 'Current.Offered',
  ENERGY_ACTIVE_EXPORT_REGISTER = 'Energy.Active.Export.Register',
  ENERGY_ACTIVE_IMPORT_REGISTER = 'Energy.Active.Import.Register',
  ENERGY_REACTIVE_EXPORT_REGISTER = 'Energy.Reactive.Export.Register',
  ENERGY_REACTIVE_IMPORT_REGISTER = 'Energy.Reactive.Import.Register',
  ENERGY_ACTIVE_EXPORT_INTERVAL = 'Energy.Active.Export.Interval',
  ENERGY_ACTIVE_IMPORT_INTERVAL = 'Energy.Active.Import.Interval',
  ENERGY_REACTIVE_EXPORT_INTERVAL = 'Energy.Reactive.Export.Interval',
  ENERGY_REACTIVE_IMPORT_INTERVAL = 'Energy.Reactive.Import.Interval',
  FREQUENCY = 'Frequency',
  POWER_ACTIVE_EXPORT = 'Power.Active.Export',
  POWER_ACTIVE_IMPORT = 'Power.Active.Import',
  POWER_FACTOR = 'Power.Factor',
  POWER_OFFERED = 'Power.Offered',
  POWER_REACTIVE_EXPORT = 'Power.Reactive.Export',
  POWER_REACTIVE_IMPORT = 'Power.Reactive.Import',
  FAN_RPM = 'RPM',
  STATE_OF_CHARGE = 'SoC',
  TEMPERATURE = 'Temperature',
  VOLTAGE = 'Voltage',
}

export enum OCPP16MeterValuePhase {
  L1 = 'L1',
  L2 = 'L2',
  L3 = 'L3',
  N = 'N',
  L1_N = 'L1-N',
  L2_N = 'L2-N',
  L3_N = 'L3-N',
  L1_L2 = 'L1-L2',
  L2_L3 = 'L2-L3',
  L3_L1 = 'L3-L1',
}

export enum MeterValueLocation {
  BODY = 'Body',
  CABLE = 'Cable',
  EV = 'EV',
  INLET = 'Inlet',
  OUTLET = 'Outlet',
}

export enum MeterValueFormat {
  RAW = 'Raw',
  SIGNED_DATA = 'SignedData',
}
