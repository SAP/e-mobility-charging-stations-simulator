import { OCPP16ChargePointErrorCode } from '../internal';

export const ChargePointErrorCode = {
  ...OCPP16ChargePointErrorCode,
} as const;
export type ChargePointErrorCode = OCPP16ChargePointErrorCode;
