import type { JsonObject } from './JsonType.js'
import type {
  OCPP16MeterValueContext,
  OCPP16MeterValueLocation,
  OCPP16MeterValueMeasurand,
  OCPP16MeterValuePhase,
  OCPP16MeterValueUnit,
} from './ocpp/1.6/MeterValues.js'
import type {
  OCPP20LocationEnumType,
  OCPP20MeasurandEnumType,
  OCPP20PhaseEnumType,
  OCPP20ReadingContextEnumType,
  OCPP20UnitOfMeasure,
} from './ocpp/2.0/MeterValues.js'

export interface MeasurandPerPhaseSampledValueTemplates {
  L1?: SampledValueTemplate
  L2?: SampledValueTemplate
  L3?: SampledValueTemplate
}

export interface SampledValueTemplate extends JsonObject {
  context?: OCPP16MeterValueContext | OCPP20ReadingContextEnumType
  fluctuationPercent?: number
  location?: OCPP16MeterValueLocation | OCPP20LocationEnumType
  measurand?: OCPP16MeterValueMeasurand | OCPP20MeasurandEnumType
  minimumValue?: number
  phase?: OCPP16MeterValuePhase | OCPP20PhaseEnumType
  unit?: OCPP16MeterValueUnit
  unitOfMeasure?: OCPP20UnitOfMeasure
  value?: number | string
}
