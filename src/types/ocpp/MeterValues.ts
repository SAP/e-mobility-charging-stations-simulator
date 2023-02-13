import {
  type OCPP16MeterValue,
  OCPP16MeterValueMeasurand,
  OCPP16MeterValuePhase,
  type OCPP16SampledValue,
} from '../internal';

export const MeterValueMeasurand = {
  ...OCPP16MeterValueMeasurand,
} as const;
export type MeterValueMeasurand = OCPP16MeterValueMeasurand;

export const MeterValuePhase = {
  ...OCPP16MeterValuePhase,
} as const;
export type MeterValuePhase = OCPP16MeterValuePhase;

export type SampledValue = OCPP16SampledValue;

export type MeterValue = OCPP16MeterValue;
