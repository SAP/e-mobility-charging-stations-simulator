import { OCPP16AvailabilityType, OCPP16BootNotificationRequest, OCPP16IncomingRequestCommand, OCPP16RequestCommand } from './1.6/Requests';

import { JsonType } from '../JsonType';
import { MessageType } from './MessageType';
import { OCPP16DiagnosticsStatus } from './1.6/DiagnosticsStatus';
import OCPPError from '../../exception/OCPPError';

export interface SendParams {
  skipBufferingOnError?: boolean,
  triggerMessage?: boolean
}

export type IncomingRequestHandler = (commandPayload: JsonType) => JsonType | Promise<JsonType>;

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

export type Request = [MessageType, string, RequestCommand, JsonType, JsonType];

export type IncomingRequest = [MessageType, string, IncomingRequestCommand, JsonType, JsonType];

export type CachedRequest = [(payload: JsonType, requestPayload: JsonType) => void, (error: OCPPError, requestStatistic?: boolean) => void, RequestCommand | IncomingRequestCommand, JsonType | OCPPError];
