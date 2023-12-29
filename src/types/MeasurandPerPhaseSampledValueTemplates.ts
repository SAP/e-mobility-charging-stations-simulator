import type { SampledValue } from './ocpp/MeterValues.js'

export type SampledValueTemplate = SampledValue & {
  fluctuationPercent?: number
  minimumValue?: number
}

export interface MeasurandPerPhaseSampledValueTemplates {
  L1?: SampledValueTemplate
  L2?: SampledValueTemplate
  L3?: SampledValueTemplate
}
