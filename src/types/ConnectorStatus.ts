import type { SampledValueTemplate } from './MeasurandPerPhaseSampledValueTemplates';
import type { ChargePointStatus } from './ocpp/ChargePointStatus';
import type { ChargingProfile } from './ocpp/ChargingProfile';
import type { MeterValue } from './ocpp/MeterValues';
import type { AvailabilityType } from './ocpp/Requests';

export type ConnectorStatus = {
  availability: AvailabilityType;
  bootStatus?: ChargePointStatus;
  status?: ChargePointStatus;
  MeterValues: SampledValueTemplate[];
  authorizeIdTag?: string;
  idTagAuthorized?: boolean;
  localAuthorizeIdTag?: string;
  idTagLocalAuthorized?: boolean;
  transactionRemoteStarted?: boolean;
  transactionStarted?: boolean;
  transactionId?: number;
  transactionSetInterval?: NodeJS.Timeout;
  transactionIdTag?: string;
  energyActiveImportRegisterValue?: number; // In Wh
  transactionEnergyActiveImportRegisterValue?: number; // In Wh
  transactionBeginMeterValue?: MeterValue;
  chargingProfiles?: ChargingProfile[];
};
