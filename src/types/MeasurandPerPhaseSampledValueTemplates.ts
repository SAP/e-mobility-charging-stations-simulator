import type { SampledValue } from './ocpp/MeterValues.js'

export interface MeasurandPerPhaseSampledValueTemplates {
  L1?: SampledValueTemplate
  L2?: SampledValueTemplate
  L3?: SampledValueTemplate
}

export type SampledValueTemplate = SampledValue & {
  fluctuationPercent?: number
  minimumValue?: number
}
