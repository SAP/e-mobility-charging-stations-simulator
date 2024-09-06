import type { EmptyObject } from '../../EmptyObject.js'
import type { JsonObject } from '../../JsonType.js'
import type { GenericStatus, RegistrationStatusEnumType } from '../Common.js'
import type { OCPPConfigurationKey } from '../Configuration.js'
import type { OCPP16ChargingSchedule } from './ChargingProfile.js'

export interface OCPP16HeartbeatResponse extends JsonObject {
  currentTime: Date
}

export enum OCPP16UnlockStatus {
  NOT_SUPPORTED = 'NotSupported',
  UNLOCK_FAILED = 'UnlockFailed',
  UNLOCKED = 'Unlocked',
}

export interface UnlockConnectorResponse extends JsonObject {
  status: OCPP16UnlockStatus
}

export enum OCPP16ConfigurationStatus {
  ACCEPTED = 'Accepted',
  NOT_SUPPORTED = 'NotSupported',
  REBOOT_REQUIRED = 'RebootRequired',
  REJECTED = 'Rejected',
}

export interface ChangeConfigurationResponse extends JsonObject {
  status: OCPP16ConfigurationStatus
}

export interface OCPP16BootNotificationResponse extends JsonObject {
  currentTime: Date
  interval: number
  status: RegistrationStatusEnumType
}

export type OCPP16StatusNotificationResponse = EmptyObject

export interface GetConfigurationResponse extends JsonObject {
  configurationKey: OCPPConfigurationKey[]
  unknownKey: string[]
}

export enum OCPP16ChargingProfileStatus {
  ACCEPTED = 'Accepted',
  NOT_SUPPORTED = 'NotSupported',
  REJECTED = 'Rejected',
}

export interface OCPP16GetCompositeScheduleResponse extends JsonObject {
  chargingSchedule?: OCPP16ChargingSchedule
  connectorId?: number
  scheduleStart?: Date
  status: GenericStatus
}

export interface SetChargingProfileResponse extends JsonObject {
  status: OCPP16ChargingProfileStatus
}

export enum OCPP16AvailabilityStatus {
  ACCEPTED = 'Accepted',
  REJECTED = 'Rejected',
  SCHEDULED = 'Scheduled',
}

export interface OCPP16ChangeAvailabilityResponse extends JsonObject {
  status: OCPP16AvailabilityStatus
}

export enum OCPP16ClearChargingProfileStatus {
  ACCEPTED = 'Accepted',
  UNKNOWN = 'Unknown',
}

export interface OCPP16ClearChargingProfileResponse extends JsonObject {
  status: OCPP16ClearChargingProfileStatus
}

export type OCPP16UpdateFirmwareResponse = EmptyObject

export type OCPP16FirmwareStatusNotificationResponse = EmptyObject

export interface GetDiagnosticsResponse extends JsonObject {
  fileName?: string
}

export type OCPP16DiagnosticsStatusNotificationResponse = EmptyObject

export enum OCPP16TriggerMessageStatus {
  ACCEPTED = 'Accepted',
  NOT_IMPLEMENTED = 'NotImplemented',
  REJECTED = 'Rejected',
}

export interface OCPP16TriggerMessageResponse extends JsonObject {
  status: OCPP16TriggerMessageStatus
}

export enum OCPP16DataTransferStatus {
  ACCEPTED = 'Accepted',
  REJECTED = 'Rejected',
  UNKNOWN_MESSAGE_ID = 'UnknownMessageId',
  UNKNOWN_VENDOR_ID = 'UnknownVendorId',
}

export interface OCPP16DataTransferResponse extends JsonObject {
  data?: string
  status: OCPP16DataTransferStatus
}

export enum OCPP16ReservationStatus {
  ACCEPTED = 'Accepted',
  FAULTED = 'Faulted',
  NOT_SUPPORTED = 'NotSupported',
  OCCUPIED = 'Occupied',
  REJECTED = 'Rejected',
  UNAVAILABLE = 'Unavailable',
}

export interface OCPP16ReserveNowResponse extends JsonObject {
  status: OCPP16ReservationStatus
}
