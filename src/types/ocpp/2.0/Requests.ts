import type {
  BootReasonEnumType,
  InstallCertificateUseEnumType,
  OCPP20ConnectorStatusEnumType,
} from './Common';
import type { OCPP20SetVariableDataType } from './Variables';
import type { EmptyObject } from '../../EmptyObject';
import type { JsonObject } from '../../JsonType';

export enum OCPP20RequestCommand {
  BOOT_NOTIFICATION = 'BootNotification',
  HEARTBEAT = 'Heartbeat',
  STATUS_NOTIFICATION = 'StatusNotification',
}

export enum OCPP20IncomingRequestCommand {
  CLEAR_CACHE = 'ClearCache',
  REQUEST_START_TRANSACTION = 'RequestStartTransaction',
  REQUEST_STOP_TRANSACTION = 'RequestStopTransaction',
}

type ModemType = {
  iccid?: string;
  imsi?: string;
} & JsonObject;

type ChargingStationType = {
  serialNumber?: string;
  model: string;
  vendorName: string;
  firmwareVersion?: string;
  modem?: ModemType;
} & JsonObject;

export type OCPP20BootNotificationRequest = {
  reason: BootReasonEnumType;
  chargingStation: ChargingStationType;
} & JsonObject;

export type OCPP20HeartbeatRequest = EmptyObject;

export type OCPP20ClearCacheRequest = EmptyObject;

export type OCPP20StatusNotificationRequest = {
  timestamp: Date;
  connectorStatus: OCPP20ConnectorStatusEnumType;
  evseId: number;
  connectorId: number;
} & JsonObject;

export type OCPP20SetVariablesRequest = {
  setVariableData: OCPP20SetVariableDataType[];
} & JsonObject;

export type OCPP20InstallCertificateRequest = {
  certificateType: InstallCertificateUseEnumType;
  certificate: string;
} & JsonObject;
