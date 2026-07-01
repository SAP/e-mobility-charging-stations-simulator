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

export enum AmpereUnits {
  AMPERE = 'A',
  CENTI_AMPERE = 'cA',
  DECI_AMPERE = 'dA',
  MILLI_AMPERE = 'mA',
}

export enum CurrentType {
  AC = 'AC',
  DC = 'DC',
}

export enum PowerUnits {
  KILO_WATT = 'kW',
  WATT = 'W',
}

export enum Voltage {
  VOLTAGE_110 = 110,
  VOLTAGE_230 = 230,
  VOLTAGE_400 = 400,
  VOLTAGE_800 = 800,
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
  /**
   * Enable physics-based coherent MeterValues generation (opt-in, default `false`).
   * When `true`, MeterValues are derived from a single physics chain
   * (V → P → I → ΔE → SoC) using a deterministic seeded PRNG and an
   * optional {@link evProfilesFile}. When `false` or absent, legacy
   * per-measurand random generation is used and behavior is unchanged.
   */
  coherentMeterValues?: boolean
  commandsSupport?: CommandsSupport
  Configuration?: ChargingStationOcppConfiguration
  Connectors?: Record<string, ConnectorStatus>
  currentOutType?: CurrentType
  customValueLimitationMeterValues?: boolean
  enableStatistics?: boolean
  /**
   * Optional EV profile file (same asset pattern as {@link idTagsFile}).
   * Consumed only when `coherentMeterValues` is `true`. Malformed or
   * missing files disable coherent generation for the station and log
   * a warning; the station still starts.
   */
  evProfilesFile?: string
  Evses?: Record<string, EvseTemplate>
  firmwareUpgrade?: FirmwareUpgrade
  firmwareVersion?: string
  firmwareVersionPattern?: string
  fixedName?: boolean
  /**
   * Continue station-initiated transactions when CSMS rejects the IdToken
   * (`idTagInfo.status` != Accepted in 1.6; `idTokenInfo.status` != Accepted
   * on `eventType=Started` in 2.0.1; mid-tx revocation on `Updated`/`Ended`
   * still tears down). Default `false`; when `true`, violates OCPP 2.0.1
   * E05.FR.09 / E05.FR.10 / E06.FR.04. Independent of `ocppStrictCompliance`
   * (operates on response handling, not schema validation). Distinct from
   * OCPP variables `StopTransactionOnInvalidId` / `StopTxOnInvalidId`
   * (mid-tx stop control); this flag overrides the start-time gate only.
   */
  forceTransactionOnInvalidIdToken?: boolean
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
  /** Seconds to wait after transaction stop before transitioning connector to Available. Simulates cable-unplug delay. In OCPP 1.6 the connector stays in Finishing state; in OCPP 2.0.x it stays Occupied. 0 = immediate Available (default behavior). */
  postTransactionDelay?: number
  power?: number | number[]
  powerSharedByConnectors?: boolean
  powerUnit?: PowerUnits
  randomConnectors?: boolean
  /**
   * Optional deterministic seed for coherent MeterValues generation.
   * When set together with `coherentMeterValues=true`, the physics-based
   * generator produces reproducible MeterValues sequences for identical
   * inputs (same seed + same transactionId + same interval). Ignored when
   * `coherentMeterValues` is `false` or absent.
   */
  randomSeed?: number
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

export interface FirmwareUpgrade extends JsonObject {
  failureStatus?: FirmwareStatus
  reset?: boolean
  versionUpgrade?: {
    patternGroup?: number
    step?: number
  }
}

export type WsOptions = ClientOptions & ClientRequestArgs

interface CommandsSupport extends JsonObject {
  incomingCommands: Record<IncomingRequestCommand, boolean>
  outgoingCommands?: Record<RequestCommand, boolean>
}
