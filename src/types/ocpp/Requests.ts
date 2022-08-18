import type ChargingStation from '../../charging-station/ChargingStation';
import OCPPError from '../../exception/OCPPError';
import { JsonType } from '../JsonType';
import { OCPP16DiagnosticsStatus } from './1.6/DiagnosticsStatus';
import { OCPP16MeterValuesRequest } from './1.6/MeterValues';
import {
  OCPP16AvailabilityType,
  OCPP16BootNotificationRequest,
  OCPP16HeartbeatRequest,
  OCPP16IncomingRequestCommand,
  OCPP16RequestCommand,
  OCPP16StatusNotificationRequest,
} from './1.6/Requests';
import { MessageType } from './MessageType';

export type RequestCommand = OCPP16RequestCommand;

export const RequestCommand = {
  ...OCPP16RequestCommand,
};

export type OutgoingRequest = [MessageType.CALL_MESSAGE, string, RequestCommand, JsonType];

export interface RequestParams {
  skipBufferingOnError?: boolean;
  triggerMessage?: boolean;
}

export type IncomingRequestCommand = OCPP16IncomingRequestCommand;

export const IncomingRequestCommand = {
  ...OCPP16IncomingRequestCommand,
};

export type IncomingRequest = [MessageType.CALL_MESSAGE, string, IncomingRequestCommand, JsonType];

export type CachedRequest = [
  (payload: JsonType, requestPayload: JsonType) => void,
  (error: OCPPError, requestStatistic?: boolean) => void,
  RequestCommand | IncomingRequestCommand,
  JsonType
];

export type BootNotificationRequest = OCPP16BootNotificationRequest;

export type HeartbeatRequest = OCPP16HeartbeatRequest;

export type StatusNotificationRequest = OCPP16StatusNotificationRequest;

export type MeterValuesRequest = OCPP16MeterValuesRequest;

export type IncomingRequestHandler = (
  chargingStation: ChargingStation,
  commandPayload: JsonType
) => JsonType | Promise<JsonType>;

export type AvailabilityType = OCPP16AvailabilityType;

export const AvailabilityType = {
  ...OCPP16AvailabilityType,
};

export type DiagnosticsStatus = OCPP16DiagnosticsStatus;

export const DiagnosticsStatus = {
  ...OCPP16DiagnosticsStatus,
};

export type ResponseType = JsonType | OCPPError;
