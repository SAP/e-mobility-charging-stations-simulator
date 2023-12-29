import type { ConnectorStatus } from './ConnectorStatus.js'
import type { AvailabilityType } from './ocpp/Requests.js'

export interface EvseTemplate {
  Connectors: Record<string, ConnectorStatus>
}

export interface EvseStatus {
  connectors: Map<number, ConnectorStatus>
  availability: AvailabilityType
}
