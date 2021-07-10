import { ChargingProfilePurposeType, OCPP16ChargingProfile } from './ChargingProfile';

import { OCPP16ChargePointErrorCode } from './ChargePointErrorCode';
import { OCPP16ChargePointStatus } from './ChargePointStatus';
import { OCPP16DiagnosticsStatus } from './DiagnosticsStatus';
import { OCPP16StandardParametersKey } from './Configuration';

export enum OCPP16RequestCommand {
  BOOT_NOTIFICATION = 'BootNotification',
  HEARTBEAT = 'Heartbeat',
  STATUS_NOTIFICATION = 'StatusNotification',
  CHANGE_CONFIGURATION = 'ChangeConfiguration',
  AUTHORIZE = 'Authorize',
  START_TRANSACTION = 'StartTransaction',
  STOP_TRANSACTION = 'StopTransaction',
  METER_VALUES = 'MeterValues',
  DIAGNOSTICS_STATUS_NOTIFICATION= 'DiagnosticsStatusNotification'
}

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
  GET_DIAGNOSTICS = 'GetDiagnostics'
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface HeartbeatRequest { }

export interface OCPP16BootNotificationRequest {
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
  errorCode: OCPP16ChargePointErrorCode;
  info?: string;
  status: OCPP16ChargePointStatus;
  timestamp?: string;
  vendorId?: string;
  vendorErrorCode?: string;
}

export interface ChangeConfigurationRequest {
  key: string | OCPP16StandardParametersKey;
  value: string;
}

export interface RemoteStartTransactionRequest {
  connectorId: number;
  idTag: string;
  chargingProfile?: OCPP16ChargingProfile;
}

export interface RemoteStopTransactionRequest {
  transactionId: number;
}

export interface UnlockConnectorRequest {
  connectorId: number;
}

export interface GetConfigurationRequest {
  key?: string | OCPP16StandardParametersKey[];
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
  csChargingProfiles: OCPP16ChargingProfile;
}

export enum OCPP16AvailabilityType {
  INOPERATIVE = 'Inoperative',
  OPERATIVE = 'Operative'
}

export interface ChangeAvailabilityRequest {
  connectorId: number;
  type: OCPP16AvailabilityType;
}

export interface ClearChargingProfileRequest {
  id?: number;
  connectorId?: number;
  chargingProfilePurpose?: ChargingProfilePurposeType;
  stackLevel?: number;
}

export interface GetDiagnosticsRequest {
  location: string;
  retries?: number;
  retryInterval?: number;
  startTime?: Date;
  stopTime?: Date;
}

export interface DiagnosticsStatusNotificationRequest {
  status: OCPP16DiagnosticsStatus
}
