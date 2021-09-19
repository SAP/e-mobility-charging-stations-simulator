import { EmptyObject } from '../../EmptyObject';

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
  PERCENT = 'Percent'
}

export enum MeterValueContext {
  INTERRUPTION_BEGIN = 'Interruption.Begin',
  INTERRUPTION_END = 'Interruption.End',
  OTHER = 'Other',
  SAMPLE_CLOCK = 'Sample.Clock',
  SAMPLE_PERIODIC = 'Sample.Periodic',
  TRANSACTION_BEGIN = 'Transaction.Begin',
  TRANSACTION_END = 'Transaction.End',
  TRIGGER = 'Trigger'
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
  VOLTAGE = 'Voltage'
}

export enum MeterValueLocation {
  BODY = 'Body',
  CABLE = 'Cable',
  EV = 'EV',
  INLET = 'Inlet',
  OUTLET = 'Outlet'
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
  L3_L1 = 'L3-L1'
}

export enum MeterValueFormat {
  RAW = 'Raw',
  SIGNED_DATA = 'SignedData',
}

export interface OCPP16SampledValue {
  value?: string;
  unit?: MeterValueUnit;
  context?: MeterValueContext;
  measurand?: OCPP16MeterValueMeasurand;
  phase?: OCPP16MeterValuePhase;
  location?: MeterValueLocation;
  format?: MeterValueFormat;
}

export interface OCPP16MeterValue {
  timestamp: string;
  sampledValue: OCPP16SampledValue[];
}

export interface MeterValuesRequest {
  connectorId: number;
  transactionId?: number;
  meterValue: OCPP16MeterValue[];
}

export type MeterValuesResponse = EmptyObject;

