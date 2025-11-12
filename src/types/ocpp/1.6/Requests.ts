import type { EmptyObject } from '../../EmptyObject.js'
import type { JsonObject } from '../../JsonType.js'
import type { OCPP16ChargePointErrorCode } from './ChargePointErrorCode.js'
import type { OCPP16ChargePointStatus } from './ChargePointStatus.js'
import type {
  OCPP16ChargingProfile,
  OCPP16ChargingProfilePurposeType,
  OCPP16ChargingRateUnitType,
} from './ChargingProfile.js'
import type { OCPP16StandardParametersKey, OCPP16VendorParametersKey } from './Configuration.js'
import type { OCPP16DiagnosticsStatus } from './DiagnosticsStatus.js'

export const enum OCPP16AvailabilityType {
  Inoperative = 'Inoperative',
  Operative = 'Operative',
}

export const enum OCPP16FirmwareStatus {
  Downloaded = 'Downloaded',
  DownloadFailed = 'DownloadFailed',
  Downloading = 'Downloading',
  Idle = 'Idle',
  InstallationFailed = 'InstallationFailed',
  Installed = 'Installed',
  Installing = 'Installing',
}

export const enum OCPP16IncomingRequestCommand {
  CANCEL_RESERVATION = 'CancelReservation',
  CHANGE_AVAILABILITY = 'ChangeAvailability',
  CHANGE_CONFIGURATION = 'ChangeConfiguration',
  CLEAR_CACHE = 'ClearCache',
  CLEAR_CHARGING_PROFILE = 'ClearChargingProfile',
  DATA_TRANSFER = 'DataTransfer',
  GET_COMPOSITE_SCHEDULE = 'GetCompositeSchedule',
  GET_CONFIGURATION = 'GetConfiguration',
  GET_DIAGNOSTICS = 'GetDiagnostics',
  REMOTE_START_TRANSACTION = 'RemoteStartTransaction',
  REMOTE_STOP_TRANSACTION = 'RemoteStopTransaction',
  RESERVE_NOW = 'ReserveNow',
  RESET = 'Reset',
  SET_CHARGING_PROFILE = 'SetChargingProfile',
  TRIGGER_MESSAGE = 'TriggerMessage',
  UNLOCK_CONNECTOR = 'UnlockConnector',
  UPDATE_FIRMWARE = 'UpdateFirmware',
}

export enum OCPP16MessageTrigger {
  BootNotification = 'BootNotification',
  DiagnosticsStatusNotification = 'DiagnosticsStatusNotification',
  FirmwareStatusNotification = 'FirmwareStatusNotification',
  Heartbeat = 'Heartbeat',
  MeterValues = 'MeterValues',
  StatusNotification = 'StatusNotification',
}

export const enum OCPP16RequestCommand {
  AUTHORIZE = 'Authorize',
  BOOT_NOTIFICATION = 'BootNotification',
  DATA_TRANSFER = 'DataTransfer',
  DIAGNOSTICS_STATUS_NOTIFICATION = 'DiagnosticsStatusNotification',
  FIRMWARE_STATUS_NOTIFICATION = 'FirmwareStatusNotification',
  HEARTBEAT = 'Heartbeat',
  METER_VALUES = 'MeterValues',
  START_TRANSACTION = 'StartTransaction',
  STATUS_NOTIFICATION = 'StatusNotification',
  STOP_TRANSACTION = 'StopTransaction',
}

export const enum ResetType {
  HARD = 'Hard',
  SOFT = 'Soft',
}

export interface ChangeConfigurationRequest extends JsonObject {
  key: OCPP16ConfigurationKey
  value: string
}

export interface GetConfigurationRequest extends JsonObject {
  key?: OCPP16ConfigurationKey[]
}

export interface GetDiagnosticsRequest extends JsonObject {
  location: string
  retries?: number
  retryInterval?: number
  startTime?: Date
  stopTime?: Date
}

export interface OCPP16BootNotificationRequest extends JsonObject {
  chargeBoxSerialNumber?: string
  chargePointModel: string
  chargePointSerialNumber?: string
  chargePointVendor: string
  firmwareVersion?: string
  iccid?: string
  imsi?: string
  meterSerialNumber?: string
  meterType?: string
}

export interface OCPP16CancelReservationRequest extends JsonObject {
  reservationId: number
}

export interface OCPP16ChangeAvailabilityRequest extends JsonObject {
  connectorId: number
  type: OCPP16AvailabilityType
}

export type OCPP16ClearCacheRequest = EmptyObject

export interface OCPP16ClearChargingProfileRequest extends JsonObject {
  chargingProfilePurpose?: OCPP16ChargingProfilePurposeType
  connectorId?: number
  id?: number
  stackLevel?: number
}

export interface OCPP16DataTransferRequest extends JsonObject {
  data?: string
  messageId?: string
  vendorId: string
}

export interface OCPP16DiagnosticsStatusNotificationRequest extends JsonObject {
  status: OCPP16DiagnosticsStatus
}

export interface OCPP16FirmwareStatusNotificationRequest extends JsonObject {
  status: OCPP16FirmwareStatus
}

export interface OCPP16GetCompositeScheduleRequest extends JsonObject {
  chargingRateUnit?: OCPP16ChargingRateUnitType
  connectorId: number
  duration: number
}

export type OCPP16HeartbeatRequest = EmptyObject

export interface OCPP16ReserveNowRequest extends JsonObject {
  connectorId: number
  expiryDate: Date
  idTag: string
  parentIdTag?: string
  reservationId: number
}

export interface OCPP16StatusNotificationRequest extends JsonObject {
  connectorId: number
  errorCode: OCPP16ChargePointErrorCode
  info?: string
  status: OCPP16ChargePointStatus
  timestamp?: Date
  vendorErrorCode?: string
  vendorId?: string
}

export interface OCPP16TriggerMessageRequest extends JsonObject {
  connectorId?: number
  requestedMessage: OCPP16MessageTrigger
}

export interface OCPP16UpdateFirmwareRequest extends JsonObject {
  location: string
  retries?: number
  retrieveDate: Date
  retryInterval?: number
}

export interface RemoteStartTransactionRequest extends JsonObject {
  chargingProfile?: OCPP16ChargingProfile
  connectorId?: number
  idTag: string
}

export interface RemoteStopTransactionRequest extends JsonObject {
  transactionId: number
}

export interface ResetRequest extends JsonObject {
  type: ResetType
}

export interface SetChargingProfileRequest extends JsonObject {
  connectorId: number
  csChargingProfiles: OCPP16ChargingProfile
}

export interface UnlockConnectorRequest extends JsonObject {
  connectorId: number
}

type OCPP16ConfigurationKey = OCPP16StandardParametersKey | OCPP16VendorParametersKey | string
