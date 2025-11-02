import type { JsonObject } from './JsonType.js'
import type { OCPP16MeterValueUnit } from './ocpp/1.6/MeterValues.js'
import type { OCPP20UnitOfMeasure } from './ocpp/2.0/MeterValues.js'
import type {
  MeterValueContext,
  MeterValueLocation,
  MeterValueMeasurand,
  MeterValuePhase,
} from './ocpp/MeterValues.js'

export interface MeasurandPerPhaseSampledValueTemplates {
  L1?: SampledValueTemplate
  L2?: SampledValueTemplate
  L3?: SampledValueTemplate
}

export interface SampledValueTemplate extends JsonObject {
  context?: MeterValueContext
  fluctuationPercent?: number
  location?: MeterValueLocation
  measurand?: MeterValueMeasurand
  minimumValue?: number
  phase?: MeterValuePhase
  unit?: OCPP16MeterValueUnit
  unitOfMeasure?: OCPP20UnitOfMeasure
  value?: number | string
}
