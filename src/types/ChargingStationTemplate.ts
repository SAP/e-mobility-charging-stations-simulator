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
  RequestCommand,
} from './ocpp/Requests.js'

export enum CurrentType {
  AC = 'AC',
  DC = 'DC',
}

export enum PowerUnits {
  KILO_WATT = 'kW',
  WATT = 'W',
}

export enum AmpereUnits {
  AMPERE = 'A',
  CENTI_AMPERE = 'cA',
  DECI_AMPERE = 'dA',
  MILLI_AMPERE = 'mA',
}

export enum Voltage {
  VOLTAGE_110 = 110,
  VOLTAGE_230 = 230,
  VOLTAGE_400 = 400,
  VOLTAGE_800 = 800,
}

export type WsOptions = ClientOptions & ClientRequestArgs

export interface FirmwareUpgrade extends JsonObject {
  failureStatus?: FirmwareStatus
  reset?: boolean
  versionUpgrade?: {
    patternGroup?: number
    step?: number
  }
}

interface CommandsSupport extends JsonObject {
  incomingCommands: Record<IncomingRequestCommand, boolean>
  outgoingCommands?: Record<RequestCommand, boolean>
}

enum x509CertificateType {
  ChargingStationCertificate = 'ChargingStationCertificate',
  CSMSRootCertificate = 'CSMSRootCertificate',
  ManufacturerRootCertificate = 'ManufacturerRootCertificate',
  MORootCertificate = 'MORootCertificate',
  V2GCertificate = 'V2GCertificate',
  V2GRootCertificate = 'V2GRootCertificate',
}

export interface ChargingStationTemplate {
  amperageLimitationOcppKey?: string
  amperageLimitationUnit?: AmpereUnits
  AutomaticTransactionGenerator?: AutomaticTransactionGeneratorConfiguration
  automaticTransactionGeneratorPersistentConfiguration?: boolean
  autoReconnectMaxRetries?: number
  autoRegister?: boolean
  autoStart?: boolean
  baseName: string
  beginEndMeterValues?: boolean
  chargeBoxSerialNumberPrefix?: string
  chargePointModel: string
  chargePointSerialNumberPrefix?: string
  chargePointVendor: string
  commandsSupport?: CommandsSupport
  Configuration?: ChargingStationOcppConfiguration
  Connectors?: Record<string, ConnectorStatus>
  currentOutType?: CurrentType
  customValueLimitationMeterValues?: boolean
  enableStatistics?: boolean
  Evses?: Record<string, EvseTemplate>
  firmwareUpgrade?: FirmwareUpgrade
  firmwareVersion?: string
  firmwareVersionPattern?: string
  fixedName?: boolean
  iccid?: string
  idTagsFile?: string
  imsi?: string
  mainVoltageMeterValues?: boolean
  messageTriggerSupport?: Record<MessageTrigger, boolean>
  meteringPerTransaction?: boolean
  meterSerialNumberPrefix?: string
  meterType?: string
  /** @deprecated Replaced by remoteAuthorization. */
  mustAuthorizeAtRemoteStart?: boolean
  nameSuffix?: string
  numberOfConnectors?: number | number[]
  numberOfPhases?: number
  ocppPersistentConfiguration?: boolean
  ocppProtocol?: OCPPProtocol
  ocppStrictCompliance?: boolean
  ocppVersion?: OCPPVersion
  outOfOrderEndMeterValues?: boolean
  /** @deprecated Replaced by ocppStrictCompliance. */
  payloadSchemaValidation?: boolean
  phaseLineToLineVoltageMeterValues?: boolean
  power?: number | number[]
  powerSharedByConnectors?: boolean
  powerUnit?: PowerUnits
  randomConnectors?: boolean
  reconnectExponentialDelay?: boolean
  registrationMaxRetries?: number
  remoteAuthorization?: boolean
  resetTime?: number
  stationInfoPersistentConfiguration?: boolean
  stopTransactionsOnStopped?: boolean
  supervisionPassword?: string
  supervisionUrlOcppConfiguration?: boolean
  supervisionUrlOcppKey?: string
  supervisionUrls?: string | string[]
  supervisionUser?: string
  templateHash?: string
  transactionDataMeterValues?: boolean
  useConnectorId0?: boolean
  voltageOut?: Voltage
  wsOptions?: WsOptions
  x509Certificates?: Record<x509CertificateType, string>
}
