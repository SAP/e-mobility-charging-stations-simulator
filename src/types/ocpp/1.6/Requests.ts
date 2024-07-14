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

export enum OCPP16RequestCommand {
  BOOT_NOTIFICATION = 'BootNotification',
  HEARTBEAT = 'Heartbeat',
  STATUS_NOTIFICATION = 'StatusNotification',
  AUTHORIZE = 'Authorize',
  START_TRANSACTION = 'StartTransaction',
  STOP_TRANSACTION = 'StopTransaction',
  METER_VALUES = 'MeterValues',
  DIAGNOSTICS_STATUS_NOTIFICATION = 'DiagnosticsStatusNotification',
  FIRMWARE_STATUS_NOTIFICATION = 'FirmwareStatusNotification',
  DATA_TRANSFER = 'DataTransfer'
}

export enum OCPP16IncomingRequestCommand {
  RESET = 'Reset',
  CLEAR_CACHE = 'ClearCache',
  CHANGE_AVAILABILITY = 'ChangeAvailability',
  UNLOCK_CONNECTOR = 'UnlockConnector',
  GET_CONFIGURATION = 'GetConfiguration',
  CHANGE_CONFIGURATION = 'ChangeConfiguration',
  GET_COMPOSITE_SCHEDULE = 'GetCompositeSchedule',
  SET_CHARGING_PROFILE = 'SetChargingProfile',
  CLEAR_CHARGING_PROFILE = 'ClearChargingProfile',
  REMOTE_START_TRANSACTION = 'RemoteStartTransaction',
  REMOTE_STOP_TRANSACTION = 'RemoteStopTransaction',
  GET_DIAGNOSTICS = 'GetDiagnostics',
  TRIGGER_MESSAGE = 'TriggerMessage',
  DATA_TRANSFER = 'DataTransfer',
  UPDATE_FIRMWARE = 'UpdateFirmware',
  RESERVE_NOW = 'ReserveNow',
  CANCEL_RESERVATION = 'CancelReservation'
}

export type OCPP16HeartbeatRequest = EmptyObject

export interface OCPP16BootNotificationRequest extends JsonObject {
  chargePointVendor: string
  chargePointModel: string
  chargePointSerialNumber?: string
  chargeBoxSerialNumber?: string
  firmwareVersion?: string
  iccid?: string
  imsi?: string
  meterType?: string
  meterSerialNumber?: string
}

export interface OCPP16StatusNotificationRequest extends JsonObject {
  connectorId: number
  errorCode: OCPP16ChargePointErrorCode
  status: OCPP16ChargePointStatus
  info?: string
  timestamp?: Date
  vendorId?: string
  vendorErrorCode?: string
}

export type OCPP16ClearCacheRequest = EmptyObject

type OCPP16ConfigurationKey = string | OCPP16StandardParametersKey | OCPP16VendorParametersKey

export interface ChangeConfigurationRequest extends JsonObject {
  key: OCPP16ConfigurationKey
  value: string
}

export interface RemoteStartTransactionRequest extends JsonObject {
  connectorId?: number
  idTag: string
  chargingProfile?: OCPP16ChargingProfile
}

export interface RemoteStopTransactionRequest extends JsonObject {
  transactionId: number
}

export interface UnlockConnectorRequest extends JsonObject {
  connectorId: number
}

export interface GetConfigurationRequest extends JsonObject {
  key?: OCPP16ConfigurationKey[]
}

enum ResetType {
  HARD = 'Hard',
  SOFT = 'Soft'
}

export interface ResetRequest extends JsonObject {
  type: ResetType
}

export interface OCPP16GetCompositeScheduleRequest extends JsonObject {
  connectorId: number
  duration: number
  chargingRateUnit?: OCPP16ChargingRateUnitType
}

export interface SetChargingProfileRequest extends JsonObject {
  connectorId: number
  csChargingProfiles: OCPP16ChargingProfile
}

export enum OCPP16AvailabilityType {
  Inoperative = 'Inoperative',
  Operative = 'Operative'
}

export interface OCPP16ChangeAvailabilityRequest extends JsonObject {
  connectorId: number
  type: OCPP16AvailabilityType
}

export interface OCPP16ClearChargingProfileRequest extends JsonObject {
  id?: number
  connectorId?: number
  chargingProfilePurpose?: OCPP16ChargingProfilePurposeType
  stackLevel?: number
}

export interface OCPP16UpdateFirmwareRequest extends JsonObject {
  location: string
  retrieveDate: Date
  retries?: number
  retryInterval?: number
}

export enum OCPP16FirmwareStatus {
  Downloaded = 'Downloaded',
  DownloadFailed = 'DownloadFailed',
  Downloading = 'Downloading',
  Idle = 'Idle',
  InstallationFailed = 'InstallationFailed',
  Installing = 'Installing',
  Installed = 'Installed'
}

export interface OCPP16FirmwareStatusNotificationRequest extends JsonObject {
  status: OCPP16FirmwareStatus
}

export interface GetDiagnosticsRequest extends JsonObject {
  location: string
  retries?: number
  retryInterval?: number
  startTime?: Date
  stopTime?: Date
}

export interface OCPP16DiagnosticsStatusNotificationRequest extends JsonObject {
  status: OCPP16DiagnosticsStatus
}

export enum OCPP16MessageTrigger {
  BootNotification = 'BootNotification',
  DiagnosticsStatusNotification = 'DiagnosticsStatusNotification',
  FirmwareStatusNotification = 'FirmwareStatusNotification',
  Heartbeat = 'Heartbeat',
  MeterValues = 'MeterValues',
  StatusNotification = 'StatusNotification'
}

export interface OCPP16TriggerMessageRequest extends JsonObject {
  requestedMessage: OCPP16MessageTrigger
  connectorId?: number
}

export enum OCPP16DataTransferVendorId {}

export interface OCPP16DataTransferRequest extends JsonObject {
  vendorId: string
  messageId?: string
  data?: string
}

export interface OCPP16ReserveNowRequest extends JsonObject {
  connectorId: number
  expiryDate: Date
  idTag: string
  parentIdTag?: string
  reservationId: number
}

export interface OCPP16CancelReservationRequest extends JsonObject {
  reservationId: number
}
