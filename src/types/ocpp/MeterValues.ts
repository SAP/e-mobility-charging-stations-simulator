import {
  type OCPP16MeterValue,
  OCPP16MeterValueContext,
  OCPP16MeterValueLocation,
  OCPP16MeterValueMeasurand,
  OCPP16MeterValuePhase,
  OCPP16MeterValueUnit,
  type OCPP16SampledValue,
} from './1.6/MeterValues.js'
import { OCPP20UnitEnumType } from './2.0/Common.js'
import {
  OCPP20LocationEnumType,
  OCPP20MeasurandEnumType,
  type OCPP20MeterValue,
  OCPP20PhaseEnumType,
  OCPP20ReadingContextEnumType,
  type OCPP20SampledValue,
} from './2.0/MeterValues.js'

export type MeterValue = OCPP16MeterValue | OCPP20MeterValue

export const isOCPP16SampledValue = (
  sampledValue: OCPP16SampledValue | OCPP20SampledValue
): sampledValue is OCPP16SampledValue => typeof sampledValue.value === 'string'

export const isOCPP20SampledValue = (
  sampledValue: OCPP16SampledValue | OCPP20SampledValue
): sampledValue is OCPP20SampledValue => typeof sampledValue.value === 'number'

export const isOCPP16MeterValue = (meterValue: MeterValue): meterValue is OCPP16MeterValue => meterValue.sampledValue.length === 0 || meterValue.sampledValue.every(isOCPP16SampledValue)

export const isOCPP20MeterValue = (meterValue: MeterValue): meterValue is OCPP20MeterValue => meterValue.sampledValue.length > 0 && meterValue.sampledValue.every(isOCPP20SampledValue)

export const MeterValueUnit = {
  ...OCPP16MeterValueUnit,
  ...OCPP20UnitEnumType,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type MeterValueUnit = OCPP16MeterValueUnit | OCPP20UnitEnumType

export const MeterValueContext = {
  ...OCPP16MeterValueContext,
  ...OCPP20ReadingContextEnumType,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type MeterValueContext = OCPP16MeterValueContext | OCPP20ReadingContextEnumType

export const MeterValueLocation = {
  ...OCPP16MeterValueLocation,
  ...OCPP20LocationEnumType,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type MeterValueLocation = OCPP16MeterValueLocation | OCPP20LocationEnumType

export const MeterValueMeasurand = {
  ...OCPP16MeterValueMeasurand,
  ...OCPP20MeasurandEnumType,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type MeterValueMeasurand = OCPP16MeterValueMeasurand | OCPP20MeasurandEnumType

export const MeterValuePhase = {
  ...OCPP16MeterValuePhase,
  ...OCPP20PhaseEnumType,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type MeterValuePhase = OCPP16MeterValuePhase | OCPP20PhaseEnumType

export type SampledValue = OCPP16SampledValue | OCPP20SampledValue
