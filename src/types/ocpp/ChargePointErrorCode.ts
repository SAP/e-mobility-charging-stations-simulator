import { OCPP16ChargePointErrorCode } from './1.6/ChargePointErrorCode';

export const ChargePointErrorCode = {
  ...OCPP16ChargePointErrorCode,
} as const;
export type ChargePointErrorCode = OCPP16ChargePointErrorCode;
