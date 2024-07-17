import { OCPP16ChargePointStatus } from './1.6/ChargePointStatus.js'
import { OCPP20ConnectorStatusEnumType } from './2.0/Common.js'

export const ConnectorStatusEnum = {
  ...OCPP16ChargePointStatus,
  ...OCPP20ConnectorStatusEnumType,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type ConnectorStatusEnum = OCPP16ChargePointStatus | OCPP20ConnectorStatusEnumType

export type ConnectorStatusTransition = Readonly<{
  from?: ConnectorStatusEnum
  to: ConnectorStatusEnum
}>
