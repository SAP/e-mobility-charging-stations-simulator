import type { EmptyObject } from '../../EmptyObject.js'
import type { JsonObject } from '../../JsonType.js'

export enum OCPP16MeterValueUnit {
  AMP = 'A',
  KILO_VAR = 'kvar',
  KILO_VAR_HOUR = 'kvarh',
  KILO_VOLT_AMP = 'kVA',
  KILO_WATT = 'kW',
  KILO_WATT_HOUR = 'kWh',
  PERCENT = 'Percent',
  TEMP_CELSIUS = 'Celsius',
  TEMP_FAHRENHEIT = 'Fahrenheit',
  TEMP_KELVIN = 'K',
  VAR = 'var',
  VAR_HOUR = 'varh',
  VOLT = 'V',
  VOLT_AMP = 'VA',
  WATT = 'W',
  WATT_HOUR = 'Wh'
}

export enum OCPP16MeterValueContext {
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
  ENERGY_ACTIVE_EXPORT_INTERVAL = 'Energy.Active.Export.Interval',
  ENERGY_ACTIVE_EXPORT_REGISTER = 'Energy.Active.Export.Register',
  ENERGY_ACTIVE_IMPORT_INTERVAL = 'Energy.Active.Import.Interval',
  ENERGY_ACTIVE_IMPORT_REGISTER = 'Energy.Active.Import.Register',
  ENERGY_REACTIVE_EXPORT_INTERVAL = 'Energy.Reactive.Export.Interval',
  ENERGY_REACTIVE_EXPORT_REGISTER = 'Energy.Reactive.Export.Register',
  ENERGY_REACTIVE_IMPORT_INTERVAL = 'Energy.Reactive.Import.Interval',
  ENERGY_REACTIVE_IMPORT_REGISTER = 'Energy.Reactive.Import.Register',
  FAN_RPM = 'RPM',
  FREQUENCY = 'Frequency',
  POWER_ACTIVE_EXPORT = 'Power.Active.Export',
  POWER_ACTIVE_IMPORT = 'Power.Active.Import',
  POWER_FACTOR = 'Power.Factor',
  POWER_OFFERED = 'Power.Offered',
  POWER_REACTIVE_EXPORT = 'Power.Reactive.Export',
  POWER_REACTIVE_IMPORT = 'Power.Reactive.Import',
  STATE_OF_CHARGE = 'SoC',
  TEMPERATURE = 'Temperature',
  VOLTAGE = 'Voltage'
}

export enum OCPP16MeterValueLocation {
  BODY = 'Body',
  CABLE = 'Cable',
  EV = 'EV',
  INLET = 'Inlet',
  OUTLET = 'Outlet'
}

export enum OCPP16MeterValuePhase {
  L1 = 'L1',
  L1_L2 = 'L1-L2',
  L1_N = 'L1-N',
  L2 = 'L2',
  L2_L3 = 'L2-L3',
  L2_N = 'L2-N',
  L3 = 'L3',
  L3_L1 = 'L3-L1',
  L3_N = 'L3-N',
  N = 'N'
}

enum OCPP16MeterValueFormat {
  RAW = 'Raw',
  SIGNED_DATA = 'SignedData'
}

export interface OCPP16SampledValue extends JsonObject {
  context?: OCPP16MeterValueContext
  format?: OCPP16MeterValueFormat
  location?: OCPP16MeterValueLocation
  measurand?: OCPP16MeterValueMeasurand
  phase?: OCPP16MeterValuePhase
  unit?: OCPP16MeterValueUnit
  value: string
}

export interface OCPP16MeterValue extends JsonObject {
  sampledValue: OCPP16SampledValue[]
  timestamp: Date
}

export interface OCPP16MeterValuesRequest extends JsonObject {
  connectorId: number
  meterValue: OCPP16MeterValue[]
  transactionId?: number
}

export type OCPP16MeterValuesResponse = EmptyObject
