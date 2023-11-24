import type { JsonObject } from './JsonType';

export type ChargingStationData = {
  started: boolean;
  stationInfo: ChargingStationInfo;
  connectors: ConnectorStatus[];
  evses: EvseStatus[];
  wsState?:
    | typeof WebSocket.CONNECTING
    | typeof WebSocket.OPEN
    | typeof WebSocket.CLOSING
    | typeof WebSocket.CLOSED;
  bootNotificationResponse?: BootNotificationResponse;
  automaticTransactionGenerator?: Status[];
};

export enum OCPP16FirmwareStatus {
  Downloaded = 'Downloaded',
  DownloadFailed = 'DownloadFailed',
  Downloading = 'Downloading',
  Idle = 'Idle',
  InstallationFailed = 'InstallationFailed',
  Installing = 'Installing',
  Installed = 'Installed',
}

export const FirmwareStatus = {
  ...OCPP16FirmwareStatus,
} as const;
export type FirmwareStatus = OCPP16FirmwareStatus;

export type ChargingStationInfo = {
  hashId: string;
  chargingStationId?: string;
  chargePointModel: string;
  chargePointVendor: string;
  firmwareVersionPattern?: string;
  firmwareVersion?: string;
  firmwareStatus?: FirmwareStatus;
  numberOfConnectors?: number | number[];
  baseName: string;
  templateHash?: string;
  chargeBoxSerialNumber?: string;
  chargePointSerialNumber?: string;
  meterSerialNumber?: string;
  maximumPower?: number; // Always in Watt
  maximumAmperage?: number; // Always in Ampere
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
  idTagsFile?: string;
  nameSuffix?: string;
  fixedName?: boolean;
  iccid?: string;
  imsi?: string;
  meterType?: string;
  powerSharedByConnectors?: boolean;
  currentOutType?: CurrentType;
  voltageOut?: Voltage;
  numberOfPhases?: number;
  useConnectorId0?: boolean;
  randomConnectors?: boolean;
  resetTime?: number;
  autoRegister?: boolean;
  autoReconnectMaxRetries?: number;
  reconnectExponentialDelay?: boolean;
  registrationMaxRetries?: number;
  enableStatistics?: boolean;
  remoteAuthorization?: boolean;
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
};

export enum OCPP16IncomingRequestCommand {
  RESET = 'Reset',
  CLEAR_CACHE = 'ClearCache',
  CHANGE_AVAILABILITY = 'ChangeAvailability',
  UNLOCK_CONNECTOR = 'UnlockConnector',
  GET_CONFIGURATION = 'GetConfiguration',
  CHANGE_CONFIGURATION = 'ChangeConfiguration',
  SET_CHARGING_PROFILE = 'SetChargingProfile',
  CLEAR_CHARGING_PROFILE = 'ClearChargingProfile',
  REMOTE_START_TRANSACTION = 'RemoteStartTransaction',
  REMOTE_STOP_TRANSACTION = 'RemoteStopTransaction',
  GET_DIAGNOSTICS = 'GetDiagnostics',
  TRIGGER_MESSAGE = 'TriggerMessage',
}

export const IncomingRequestCommand = {
  ...OCPP16IncomingRequestCommand,
} as const;
export type IncomingRequestCommand = OCPP16IncomingRequestCommand;

export enum OCPP16RequestCommand {
  BOOT_NOTIFICATION = 'BootNotification',
  HEARTBEAT = 'Heartbeat',
  STATUS_NOTIFICATION = 'StatusNotification',
  AUTHORIZE = 'Authorize',
  START_TRANSACTION = 'StartTransaction',
  STOP_TRANSACTION = 'StopTransaction',
  METER_VALUES = 'MeterValues',
  DIAGNOSTICS_STATUS_NOTIFICATION = 'DiagnosticsStatusNotification',
}

export const RequestCommand = {
  ...OCPP16RequestCommand,
} as const;
export type RequestCommand = OCPP16RequestCommand;

export type BootNotificationResponse = OCPP16BootNotificationResponse;

export enum OCPP16RegistrationStatus {
  ACCEPTED = 'Accepted',
  PENDING = 'Pending',
  REJECTED = 'Rejected',
}

export interface OCPP16BootNotificationResponse extends JsonObject {
  status: OCPP16RegistrationStatus;
  currentTime: Date;
  interval: number;
}

export enum OCPP16MessageTrigger {
  BootNotification = 'BootNotification',
  DiagnosticsStatusNotification = 'DiagnosticsStatusNotification',
  FirmwareStatusNotification = 'FirmwareStatusNotification',
  Heartbeat = 'Heartbeat',
  MeterValues = 'MeterValues',
  StatusNotification = 'StatusNotification',
}

export const MessageTrigger = {
  ...OCPP16MessageTrigger,
} as const;
export type MessageTrigger = OCPP16MessageTrigger;

type CommandsSupport = {
  incomingCommands: Record<IncomingRequestCommand, boolean>;
  outgoingCommands?: Record<RequestCommand, boolean>;
};

export enum OCPPVersion {
  VERSION_16 = '1.6',
  VERSION_20 = '2.0',
}

export enum OCPPProtocol {
  JSON = 'json',
}

export enum CurrentType {
  AC = 'AC',
  DC = 'DC',
}

export enum Voltage {
  VOLTAGE_110 = 110,
  VOLTAGE_230 = 230,
  VOLTAGE_400 = 400,
  VOLTAGE_800 = 800,
}

export enum AmpereUnits {
  MILLI_AMPERE = 'mA',
  CENTI_AMPERE = 'cA',
  DECI_AMPERE = 'dA',
  AMPERE = 'A',
}

export type ConnectorStatus = {
  availability: AvailabilityType;
  bootStatus?: ChargePointStatus;
  status?: ChargePointStatus;
  authorizeIdTag?: string;
  idTagAuthorized?: boolean;
  localAuthorizeIdTag?: string;
  idTagLocalAuthorized?: boolean;
  transactionRemoteStarted?: boolean;
  transactionStarted?: boolean;
  transactionId?: number;
  transactionIdTag?: string;
  energyActiveImportRegisterValue?: number; // In Wh
  transactionEnergyActiveImportRegisterValue?: number; // In Wh
};

export type EvseStatus = {
  availability: AvailabilityType;
  connectors?: ConnectorStatus[];
};

export enum OCPP16AvailabilityType {
  INOPERATIVE = 'Inoperative',
  OPERATIVE = 'Operative',
}
export type AvailabilityType = OCPP16AvailabilityType;

export enum OCPP16ChargePointStatus {
  AVAILABLE = 'Available',
  PREPARING = 'Preparing',
  CHARGING = 'Charging',
  OCCUPIED = 'Occupied',
  SUSPENDED_EVSE = 'SuspendedEVSE',
  SUSPENDED_EV = 'SuspendedEV',
  FINISHING = 'Finishing',
  RESERVED = 'Reserved',
  UNAVAILABLE = 'Unavailable',
  FAULTED = 'Faulted',
}
export type ChargePointStatus = OCPP16ChargePointStatus;

export type Status = {
  start?: boolean;
  startDate?: Date;
  lastRunDate?: Date;
  stopDate?: Date;
  stoppedDate?: Date;
  authorizeRequests?: number;
  acceptedAuthorizeRequests?: number;
  rejectedAuthorizeRequests?: number;
  startTransactionRequests?: number;
  acceptedStartTransactionRequests?: number;
  rejectedStartTransactionRequests?: number;
  stopTransactionRequests?: number;
  acceptedStopTransactionRequests?: number;
  rejectedStopTransactionRequests?: number;
  skippedConsecutiveTransactions?: number;
  skippedTransactions?: number;
};
