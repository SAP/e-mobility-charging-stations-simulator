import type { SampledValue } from './ocpp/MeterValues.js'

export interface SampledValueTemplate extends SampledValue {
  fluctuationPercent?: number
  minimumValue?: number
}

export interface MeasurandPerPhaseSampledValueTemplates {
  L1?: SampledValueTemplate
  L2?: SampledValueTemplate
  L3?: SampledValueTemplate
}
