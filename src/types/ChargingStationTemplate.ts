import type { ClientRequestArgs } from 'node:http'

import type { ClientOptions } from 'ws'

import type { AutomaticTransactionGeneratorConfiguration } from './AutomaticTransactionGenerator.js'
import type { ChargingStationOcppConfiguration } from './ChargingStationOcppConfiguration.js'
import type { ConnectorStatus } from './ConnectorStatus.js'
import type { EvseTemplate } from './Evse.js'
import type { JsonObject } from './JsonType.js'
import type { OCPPProtocol } from './ocpp/OCPPProtocol.js'
import type { OCPPVersion } from './ocpp/OCPPVersion.js'
import type {
  FirmwareStatus,
  IncomingRequestCommand,
  MessageTrigger,
  RequestCommand
} from './ocpp/Requests.js'

export enum CurrentType {
  AC = 'AC',
  DC = 'DC'
}

export enum PowerUnits {
  WATT = 'W',
  KILO_WATT = 'kW'
}

export enum AmpereUnits {
  MILLI_AMPERE = 'mA',
  CENTI_AMPERE = 'cA',
  DECI_AMPERE = 'dA',
  AMPERE = 'A'
}

export enum Voltage {
  VOLTAGE_110 = 110,
  VOLTAGE_230 = 230,
  VOLTAGE_400 = 400,
  VOLTAGE_800 = 800
}

export type WsOptions = ClientOptions & ClientRequestArgs

export interface FirmwareUpgrade extends JsonObject {
  versionUpgrade?: {
    patternGroup?: number
    step?: number
  }
  reset?: boolean
  failureStatus?: FirmwareStatus
}

interface CommandsSupport extends JsonObject {
  incomingCommands: Record<IncomingRequestCommand, boolean>
  outgoingCommands?: Record<RequestCommand, boolean>
}

enum x509CertificateType {
  V2GRootCertificate = 'V2GRootCertificate',
  MORootCertificate = 'MORootCertificate',
  CSMSRootCertificate = 'CSMSRootCertificate',
  ManufacturerRootCertificate = 'ManufacturerRootCertificate',
  ChargingStationCertificate = 'ChargingStationCertificate',
  V2GCertificate = 'V2GCertificate'
}

export interface ChargingStationTemplate {
  templateHash?: string
  supervisionUrls?: string | string[]
  supervisionUrlOcppConfiguration?: boolean
  supervisionUrlOcppKey?: string
  supervisionUser?: string
  supervisionPassword?: string
  autoStart?: boolean
  ocppVersion?: OCPPVersion
  ocppProtocol?: OCPPProtocol
  ocppStrictCompliance?: boolean
  ocppPersistentConfiguration?: boolean
  stationInfoPersistentConfiguration?: boolean
  automaticTransactionGeneratorPersistentConfiguration?: boolean
  wsOptions?: WsOptions
  idTagsFile?: string
  baseName: string
  nameSuffix?: string
  fixedName?: boolean
  chargePointModel: string
  chargePointVendor: string
  chargePointSerialNumberPrefix?: string
  chargeBoxSerialNumberPrefix?: string
  firmwareVersionPattern?: string
  firmwareVersion?: string
  firmwareUpgrade?: FirmwareUpgrade
  iccid?: string
  imsi?: string
  meterSerialNumberPrefix?: string
  meterType?: string
  power?: number | number[]
  powerUnit?: PowerUnits
  powerSharedByConnectors?: boolean
  currentOutType?: CurrentType
  voltageOut?: Voltage
  numberOfPhases?: number
  numberOfConnectors?: number | number[]
  useConnectorId0?: boolean
  randomConnectors?: boolean
  resetTime?: number
  autoRegister?: boolean
  autoReconnectMaxRetries?: number
  reconnectExponentialDelay?: boolean
  registrationMaxRetries?: number
  enableStatistics?: boolean
  remoteAuthorization?: boolean
  /** @deprecated Replaced by remoteAuthorization. */
  mustAuthorizeAtRemoteStart?: boolean
  /** @deprecated Replaced by ocppStrictCompliance. */
  payloadSchemaValidation?: boolean
  amperageLimitationOcppKey?: string
  amperageLimitationUnit?: AmpereUnits
  beginEndMeterValues?: boolean
  outOfOrderEndMeterValues?: boolean
  meteringPerTransaction?: boolean
  transactionDataMeterValues?: boolean
  stopTransactionsOnStopped?: boolean
  mainVoltageMeterValues?: boolean
  phaseLineToLineVoltageMeterValues?: boolean
  customValueLimitationMeterValues?: boolean
  commandsSupport?: CommandsSupport
  messageTriggerSupport?: Record<MessageTrigger, boolean>
  Configuration?: ChargingStationOcppConfiguration
  AutomaticTransactionGenerator?: AutomaticTransactionGeneratorConfiguration
  Evses?: Record<string, EvseTemplate>
  Connectors?: Record<string, ConnectorStatus>
  x509Certificates?: Record<x509CertificateType, string>
}
