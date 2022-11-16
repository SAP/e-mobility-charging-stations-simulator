import type ChargingStation from '../../charging-station/ChargingStation';
import type { JsonType } from '../JsonType';
import type { OCPP16MeterValuesResponse } from './1.6/MeterValues';
import {
  OCPP16AvailabilityStatus,
  OCPP16BootNotificationResponse,
  OCPP16ChargingProfileStatus,
  OCPP16ClearChargingProfileStatus,
  OCPP16ConfigurationStatus,
  OCPP16DataTransferResponse,
  OCPP16DataTransferStatus,
  OCPP16HeartbeatResponse,
  OCPP16RegistrationStatus,
  OCPP16StatusNotificationResponse,
  OCPP16TriggerMessageStatus,
  OCPP16UnlockStatus,
} from './1.6/Responses';
import type { ErrorType } from './ErrorType';
import type { MessageType } from './MessageType';

export type Response = [MessageType.CALL_RESULT_MESSAGE, string, JsonType];

export type ErrorResponse = [MessageType.CALL_ERROR_MESSAGE, string, ErrorType, string, JsonType];

export type ResponseHandler = (
  chargingStation: ChargingStation,
  payload: JsonType,
  requestPayload?: JsonType
) => void | Promise<void>;

export type BootNotificationResponse = OCPP16BootNotificationResponse;

export type HeartbeatResponse = OCPP16HeartbeatResponse;

export type StatusNotificationResponse = OCPP16StatusNotificationResponse;

export type MeterValuesResponse = OCPP16MeterValuesResponse;

export type DataTransferResponse = OCPP16DataTransferResponse;

export enum DefaultStatus {
  ACCEPTED = 'Accepted',
  REJECTED = 'Rejected',
}

export type DefaultResponse = {
  status: DefaultStatus;
};

export type RegistrationStatus = OCPP16RegistrationStatus;

export const RegistrationStatus = {
  ...OCPP16RegistrationStatus,
};

export type AvailabilityStatus = OCPP16AvailabilityStatus;

export const AvailabilityStatus = {
  ...OCPP16AvailabilityStatus,
};

export type ChargingProfileStatus = OCPP16ChargingProfileStatus;

export const ChargingProfileStatus = {
  ...OCPP16ChargingProfileStatus,
};

export type ClearChargingProfileStatus = OCPP16ClearChargingProfileStatus;

export const ClearChargingProfileStatus = {
  ...OCPP16ClearChargingProfileStatus,
};

export type ConfigurationStatus = OCPP16ConfigurationStatus;

export const ConfigurationStatus = {
  ...OCPP16ConfigurationStatus,
};

export type UnlockStatus = OCPP16UnlockStatus;

export const UnlockStatus = {
  ...OCPP16UnlockStatus,
};

export type TriggerMessageStatus = OCPP16TriggerMessageStatus;

export const TriggerMessageStatus = {
  ...OCPP16TriggerMessageStatus,
};

export type DataTransferStatus = OCPP16DataTransferStatus;

export const DataTransferStatus = {
  ...OCPP16DataTransferStatus,
};
