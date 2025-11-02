import type { EmptyObject } from '../../EmptyObject.js'
import type { JsonObject } from '../../JsonType.js'
import type { CustomDataType } from './Common.js'

export enum OCPP20LocationEnumType {
  Body = 'Body',
  Cable = 'Cable',
  EV = 'EV',
  Inlet = 'Inlet',
  Outlet = 'Outlet',
}

export enum OCPP20MeasurandEnumType {
  CURRENT_EXPORT = 'Current.Export',
  CURRENT_IMPORT = 'Current.Import',
  CURRENT_OFFERED = 'Current.Offered',
  ENERGY_ACTIVE_EXPORT_INTERVAL = 'Energy.Active.Export.Interval',
  ENERGY_ACTIVE_EXPORT_REGISTER = 'Energy.Active.Export.Register',
  ENERGY_ACTIVE_IMPORT_INTERVAL = 'Energy.Active.Import.Interval',
  ENERGY_ACTIVE_IMPORT_REGISTER = 'Energy.Active.Import.Register',
  ENERGY_ACTIVE_NET = 'Energy.Active.Net',
  ENERGY_APPARENT_EXPORT = 'Energy.Apparent.Export',
  ENERGY_APPARENT_IMPORT = 'Energy.Apparent.Import',
  ENERGY_APPARENT_NET = 'Energy.Apparent.Net',
  ENERGY_REACTIVE_EXPORT_INTERVAL = 'Energy.Reactive.Export.Interval',
  ENERGY_REACTIVE_EXPORT_REGISTER = 'Energy.Reactive.Export.Register',
  ENERGY_REACTIVE_IMPORT_INTERVAL = 'Energy.Reactive.Import.Interval',
  ENERGY_REACTIVE_IMPORT_REGISTER = 'Energy.Reactive.Import.Register',
  ENERGY_REACTIVE_NET = 'Energy.Reactive.Net',
  FREQUENCY = 'Frequency',
  POWER_ACTIVE_EXPORT = 'Power.Active.Export',
  POWER_ACTIVE_IMPORT = 'Power.Active.Import',
  POWER_FACTOR = 'Power.Factor',
  POWER_OFFERED = 'Power.Offered',
  POWER_REACTIVE_EXPORT = 'Power.Reactive.Export',
  POWER_REACTIVE_IMPORT = 'Power.Reactive.Import',
  STATE_OF_CHARGE = 'SoC',
  VOLTAGE = 'Voltage',
}

export enum OCPP20PhaseEnumType {
  L1 = 'L1',
  L1_L2 = 'L1-L2',
  L1_N = 'L1-N',
  L2 = 'L2',
  L2_L3 = 'L2-L3',
  L2_N = 'L2-N',
  L3 = 'L3',
  L3_L1 = 'L3-L1',
  L3_N = 'L3-N',
  N = 'N',
}

export enum OCPP20ReadingContextEnumType {
  INTERRUPTION_BEGIN = 'Interruption.Begin',
  INTERRUPTION_END = 'Interruption.End',
  OTHER = 'Other',
  SAMPLE_CLOCK = 'Sample.Clock',
  SAMPLE_PERIODIC = 'Sample.Periodic',
  TRANSACTION_BEGIN = 'Transaction.Begin',
  TRANSACTION_END = 'Transaction.End',
  TRIGGER = 'Trigger',
}

export enum OCPP20UnitEnumType {
  AMP = 'A',
  ARBITRARY_STRENGTH_UNIT = 'ASU',
  BYTES = 'B',
  CELSIUS = 'Celsius',
  CHARS = 'chars', // Custom extension for character count measurements
  DECIBEL = 'dB',
  DECIBEL_MILLIWATT = 'dBm', // cspell:ignore MILLIWATT
  DEGREES = 'Deg',
  FAHRENHEIT = 'Fahrenheit',
  HERTZ = 'Hz',
  KELVIN = 'K',
  KILO_PASCAL = 'kPa',
  KILO_VAR = 'kvar',
  KILO_VAR_HOUR = 'kvarh',
  KILO_VOLT_AMP = 'kVA',
  KILO_VOLT_AMP_HOUR = 'kVAh',
  KILO_WATT = 'kW',
  KILO_WATT_HOUR = 'kWh',
  LUX = 'lx',
  METER = 'm',
  METER_PER_SECOND_SQUARED = 'ms2',
  NEWTON = 'N',
  OHM = 'Ohm',
  PERCENT = 'Percent',
  RELATIVE_HUMIDITY = 'RH',
  REVOLUTIONS_PER_MINUTE = 'RPM',
  SECONDS = 's',
  VAR = 'var',
  VAR_HOUR = 'varh',
  VOLT = 'V',
  VOLT_AMP = 'VA',
  VOLT_AMP_HOUR = 'VAh',
  WATT = 'W',
  WATT_HOUR = 'Wh',
}

export interface OCPP20MeterValue extends JsonObject {
  customData?: CustomDataType
  sampledValue: OCPP20SampledValue[] // minItems: 1
  timestamp: Date
}

export interface OCPP20MeterValuesRequest extends JsonObject {
  customData?: CustomDataType
  evseId: number
  meterValue: OCPP20MeterValue[] // minItems: 1
}

export type OCPP20MeterValuesResponse = EmptyObject

export interface OCPP20SampledValue extends JsonObject {
  context?: OCPP20ReadingContextEnumType
  customData?: CustomDataType
  location?: OCPP20LocationEnumType
  measurand?: OCPP20MeasurandEnumType
  phase?: OCPP20PhaseEnumType
  signedMeterValue?: OCPP20SignedMeterValue
  unitOfMeasure?: OCPP20UnitOfMeasure
  value: number
}

export interface OCPP20SignedMeterValue extends JsonObject {
  customData?: CustomDataType
  encodingMethod: string // maxLength: 50
  publicKey: string // Base64 encoded, maxLength: 2500
  signedMeterData: string // Base64 encoded, maxLength: 2500
  signingMethod: string // maxLength: 50
}

export interface OCPP20UnitOfMeasure extends JsonObject {
  customData?: CustomDataType
  multiplier?: number // Default: 0
  unit?: OCPP20UnitEnumType
}
