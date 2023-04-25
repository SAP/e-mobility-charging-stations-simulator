import type { AvailabilityType } from './internal';

export type EvseStatus = {
  connectorIds: number[];
  availability: AvailabilityType;
};
