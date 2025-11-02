import {
  type OCPP16MeterValue,
  OCPP16MeterValueContext,
  OCPP16MeterValueLocation,
  OCPP16MeterValueMeasurand,
  OCPP16MeterValuePhase,
  OCPP16MeterValueUnit,
  type OCPP16SampledValue,
} from './1.6/MeterValues.js'
import {
  OCPP20LocationEnumType,
  OCPP20MeasurandEnumType,
  OCPP20PhaseEnumType,
  OCPP20ReadingContextEnumType,
} from './2.0/MeterValues.js'

export type MeterValue = OCPP16MeterValue

export const MeterValueUnit = {
  ...OCPP16MeterValueUnit,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type MeterValueUnit = OCPP16MeterValueUnit

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

export type SampledValue = OCPP16SampledValue
