import { ChargePointStatus } from './ocpp/1.6/ChargePointStatus';
import MeterValue from './ocpp/1.6/MeterValue';

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
