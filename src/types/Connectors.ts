import { ChargePointStatus } from './ChargePointStatus';
import MeterValue from './MeterValue';

export interface Connector {
  bootStatus?: ChargePointStatus;
  status?: ChargePointStatus;
  MeterValues: MeterValue[];
  transactionStarted?: boolean;
  transactionId?: number;
  transactionSetInterval?: NodeJS.Timeout;
  idTag?: string;
  lastEnergyActiveImportRegisterValue?: number;
}

export default interface Connectors {
  [id: string]: Connector;
}
