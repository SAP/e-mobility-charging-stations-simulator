import type { JsonObject } from './JsonType.js'
import type { OCPP16MeterValueFormat } from './ocpp/1.6/MeterValues.js'
import type { CustomDataType } from './ocpp/2.0/Common.js'
import type { OCPP20SignedMeterValue, OCPP20UnitOfMeasure } from './ocpp/2.0/MeterValues.js'
import type {
  MeterValueContext,
  MeterValueLocation,
  MeterValueMeasurand,
  MeterValuePhase,
  MeterValueUnit,
} from './ocpp/MeterValues.js'

export interface MeasurandPerPhaseSampledValueTemplates {
  L1?: SampledValueTemplate
  L2?: SampledValueTemplate
  L3?: SampledValueTemplate
}

export interface SampledValueTemplate extends JsonObject {
  context?: MeterValueContext
  customData?: CustomDataType
  fluctuationPercent?: number
  format?: OCPP16MeterValueFormat
  location?: MeterValueLocation
  measurand?: MeterValueMeasurand
  minimumValue?: number
  phase?: MeterValuePhase
  signedMeterValue?: OCPP20SignedMeterValue
  unit?: MeterValueUnit | string
  unitOfMeasure?: OCPP20UnitOfMeasure
  value?: number | string
}
