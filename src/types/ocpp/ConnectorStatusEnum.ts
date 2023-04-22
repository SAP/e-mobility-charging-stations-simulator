import { OCPP16ChargePointStatus, OCPP20ConnectorStatusEnumType } from '../internal';

export const ConnectorStatusEnum = {
  ...OCPP16ChargePointStatus,
  ...OCPP20ConnectorStatusEnumType,
} as const;
export type ConnectorStatusEnum = OCPP16ChargePointStatus | OCPP20ConnectorStatusEnumType;

export type ConnectorStatusTransition = Readonly<{
  from?: ConnectorStatusEnum;
  to: ConnectorStatusEnum;
}>;
