import { MeterValue, SampledValue } from './ocpp/MeterValues';

import { AvailabilityType } from './ocpp/Requests';
import { ChargePointStatus } from './ocpp/ChargePointStatus';
import { ChargingProfile } from './ocpp/ChargingProfile';

export interface Connector {
  availability: AvailabilityType;
  bootStatus?: ChargePointStatus;
  status?: ChargePointStatus;
  MeterValues: SampledValue[];
  transactionStarted?: boolean;
  transactionId?: number;
  transactionSetInterval?: NodeJS.Timeout;
  idTag?: string;
  energyActiveImportRegisterValue?: number; // In Wh
  transactionEnergyActiveImportRegisterValue?: number; // In Wh
  transactionBeginMeterValue?: MeterValue;
  chargingProfiles?: ChargingProfile[];
}

export default interface Connectors {
  [id: string]: Connector;
}
