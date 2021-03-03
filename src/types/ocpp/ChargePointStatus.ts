import { OCPP16ChargePointStatus } from './1.6/ChargePointStatus';

export type ChargePointStatus = OCPP16ChargePointStatus;

export const ChargePointStatus = {
  ...OCPP16ChargePointStatus
};
