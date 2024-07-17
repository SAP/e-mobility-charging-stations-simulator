import { OCPP16ChargePointErrorCode } from './1.6/ChargePointErrorCode.js'

export const ChargePointErrorCode = {
  ...OCPP16ChargePointErrorCode,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type ChargePointErrorCode = OCPP16ChargePointErrorCode
