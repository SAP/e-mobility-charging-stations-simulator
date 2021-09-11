import { OCPP16AvailabilityType, OCPP16BootNotificationRequest, OCPP16IncomingRequestCommand, OCPP16RequestCommand } from './1.6/Requests';

import { MessageType } from './MessageType';
import { OCPP16DiagnosticsStatus } from './1.6/DiagnosticsStatus';
import OCPPError from '../../charging-station/ocpp/OCPPError';

export type BootNotificationRequest = OCPP16BootNotificationRequest;

export type AvailabilityType = OCPP16AvailabilityType;

export const AvailabilityType = {
  ...OCPP16AvailabilityType
};

export type RequestCommand = OCPP16RequestCommand;

export const RequestCommand = {
  ...OCPP16RequestCommand
};

export type IncomingRequestCommand = OCPP16IncomingRequestCommand;

export const IncomingRequestCommand = {
  ...OCPP16IncomingRequestCommand
};

export type DiagnosticsStatus = OCPP16DiagnosticsStatus;

export const DiagnosticsStatus = {
  ...OCPP16DiagnosticsStatus
};

export type Request = [(payload: Record<string, unknown> | string, requestPayload: Record<string, unknown>) => void, (error: OCPPError) => void, Record<string, unknown>];

export type IncomingRequest = [MessageType, string, IncomingRequestCommand, Record<string, unknown>, Record<string, unknown>];
