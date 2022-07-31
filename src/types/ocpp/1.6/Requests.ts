import { EmptyObject } from '../../EmptyObject';
import { JsonObject } from '../../JsonType';
import { OCPP16ChargePointErrorCode } from './ChargePointErrorCode';
import { OCPP16ChargePointStatus } from './ChargePointStatus';
import { ChargingProfilePurposeType, OCPP16ChargingProfile } from './ChargingProfile';
import { OCPP16StandardParametersKey } from './Configuration';
import { OCPP16DiagnosticsStatus } from './DiagnosticsStatus';

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

export type OCPP16HeartbeatRequest = EmptyObject;

export interface OCPP16BootNotificationRequest extends JsonObject {
  chargePointVendor: string;
  chargePointModel: string;
  chargePointSerialNumber?: string;
  chargeBoxSerialNumber?: string;
  firmwareVersion?: string;
  iccid?: string;
  imsi?: string;
  meterType?: string;
  meterSerialNumber?: string;
}

export interface OCPP16StatusNotificationRequest extends JsonObject {
  connectorId: number;
  errorCode: OCPP16ChargePointErrorCode;
  info?: string;
  status: OCPP16ChargePointStatus;
  timestamp?: string;
  vendorId?: string;
  vendorErrorCode?: string;
}

export interface ChangeConfigurationRequest extends JsonObject {
  key: string | OCPP16StandardParametersKey;
  value: string;
}

export interface RemoteStartTransactionRequest extends JsonObject {
  connectorId: number;
  idTag: string;
  chargingProfile?: OCPP16ChargingProfile;
}

export interface RemoteStopTransactionRequest extends JsonObject {
  transactionId: number;
}

export interface UnlockConnectorRequest extends JsonObject {
  connectorId: number;
}

export interface GetConfigurationRequest extends JsonObject {
  key?: string | OCPP16StandardParametersKey[];
}

export enum ResetType {
  HARD = 'Hard',
  SOFT = 'Soft',
}

export interface ResetRequest extends JsonObject {
  type: ResetType;
}

export interface SetChargingProfileRequest extends JsonObject {
  connectorId: number;
  csChargingProfiles: OCPP16ChargingProfile;
}

export enum OCPP16AvailabilityType {
  INOPERATIVE = 'Inoperative',
  OPERATIVE = 'Operative',
}

export interface ChangeAvailabilityRequest extends JsonObject {
  connectorId: number;
  type: OCPP16AvailabilityType;
}

export interface ClearChargingProfileRequest extends JsonObject {
  id?: number;
  connectorId?: number;
  chargingProfilePurpose?: ChargingProfilePurposeType;
  stackLevel?: number;
}

export interface GetDiagnosticsRequest extends JsonObject {
  location: string;
  retries?: number;
  retryInterval?: number;
  startTime?: Date;
  stopTime?: Date;
}

export interface DiagnosticsStatusNotificationRequest extends JsonObject {
  status: OCPP16DiagnosticsStatus;
}

export enum MessageTrigger {
  BootNotification = 'BootNotification',
  DiagnosticsStatusNotification = 'DiagnosticsStatusNotification',
  FirmwareStatusNotification = 'FirmwareStatusNotification',
  Heartbeat = 'Heartbeat',
  MeterValues = 'MeterValues',
  StatusNotification = 'StatusNotification',
}

export interface OCPP16TriggerMessageRequest extends JsonObject {
  requestedMessage: MessageTrigger;
  connectorId?: number;
}
