import { AvailabilityType } from './ocpp/1.6/Requests';
import { ChargePointStatus } from './ocpp/1.6/ChargePointStatus';
import { ChargingProfile } from './ocpp/1.6/ChargingProfile';
import { SampledValue } from './ocpp/1.6/MeterValues';

export interface Connector {
  availability: AvailabilityType;
  bootStatus?: ChargePointStatus;
  status?: ChargePointStatus;
  MeterValues: SampledValue[];
  transactionStarted?: boolean;
  transactionId?: number;
  transactionSetInterval?: NodeJS.Timeout;
  idTag?: string;
  lastEnergyActiveImportRegisterValue?: number;
  chargingProfiles?: ChargingProfile[]
}

export default interface Connectors {
  [id: string]: Connector;
}
