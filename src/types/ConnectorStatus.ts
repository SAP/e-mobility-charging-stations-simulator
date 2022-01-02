import { AvailabilityType } from './ocpp/Requests';
import { ChargePointStatus } from './ocpp/ChargePointStatus';
import { ChargingProfile } from './ocpp/ChargingProfile';
import { MeterValue } from './ocpp/MeterValues';
import { SampledValueTemplate } from './MeasurandPerPhaseSampledValueTemplates';

export interface ConnectorStatus {
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
}
