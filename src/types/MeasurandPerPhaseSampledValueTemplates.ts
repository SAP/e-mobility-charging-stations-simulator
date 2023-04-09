import type { SampledValue } from './internal';

export type SampledValueTemplate = SampledValue & {
  fluctuationPercent?: number;
  minimumValue?: number;
};

export type MeasurandPerPhaseSampledValueTemplates = {
  L1?: SampledValueTemplate;
  L2?: SampledValueTemplate;
  L3?: SampledValueTemplate;
};
