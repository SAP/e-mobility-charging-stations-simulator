import type { ChargingStation } from '../../charging-station';
import {
  type ErrorType,
  type JsonType,
  type MessageType,
  OCPP16AvailabilityStatus,
  type OCPP16BootNotificationResponse,
  OCPP16ChargingProfileStatus,
  OCPP16ClearChargingProfileStatus,
  OCPP16ConfigurationStatus,
  type OCPP16DataTransferResponse,
  OCPP16DataTransferStatus,
  type OCPP16DiagnosticsStatusNotificationResponse,
  type OCPP16FirmwareStatusNotificationResponse,
  type OCPP16HeartbeatResponse,
  type OCPP16MeterValuesResponse,
  type OCPP16StatusNotificationResponse,
  OCPP16TriggerMessageStatus,
  OCPP16UnlockStatus,
  type OCPP20BootNotificationResponse,
  type OCPP20ClearCacheResponse,
  type OCPP20StatusNotificationResponse,
} from '../internal';

export type Response = [MessageType.CALL_RESULT_MESSAGE, string, JsonType];

export type ErrorResponse = [MessageType.CALL_ERROR_MESSAGE, string, ErrorType, string, JsonType];

export type ResponseHandler = (
  chargingStation: ChargingStation,
  payload: JsonType,
  requestPayload?: JsonType
) => void | Promise<void>;

export type BootNotificationResponse =
  | OCPP16BootNotificationResponse
  | OCPP20BootNotificationResponse;

export type HeartbeatResponse = OCPP16HeartbeatResponse;

export type ClearCacheResponse = GenericResponse | OCPP20ClearCacheResponse;

export type StatusNotificationResponse =
  | OCPP16StatusNotificationResponse
  | OCPP20StatusNotificationResponse;

export type MeterValuesResponse = OCPP16MeterValuesResponse;

export type DataTransferResponse = OCPP16DataTransferResponse;

export type DiagnosticsStatusNotificationResponse = OCPP16DiagnosticsStatusNotificationResponse;

export type FirmwareStatusNotificationResponse = OCPP16FirmwareStatusNotificationResponse;

export enum GenericStatus {
  ACCEPTED = 'Accepted',
  REJECTED = 'Rejected',
}

export type GenericResponse = {
  status: GenericStatus;
};

export enum RegistrationStatusEnumType {
  ACCEPTED = 'Accepted',
  PENDING = 'Pending',
  REJECTED = 'Rejected',
}

export const AvailabilityStatus = {
  ...OCPP16AvailabilityStatus,
} as const;
export type AvailabilityStatus = OCPP16AvailabilityStatus;

export const ChargingProfileStatus = {
  ...OCPP16ChargingProfileStatus,
} as const;
export type ChargingProfileStatus = OCPP16ChargingProfileStatus;

export const ClearChargingProfileStatus = {
  ...OCPP16ClearChargingProfileStatus,
} as const;
export type ClearChargingProfileStatus = OCPP16ClearChargingProfileStatus;

export const ConfigurationStatus = {
  ...OCPP16ConfigurationStatus,
} as const;
export type ConfigurationStatus = OCPP16ConfigurationStatus;

export const UnlockStatus = {
  ...OCPP16UnlockStatus,
} as const;
export type UnlockStatus = OCPP16UnlockStatus;

export const TriggerMessageStatus = {
  ...OCPP16TriggerMessageStatus,
} as const;
export type TriggerMessageStatus = OCPP16TriggerMessageStatus;

export const DataTransferStatus = {
  ...OCPP16DataTransferStatus,
} as const;
export type DataTransferStatus = OCPP16DataTransferStatus;
