import {
  type OCPP16MeterValue,
  OCPP16MeterValueContext,
  OCPP16MeterValueLocation,
  OCPP16MeterValueMeasurand,
  OCPP16MeterValuePhase,
  OCPP16MeterValueUnit,
  type OCPP16SampledValue,
} from './1.6/MeterValues.js'
import { OCPP20MeasurandEnumType, OCPP20PhaseEnumType } from './2.0/Common.js'

export type MeterValue = OCPP16MeterValue

export const MeterValueUnit = {
  ...OCPP16MeterValueUnit,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type MeterValueUnit = OCPP16MeterValueUnit

export const MeterValueContext = {
  ...OCPP16MeterValueContext,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type MeterValueContext = OCPP16MeterValueContext

export const MeterValueLocation = {
  ...OCPP16MeterValueLocation,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type MeterValueLocation = OCPP16MeterValueLocation

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
