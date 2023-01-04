import { OCPP16ChargePointStatus } from './1.6/ChargePointStatus';

export const ChargePointStatus = {
  ...OCPP16ChargePointStatus,
} as const;
export type ChargePointStatus = OCPP16ChargePointStatus;
