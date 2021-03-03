import { OCPP16ChargePointErrorCode } from './1.6/ChargePointErrorCode';

export type ChargePointErrorCode = OCPP16ChargePointErrorCode;

export const ChargePointErrorCode = {
  ...OCPP16ChargePointErrorCode
};
