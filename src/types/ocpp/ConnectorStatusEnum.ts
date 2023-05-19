import { OCPP16ChargePointStatus } from './1.6/ChargePointStatus';
import { OCPP20ConnectorStatusEnumType } from './2.0/Common';

export const ConnectorStatusEnum = {
  ...OCPP16ChargePointStatus,
  ...OCPP20ConnectorStatusEnumType,
} as const;
export type ConnectorStatusEnum = OCPP16ChargePointStatus | OCPP20ConnectorStatusEnumType;

export type ConnectorStatusTransition = Readonly<{
  from?: ConnectorStatusEnum;
  to: ConnectorStatusEnum;
}>;
