import type { ConnectorStatus } from './ConnectorStatus.js'
import type { AvailabilityType } from './ocpp/Requests.js'

export interface EvseStatus {
  availability: AvailabilityType
  connectors: Map<number, ConnectorStatus>
}

export interface EvseTemplate {
  Connectors: Record<string, ConnectorStatus>
}
