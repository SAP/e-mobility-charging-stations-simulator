import { OCPP16AvailabilityStatus, OCPP16BootNotificationResponse, OCPP16ChargingProfileStatus, OCPP16ClearChargingProfileStatus, OCPP16ConfigurationStatus, OCPP16RegistrationStatus, OCPP16TriggerMessageStatus, OCPP16UnlockStatus } from './1.6/Responses';

export type BootNotificationResponse = OCPP16BootNotificationResponse;

export enum DefaultStatus {
  ACCEPTED = 'Accepted',
  REJECTED = 'Rejected'
}

export interface DefaultResponse {
  status: DefaultStatus;
}

export type RegistrationStatus = OCPP16RegistrationStatus;

export const RegistrationStatus = {
  ...OCPP16RegistrationStatus
};

export type AvailabilityStatus = OCPP16AvailabilityStatus;

export const AvailabilityStatus = {
  ...OCPP16AvailabilityStatus
};

export type ChargingProfileStatus = OCPP16ChargingProfileStatus;

export const ChargingProfileStatus = {
  ...OCPP16ChargingProfileStatus
};

export type ClearChargingProfileStatus = OCPP16ClearChargingProfileStatus;

export const ClearChargingProfileStatus = {
  ...OCPP16ClearChargingProfileStatus
};

export type ConfigurationStatus = OCPP16ConfigurationStatus;

export const ConfigurationStatus = {
  ...OCPP16ConfigurationStatus
};

export type UnlockStatus = OCPP16UnlockStatus;

export const UnlockStatus = {
  ...OCPP16UnlockStatus
};

export type TriggerMessageStatus = OCPP16TriggerMessageStatus;

export const TriggerMessageStatus = {
  ...OCPP16TriggerMessageStatus
};
