import type { JsonObject } from './JsonType'

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

export enum IdTagDistribution {
  CONNECTOR_AFFINITY = 'connector-affinity',
  RANDOM = 'random',
  ROUND_ROBIN = 'round-robin',
}

export enum OCPP16AvailabilityType {
  INOPERATIVE = 'Inoperative',
  OPERATIVE = 'Operative',
}

export enum OCPP16ChargePointStatus {
  AVAILABLE = 'Available',
  CHARGING = 'Charging',
  FAULTED = 'Faulted',
  FINISHING = 'Finishing',
  OCCUPIED = 'Occupied',
  PREPARING = 'Preparing',
  RESERVED = 'Reserved',
  SUSPENDED_EV = 'SuspendedEV',
  SUSPENDED_EVSE = 'SuspendedEVSE',
  UNAVAILABLE = 'Unavailable',
}

export enum OCPP16FirmwareStatus {
  Downloaded = 'Downloaded',
  DownloadFailed = 'DownloadFailed',
  Downloading = 'Downloading',
  Idle = 'Idle',
  InstallationFailed = 'InstallationFailed',
  Installed = 'Installed',
  Installing = 'Installing',
}

export enum OCPP16IncomingRequestCommand {
  CHANGE_AVAILABILITY = 'ChangeAvailability',
  CHANGE_CONFIGURATION = 'ChangeConfiguration',
  CLEAR_CACHE = 'ClearCache',
  CLEAR_CHARGING_PROFILE = 'ClearChargingProfile',
  GET_CONFIGURATION = 'GetConfiguration',
  GET_DIAGNOSTICS = 'GetDiagnostics',
  REMOTE_START_TRANSACTION = 'RemoteStartTransaction',
  REMOTE_STOP_TRANSACTION = 'RemoteStopTransaction',
  RESET = 'Reset',
  SET_CHARGING_PROFILE = 'SetChargingProfile',
  TRIGGER_MESSAGE = 'TriggerMessage',
  UNLOCK_CONNECTOR = 'UnlockConnector',
}

export enum OCPP16MessageTrigger {
  BootNotification = 'BootNotification',
  DiagnosticsStatusNotification = 'DiagnosticsStatusNotification',
  FirmwareStatusNotification = 'FirmwareStatusNotification',
  Heartbeat = 'Heartbeat',
  MeterValues = 'MeterValues',
  StatusNotification = 'StatusNotification',
}

export enum OCPP16RegistrationStatus {
  ACCEPTED = 'Accepted',
  PENDING = 'Pending',
  REJECTED = 'Rejected',
}

export enum OCPP16RequestCommand {
  AUTHORIZE = 'Authorize',
  BOOT_NOTIFICATION = 'BootNotification',
  DIAGNOSTICS_STATUS_NOTIFICATION = 'DiagnosticsStatusNotification',
  HEARTBEAT = 'Heartbeat',
  METER_VALUES = 'MeterValues',
  START_TRANSACTION = 'StartTransaction',
  STATUS_NOTIFICATION = 'StatusNotification',
  STOP_TRANSACTION = 'StopTransaction',
}

export enum OCPPProtocol {
  JSON = 'json',
}

export enum OCPPVersion {
  VERSION_16 = '1.6',
  VERSION_20 = '2.0',
  VERSION_201 = '2.0.1',
}

export enum Voltage {
  VOLTAGE_110 = 110,
  VOLTAGE_230 = 230,
  VOLTAGE_400 = 400,
  VOLTAGE_800 = 800,
}

export interface AutomaticTransactionGeneratorConfiguration extends JsonObject {
  enable: boolean
  idTagDistribution?: IdTagDistribution
  maxDelayBetweenTwoTransactions: number
  maxDuration: number
  minDelayBetweenTwoTransactions: number
  minDuration: number
  probabilityOfStart: number
  requireAuthorize?: boolean
  stopAbsoluteDuration: boolean
  stopAfterHours: number
}

export type AvailabilityType = OCPP16AvailabilityType

export type BootNotificationResponse = OCPP16BootNotificationResponse

export type ChargePointStatus = OCPP16ChargePointStatus

export interface ChargingStationAutomaticTransactionGeneratorConfiguration extends JsonObject {
  automaticTransactionGenerator?: AutomaticTransactionGeneratorConfiguration
  automaticTransactionGeneratorStatuses?: Status[]
}

export interface ChargingStationData extends JsonObject {
  automaticTransactionGenerator?: ChargingStationAutomaticTransactionGeneratorConfiguration
  bootNotificationResponse?: BootNotificationResponse
  connectors: ConnectorStatus[]
  evses: EvseStatus[]
  ocppConfiguration: ChargingStationOcppConfiguration
  started: boolean
  stationInfo: ChargingStationInfo
  supervisionUrl: string
  wsState?:
    | typeof WebSocket.CLOSED
    | typeof WebSocket.CLOSING
    | typeof WebSocket.CONNECTING
    | typeof WebSocket.OPEN
}

export interface ChargingStationInfo extends JsonObject {
  amperageLimitationOcppKey?: string
  amperageLimitationUnit?: AmpereUnits
  automaticTransactionGeneratorPersistentConfiguration?: boolean
  autoReconnectMaxRetries?: number
  autoRegister?: boolean
  autoStart?: boolean
  baseName: string
  beginEndMeterValues?: boolean
  chargeBoxSerialNumber?: string
  chargePointModel: string
  chargePointSerialNumber?: string
  chargePointVendor: string
  chargingStationId: string
  commandsSupport?: CommandsSupport
  currentOutType?: CurrentType
  customValueLimitationMeterValues?: boolean
  enableStatistics?: boolean
  firmwareStatus?: FirmwareStatus
  firmwareUpgrade?: FirmwareUpgrade
  firmwareVersion?: string
  firmwareVersionPattern?: string
  fixedName?: boolean
  hashId: string
  iccid?: string
  idTagsFile?: string
  imsi?: string
  mainVoltageMeterValues?: boolean
  maximumAmperage?: number // Always in Ampere
  maximumPower?: number // Always in Watt
  messageTriggerSupport?: Record<MessageTrigger, boolean>
  meteringPerTransaction?: boolean
  meterSerialNumber?: string
  meterType?: string
  nameSuffix?: string
  numberOfPhases?: number
  ocppPersistentConfiguration?: boolean
  ocppProtocol?: OCPPProtocol
  ocppStrictCompliance?: boolean
  ocppVersion?: OCPPVersion
  outOfOrderEndMeterValues?: boolean
  phaseLineToLineVoltageMeterValues?: boolean
  powerSharedByConnectors?: boolean
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
  templateIndex: number
  templateName: string
  transactionDataMeterValues?: boolean
  useConnectorId0?: boolean
  voltageOut?: Voltage
}

export interface ChargingStationOcppConfiguration extends JsonObject {
  configurationKey?: ConfigurationKey[]
}

export interface ChargingStationOptions extends JsonObject {
  autoRegister?: boolean
  autoStart?: boolean
  enableStatistics?: boolean
  ocppStrictCompliance?: boolean
  persistentConfiguration?: boolean
  stopTransactionsOnStopped?: boolean
  supervisionUrls?: string | string[]
}

export interface ConfigurationKey extends OCPPConfigurationKey {
  reboot?: boolean
  visible?: boolean
}

export interface ConnectorStatus extends JsonObject {
  authorizeIdTag?: string
  availability: AvailabilityType
  bootStatus?: ChargePointStatus
  energyActiveImportRegisterValue?: number // In Wh
  idTagAuthorized?: boolean
  idTagLocalAuthorized?: boolean
  localAuthorizeIdTag?: string
  status?: ChargePointStatus
  transactionEnergyActiveImportRegisterValue?: number // In Wh
  transactionId?: number
  transactionIdTag?: string
  transactionRemoteStarted?: boolean
  transactionStarted?: boolean
}

export interface EvseStatus extends JsonObject {
  availability: AvailabilityType
  connectors?: ConnectorStatus[]
}

export const FirmwareStatus = {
  ...OCPP16FirmwareStatus,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type FirmwareStatus = OCPP16FirmwareStatus

export interface FirmwareUpgrade extends JsonObject {
  failureStatus?: FirmwareStatus
  reset?: boolean
  versionUpgrade?: {
    patternGroup?: number
    step?: number
  }
}

export const IncomingRequestCommand = {
  ...OCPP16IncomingRequestCommand,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type IncomingRequestCommand = OCPP16IncomingRequestCommand

export interface OCPP16BootNotificationResponse extends JsonObject {
  currentTime: Date
  interval: number
  status: OCPP16RegistrationStatus
}

export interface OCPPConfigurationKey extends JsonObject {
  key: string
  readonly: boolean
  value?: string
}

export const MessageTrigger = {
  ...OCPP16MessageTrigger,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type MessageTrigger = OCPP16MessageTrigger

export const RequestCommand = {
  ...OCPP16RequestCommand,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type RequestCommand = OCPP16RequestCommand

export interface Status extends JsonObject {
  acceptedAuthorizeRequests?: number
  acceptedStartTransactionRequests?: number
  acceptedStopTransactionRequests?: number
  authorizeRequests?: number
  lastRunDate?: Date
  rejectedAuthorizeRequests?: number
  rejectedStartTransactionRequests?: number
  rejectedStopTransactionRequests?: number
  skippedConsecutiveTransactions?: number
  skippedTransactions?: number
  start?: boolean
  startDate?: Date
  startTransactionRequests?: number
  stopDate?: Date
  stoppedDate?: Date
  stopTransactionRequests?: number
}

interface CommandsSupport extends JsonObject {
  incomingCommands: Record<IncomingRequestCommand, boolean>
  outgoingCommands?: Record<RequestCommand, boolean>
}
