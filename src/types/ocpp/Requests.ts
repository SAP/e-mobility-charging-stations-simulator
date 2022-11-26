import type ChargingStation from '../../charging-station/ChargingStation';
import type OCPPError from '../../exception/OCPPError';
import type { JsonType } from '../JsonType';
import { OCPP16DiagnosticsStatus } from './1.6/DiagnosticsStatus';
import type { OCPP16MeterValuesRequest } from './1.6/MeterValues';
import {
  OCPP16AvailabilityType,
  OCPP16BootNotificationRequest,
  OCPP16DataTransferRequest,
  OCPP16HeartbeatRequest,
  OCPP16IncomingRequestCommand,
  OCPP16MessageTrigger,
  OCPP16RequestCommand,
  OCPP16StatusNotificationRequest,
} from './1.6/Requests';
import type { MessageType } from './MessageType';

export type RequestCommand = OCPP16RequestCommand;

export const RequestCommand = {
  ...OCPP16RequestCommand,
};

export type OutgoingRequest = [MessageType.CALL_MESSAGE, string, RequestCommand, JsonType];

export type RequestParams = {
  skipBufferingOnError?: boolean;
  triggerMessage?: boolean;
};

export type IncomingRequestCommand = OCPP16IncomingRequestCommand;

export const IncomingRequestCommand = {
  ...OCPP16IncomingRequestCommand,
};

export type IncomingRequest = [MessageType.CALL_MESSAGE, string, IncomingRequestCommand, JsonType];

export type ResponseCallback = (payload: JsonType, requestPayload: JsonType) => void;

export type ErrorCallback = (error: OCPPError, requestStatistic?: boolean) => void;

export type CachedRequest = [
  ResponseCallback,
  ErrorCallback,
  RequestCommand | IncomingRequestCommand,
  JsonType
];

export type MessageTrigger = OCPP16MessageTrigger;

export const MessageTrigger = {
  ...OCPP16MessageTrigger,
};

export type BootNotificationRequest = OCPP16BootNotificationRequest;

export type HeartbeatRequest = OCPP16HeartbeatRequest;

export type StatusNotificationRequest = OCPP16StatusNotificationRequest;

export type MeterValuesRequest = OCPP16MeterValuesRequest;

export type DataTransferRequest = OCPP16DataTransferRequest;

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
