import { OCPP20ConnectorEnumType } from './2.0/Transaction.js'

export const ConnectorEnumType = {
  ...OCPP20ConnectorEnumType,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type ConnectorEnumType = OCPP20ConnectorEnumType
