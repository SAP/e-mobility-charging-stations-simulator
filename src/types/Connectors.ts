import { AvailabilityType } from './ocpp/Requests';
import { ChargePointStatus } from './ocpp/ChargePointStatus';
import { ChargingProfile } from './ocpp/ChargingProfile';
import { SampledValue } from './ocpp/MeterValues';

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
