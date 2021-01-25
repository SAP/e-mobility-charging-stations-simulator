import { ChargingProfile, ChargingProfilePurposeType } from './ChargingProfile';

import { ChargePointErrorCode } from './ChargePointErrorCode';
import { ChargePointStatus } from './ChargePointStatus';
import { StandardParametersKey } from './Configuration';

export enum RequestCommand {
  BOOT_NOTIFICATION = 'BootNotification',
  HEARTBEAT = 'Heartbeat',
  STATUS_NOTIFICATION = 'StatusNotification',
  CHANGE_CONFIGURATION = 'ChangeConfiguration',
  AUTHORIZE = 'Authorize',
  START_TRANSACTION = 'StartTransaction',
  STOP_TRANSACTION = 'StopTransaction',
  METERVALUES = 'MeterValues'
}

export enum IncomingRequestCommand {
  RESET = 'Reset',
  CLEAR_CACHE = 'ClearCache',
  CHANGE_AVAILABILITY = 'ChangeAvailability',
  UNLOCK_CONNECTOR = 'UnlockConnector',
  GET_CONFIGURATION = 'GetConfiguration',
  CHANGE_CONFIGURATION = 'ChangeConfiguration',
  SET_CHARGING_PROFILE = 'SetChargingProfile',
  CLEAR_CHARGING_PROFILE = 'ClearChargingProfile',
  REMOTE_START_TRANSACTION = 'RemoteStartTransaction',
  REMOTE_STOP_TRANSACTION = 'RemoteStopTransaction'
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface HeartbeatRequest { }

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
  key: string | StandardParametersKey;
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
  key?: string | StandardParametersKey[];
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

export enum AvailabilityType {
  INOPERATIVE = 'Inoperative',
  OPERATIVE = 'Operative'
}

export interface ChangeAvailabilityRequest {
  connectorId: number;
  type: AvailabilityType;
}

export interface ClearChargingProfileRequest {
  id?: number;
  connectorId?: number;
  chargingProfilePurpose?: ChargingProfilePurposeType;
  stackLevel?: number;
}
