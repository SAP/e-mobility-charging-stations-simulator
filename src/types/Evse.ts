import type { AvailabilityType, ConnectorStatus } from './internal';

export type EvseTemplate = {
  Connectors: Record<string, ConnectorStatus>;
};

export type EvseStatus = {
  connectors: Map<number, ConnectorStatus>;
  availability: AvailabilityType;
};
