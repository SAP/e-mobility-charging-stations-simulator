import type {
  AvailabilityType,
  ChargingProfile,
  ConnectorStatusEnum,
  MeterValue,
  SampledValueTemplate,
} from './internal';

export type ConnectorStatus = {
  availability: AvailabilityType;
  bootStatus?: ConnectorStatusEnum;
  status?: ConnectorStatusEnum;
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
