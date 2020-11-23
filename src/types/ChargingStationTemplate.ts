import ChargingStationConfiguration from './ChargingStationConfiguration';
import Connectors from './Connectors';

export enum PowerOutType {
  AC = 'AC',
  DC = 'DC',
}

export enum PowerUnit {
  WATT = 'W',
  KILO_WATT = 'kW',
}

export interface AutomaticTransactionGenerator {
  enable: boolean;
  minDuration: number;
  maxDuration: number;
  minDelayBetweenTwoTransactions: number;
  maxDelayBetweenTwoTransactions: number;
  probabilityOfStart: number;
  stopAfterHours: number;
  stopOnConnectionFailure: boolean
}

export default interface ChargingStationTemplate {
  supervisionURL?: string;
  authorizationFile?: string;
  baseName: string;
  fixedName?: string;
  chargePointModel: string;
  chargePointVendor: string;
  chargeBoxSerialNumberPrefix?: string;
  firmwareVersion?: string;
  power: number | number[];
  powerSharedByConnectors?: boolean;
  powerUnit: PowerUnit;
  powerOutType?: PowerOutType;
  numberOfPhases?: number;
  numberOfConnectors?: number | number[];
  useConnectorId0?: boolean;
  randomConnectors?: boolean;
  resetTime?: number;
  connectionTimeout?: number;
  autoReconnectMaxRetries?: number;
  reconnectExponentialDelay?: boolean;
  enableStatistics?: boolean;
  voltageOut?: number;
  Configuration?: ChargingStationConfiguration;
  AutomaticTransactionGenerator: AutomaticTransactionGenerator;
  Connectors: Connectors;
}
