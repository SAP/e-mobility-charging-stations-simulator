import type { ConnectorStatus } from './ConnectorStatus.js'
import type { SampledValueTemplate } from './MeasurandPerPhaseSampledValueTemplates.js'
import type { AvailabilityType } from './ocpp/Requests.js'

export interface EvseEntry {
  readonly evseId: number
  readonly evseStatus: EvseStatus
}

export interface EvseStatus {
  availability: AvailabilityType
  connectors: Map<number, ConnectorStatus>
  MeterValues?: SampledValueTemplate[]
}

export interface EvseTemplate {
  Connectors: Record<string, ConnectorStatus>
  MeterValues?: SampledValueTemplate[]
}
