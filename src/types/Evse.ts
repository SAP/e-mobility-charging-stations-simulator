import type { ConnectorStatus } from './ConnectorStatus';
import type { AvailabilityType } from './ocpp/Requests';

export interface EvseTemplate {
  Connectors: Record<string, ConnectorStatus>;
}

export interface EvseStatus {
  connectors: Map<number, ConnectorStatus>;
  availability: AvailabilityType;
}
