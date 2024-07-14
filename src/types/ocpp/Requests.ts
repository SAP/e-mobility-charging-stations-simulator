import type { ChargingStation } from '../../charging-station/index.js'
import type { OCPPError } from '../../exception/index.js'
import type { JsonType } from '../JsonType.js'
import { OCPP16DiagnosticsStatus } from './1.6/DiagnosticsStatus.js'
import type { OCPP16MeterValuesRequest } from './1.6/MeterValues.js'
import {
  OCPP16AvailabilityType,
  type OCPP16BootNotificationRequest,
  type OCPP16CancelReservationRequest,
  type OCPP16DataTransferRequest,
  type OCPP16DiagnosticsStatusNotificationRequest,
  OCPP16FirmwareStatus,
  type OCPP16FirmwareStatusNotificationRequest,
  type OCPP16HeartbeatRequest,
  OCPP16IncomingRequestCommand,
  OCPP16MessageTrigger,
  OCPP16RequestCommand,
  type OCPP16ReserveNowRequest,
  type OCPP16StatusNotificationRequest,
} from './1.6/Requests.js'
import { OperationalStatusEnumType } from './2.0/Common.js'
import {
  type OCPP20BootNotificationRequest,
  OCPP20IncomingRequestCommand,
  OCPP20RequestCommand,
  type OCPP20StatusNotificationRequest,
} from './2.0/Requests.js'
import type { MessageType } from './MessageType.js'

export const RequestCommand = {
  ...OCPP16RequestCommand,
  ...OCPP20RequestCommand,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type RequestCommand = OCPP16RequestCommand | OCPP20RequestCommand

export type OutgoingRequest = [MessageType.CALL_MESSAGE, string, RequestCommand, JsonType]

export interface RequestParams {
  skipBufferingOnError?: boolean
  triggerMessage?: boolean
  throwError?: boolean
}

export const IncomingRequestCommand = {
  ...OCPP16IncomingRequestCommand,
  ...OCPP20IncomingRequestCommand,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type IncomingRequestCommand = OCPP16IncomingRequestCommand | OCPP20IncomingRequestCommand

export type IncomingRequest = [MessageType.CALL_MESSAGE, string, IncomingRequestCommand, JsonType]

export type IncomingRequestHandler = (
  chargingStation: ChargingStation,
  commandPayload: JsonType
) => JsonType | Promise<JsonType>

export type ResponseCallback = (payload: JsonType, requestPayload: JsonType) => void

export type ErrorCallback = (ocppError: OCPPError, requestStatistic?: boolean) => void

export type CachedRequest = [ResponseCallback, ErrorCallback, RequestCommand, JsonType]

export const MessageTrigger = {
  ...OCPP16MessageTrigger,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type MessageTrigger = OCPP16MessageTrigger

export type BootNotificationRequest = OCPP16BootNotificationRequest | OCPP20BootNotificationRequest

export type HeartbeatRequest = OCPP16HeartbeatRequest

export type StatusNotificationRequest =
  | OCPP16StatusNotificationRequest
  | OCPP20StatusNotificationRequest

export type MeterValuesRequest = OCPP16MeterValuesRequest

export type DataTransferRequest = OCPP16DataTransferRequest

export type DiagnosticsStatusNotificationRequest = OCPP16DiagnosticsStatusNotificationRequest

export type FirmwareStatusNotificationRequest = OCPP16FirmwareStatusNotificationRequest

export const AvailabilityType = {
  ...OCPP16AvailabilityType,
  ...OperationalStatusEnumType,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type AvailabilityType = OCPP16AvailabilityType | OperationalStatusEnumType

export const DiagnosticsStatus = {
  ...OCPP16DiagnosticsStatus,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type DiagnosticsStatus = OCPP16DiagnosticsStatus

export const FirmwareStatus = {
  ...OCPP16FirmwareStatus,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type FirmwareStatus = OCPP16FirmwareStatus

export type ResponseType = JsonType | OCPPError

export type ReserveNowRequest = OCPP16ReserveNowRequest

export type CancelReservationRequest = OCPP16CancelReservationRequest
