import type { SampledValue } from './ocpp/MeterValues';

export interface SampledValueTemplate extends SampledValue {
  fluctuationPercent?: number;
}

export default interface MeasurandPerPhaseSampledValueTemplates {
  L1?: SampledValueTemplate;
  L2?: SampledValueTemplate;
  L3?: SampledValueTemplate;
}
