import ChargingStationConfiguration from './ChargingStationConfiguration';
import Connectors from './Connectors';
import { OCPPProtocol } from './ocpp/OCPPProtocol';
import { OCPPVersion } from './ocpp/OCPPVersion';

export enum PowerOutType {
  AC = 'AC',
  DC = 'DC',
}

export enum PowerUnits {
  WATT = 'W',
  KILO_WATT = 'kW',
}

export enum VoltageOut {
  VOLTAGE_110 = 110,
  VOLTAGE_230 = 230,
  VOLTAGE_400 = 400
}

export interface AutomaticTransactionGenerator {
  enable: boolean;
  minDuration: number;
  maxDuration: number;
  minDelayBetweenTwoTransactions: number;
  maxDelayBetweenTwoTransactions: number;
  probabilityOfStart: number;
  stopAfterHours: number;
  stopOnConnectionFailure: boolean;
  requireAuthorize: boolean
}

export default interface ChargingStationTemplate {
  supervisionURL?: string;
  ocppVersion?: OCPPVersion;
  ocppProtocol?: OCPPProtocol;
  authorizationFile?: string;
  baseName: string;
  nameSuffix?: string;
  fixedName?: boolean;
  chargePointModel: string;
  chargePointVendor: string;
  chargeBoxSerialNumberPrefix?: string;
  firmwareVersion?: string;
  power: number | number[];
  powerSharedByConnectors?: boolean;
  powerUnit: PowerUnits;
  powerOutType?: PowerOutType;
  numberOfPhases?: number;
  numberOfConnectors?: number | number[];
  useConnectorId0?: boolean;
  randomConnectors?: boolean;
  resetTime?: number;
  connectionTimeout?: number;
  autoReconnectMaxRetries?: number;
  reconnectExponentialDelay?: boolean;
  registrationMaxRetries?: number;
  enableStatistics?: boolean;
  voltageOut?: number;
  Configuration?: ChargingStationConfiguration;
  AutomaticTransactionGenerator: AutomaticTransactionGenerator;
  Connectors: Connectors;
}
