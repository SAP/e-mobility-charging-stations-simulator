import { ChargePointErrorCode } from './ChargePointErrorCode';
import { ChargePointStatus } from './ChargePointStatus';
import { ChargingProfile } from './ChargingProfile';
import OCPPError from '../../../charging-station/OcppError';

export default interface Requests {
  [id: string]: [(payload?, requestPayload?) => void, (error?: OCPPError) => void, Record<string, unknown>];
}

export enum RequestCommand {
  BOOT_NOTIFICATION = 'BootNotification',
  HEARTBEAT = 'Heartbeat',
  STATUS_NOTIFICATION = 'StatusNotification',
  CHANGE_CONFIGURATION = 'ChangeConfiguration',
  START_TRANSACTION = 'StartTransaction',
  STOP_TRANSACTION = 'StopTransaction',
  METERVALUES = 'MeterValues'
}

export enum IncomingRequestCommand {
  RESET = 'Reset',
  CLEAR_CACHE = 'ClearCache',
  UNLOCK_CONNECTOR = 'UnlockConnector',
  GET_CONFIGURATION = 'GetConfiguration',
  CHANGE_CONFIGURATION = 'ChangeConfiguration',
  SET_CHARGING_PROFILE = 'SetChargingProfile',
  REMOTE_START_TRANSACTION = 'RemoteStartTransaction',
  REMOTE_STOP_TRANSACTION = 'RemoteStopTransaction'
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface HeartbeatRequest {}

export interface BootNotificationRequest {
  chargeBoxSerialNumber?: string;
  chargePointModel: string;
  chargePointSerialNumber?: string;
  chargePointVendor: string;
  firmwareVersion?: string;
  iccid?: string;
  imsi?: string;
  meterSerialNumber?: string;
  meterType?: string;
}

export interface StatusNotificationRequest {
  connectorId: number;
  errorCode: ChargePointErrorCode;
  info?: string;
  status: ChargePointStatus;
  timestamp?: string;
  vendorId?: string;
  vendorErrorCode?: string;
}

export interface ChangeConfigurationRequest {
  key: string;
  value: string;
}

export interface RemoteStartTransactionRequest {
  connectorId: number;
  idTag: string;
  chargingProfile?: ChargingProfile;
}

export interface RemoteStopTransactionRequest {
  transactionId: number;
}

export interface UnlockConnectorRequest {
  connectorId: number;
}

export interface GetConfigurationRequest {
  key?: string[];
}

export enum ResetType {
  HARD = 'Hard',
  SOFT = 'Soft'
}

export interface ResetRequest {
  type: ResetType;
}

export interface SetChargingProfileRequest {
  connectorId: number;
  csChargingProfiles: ChargingProfile;
}
