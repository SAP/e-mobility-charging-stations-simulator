import { OCPP16ChargePointStatus } from './1.6/ChargePointStatus';

export type ChargePointStatus = typeof ChargePointStatus;

export const ChargePointStatus = {
  ...OCPP16ChargePointStatus
};
