import type { ConnectorStatus } from './ConnectorStatus';
import type { AvailabilityType } from './ocpp/Requests';

export type EvseTemplate = {
  Connectors: Record<string, ConnectorStatus>;
};

export type EvseStatus = {
  connectors: Map<number, ConnectorStatus>;
  availability: AvailabilityType;
};
