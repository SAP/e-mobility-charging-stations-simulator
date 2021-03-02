import { OCPP16AvailabilityType, OCPP16BootNotificationRequest, OCPP16IncomingRequestCommand, OCPP16RequestCommand } from './1.6/Requests';

import { MessageType } from './MessageType';
import OCPPError from '../../charging-station/OcppError';

export default interface Requests {
  [id: string]: Request;
}

export type BootNotificationRequest = OCPP16BootNotificationRequest;

export type AvailabilityType = typeof AvailabilityType;

export const AvailabilityType = {
  ...OCPP16AvailabilityType
};

export type RequestCommand = typeof RequestCommand;

export const RequestCommand = {
  ...OCPP16RequestCommand
};

export type IncomingRequestCommand = typeof IncomingRequestCommand;

export const IncomingRequestCommand = {
  ...OCPP16IncomingRequestCommand
};

export type Request = [(payload?: Record<string, unknown>, requestPayload?: Record<string, unknown>) => void, (error?: OCPPError) => void, Record<string, unknown>];

export type IncomingRequest = [MessageType, string, IncomingRequestCommand, Record<string, unknown>, Record<string, unknown>];
