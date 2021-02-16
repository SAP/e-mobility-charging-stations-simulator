import { OCPP16BootNotificationResponse, OCPP16RegistrationStatus } from './1.6/Responses';

export type BootNotificationResponse = OCPP16BootNotificationResponse;

export type RegistrationStatus = OCPP16RegistrationStatus;

export const RegistrationStatus = {
  ...OCPP16RegistrationStatus
};
