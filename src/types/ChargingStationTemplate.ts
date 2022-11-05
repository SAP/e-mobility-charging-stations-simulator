import type { ClientRequestArgs } from 'http';

import type { ClientOptions } from 'ws';

import type { AutomaticTransactionGeneratorConfiguration } from './AutomaticTransactionGenerator';
import type { ChargingStationOcppConfiguration } from './ChargingStationOcppConfiguration';
import type { ConnectorStatus } from './ConnectorStatus';
import type { OCPPProtocol } from './ocpp/OCPPProtocol';
import type { OCPPVersion } from './ocpp/OCPPVersion';
import type { IncomingRequestCommand, MessageTrigger, RequestCommand } from './ocpp/Requests';

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

export type WsOptions = ClientOptions & ClientRequestArgs;

type CommandsSupport = {
  incomingCommands: Record<IncomingRequestCommand, boolean>;
  outgoingCommands?: Record<RequestCommand, boolean>;
};

export type ChargingStationTemplate = {
  templateHash?: string;
  supervisionUrls?: string | string[];
  supervisionUrlOcppConfiguration?: boolean;
  supervisionUrlOcppKey?: string;
  supervisionUser?: string;
  supervisionPassword?: string;
  ocppVersion?: OCPPVersion;
  ocppProtocol?: OCPPProtocol;
  ocppStrictCompliance?: boolean;
  ocppPersistentConfiguration?: boolean;
  stationInfoPersistentConfiguration?: boolean;
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
  meterSerialNumberPrefix?: string;
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
  autoRegister?: boolean;
  autoReconnectMaxRetries?: number;
  reconnectExponentialDelay?: boolean;
  registrationMaxRetries?: number;
  enableStatistics?: boolean;
  mustAuthorizeAtRemoteStart?: boolean;
  payloadSchemaValidation?: boolean;
  amperageLimitationOcppKey?: string;
  amperageLimitationUnit?: AmpereUnits;
  beginEndMeterValues?: boolean;
  outOfOrderEndMeterValues?: boolean;
  meteringPerTransaction?: boolean;
  transactionDataMeterValues?: boolean;
  mainVoltageMeterValues?: boolean;
  phaseLineToLineVoltageMeterValues?: boolean;
  customValueLimitationMeterValues?: boolean;
  commandsSupport?: CommandsSupport;
  messageTriggerSupport?: Record<MessageTrigger, boolean>;
  Configuration?: ChargingStationOcppConfiguration;
  AutomaticTransactionGenerator?: AutomaticTransactionGeneratorConfiguration;
  Connectors: Record<string, ConnectorStatus>;
};
