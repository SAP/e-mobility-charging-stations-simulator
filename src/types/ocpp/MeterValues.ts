import { OCPP16MeterValueMeasurand, OCPP16SampledValue } from './1.6/MeterValues';

export type MeterValueMeasurand = OCPP16MeterValueMeasurand;

export const MeterValueMeasurand = {
  ...OCPP16MeterValueMeasurand
};

export type SampledValue = OCPP16SampledValue;
