import ChargingStationOcppConfiguration from './ChargingStationOcppConfiguration';
import { ClientOptions } from 'ws';
import { ClientRequestArgs } from 'http';
import { ConnectorStatus } from './ConnectorStatus';
import { OCPPProtocol } from './ocpp/OCPPProtocol';
import { OCPPVersion } from './ocpp/OCPPVersion';

export enum CurrentType {
  AC = 'AC',
  DC = 'DC',
}

export enum PowerUnits {
  WATT = 'W',
  KILO_WATT = 'kW',
}

export enum AmpereUnits {
  MILLI_AMPERE = 'mA',
  CENTI_AMPERE = 'cA',
  DECI_AMPERE = 'dA',
  AMPERE = 'A',
}

export enum Voltage {
  VOLTAGE_110 = 110,
  VOLTAGE_230 = 230,
  VOLTAGE_400 = 400,
  VOLTAGE_800 = 800,
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
  requireAuthorize?: boolean;
}

export type WsOptions = ClientOptions & ClientRequestArgs;

export default interface ChargingStationTemplate {
  supervisionUrls?: string | string[];
  supervisionUrlOcppConfiguration?: boolean;
  supervisionUrlOcppKey?: string;
  supervisionUser?: string;
  supervisionPassword?: string;
  ocppVersion?: OCPPVersion;
  ocppProtocol?: OCPPProtocol;
  ocppStrictCompliance?: boolean;
  ocppPersistentConfiguration?: boolean;
  wsOptions?: WsOptions;
  authorizationFile?: string;
  baseName: string;
  nameSuffix?: string;
  fixedName?: boolean;
  chargePointModel: string;
  chargePointVendor: string;
  chargePointSerialNumberPrefix?: string;
  chargeBoxSerialNumberPrefix?: string;
  firmwareVersion?: string;
  iccid?: string;
  imsi?: string;
  meterSerialNumber?: string;
  meterType?: string;
  power: number | number[];
  powerSharedByConnectors?: boolean;
  powerUnit: PowerUnits;
  currentOutType?: CurrentType;
  voltageOut?: Voltage;
  numberOfPhases?: number;
  numberOfConnectors?: number | number[];
  useConnectorId0?: boolean;
  randomConnectors?: boolean;
  resetTime?: number;
  autoRegister: boolean;
  autoReconnectMaxRetries?: number;
  reconnectExponentialDelay?: boolean;
  registrationMaxRetries?: number;
  enableStatistics?: boolean;
  mayAuthorizeAtRemoteStart: boolean;
  amperageLimitationOcppKey?: string;
  amperageLimitationUnit?: AmpereUnits;
  beginEndMeterValues?: boolean;
  outOfOrderEndMeterValues?: boolean;
  meteringPerTransaction?: boolean;
  transactionDataMeterValues?: boolean;
  mainVoltageMeterValues?: boolean;
  phaseLineToLineVoltageMeterValues?: boolean;
  Configuration?: ChargingStationOcppConfiguration;
  AutomaticTransactionGenerator: AutomaticTransactionGenerator;
  Connectors: Record<string, ConnectorStatus>;
}
