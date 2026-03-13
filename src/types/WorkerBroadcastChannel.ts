import type { JsonObject } from './JsonType.js'
import type { RequestPayload, ResponsePayload } from './UIProtocol.js'
import type { UUIDv4 } from './UUID.js'

export enum BroadcastChannelProcedureName {
  AUTHORIZE = 'authorize',
  BOOT_NOTIFICATION = 'bootNotification',
  CLOSE_CONNECTION = 'closeConnection',
  DATA_TRANSFER = 'dataTransfer',
  DELETE_CHARGING_STATIONS = 'deleteChargingStations',
  DIAGNOSTICS_STATUS_NOTIFICATION = 'diagnosticsStatusNotification',
  FIRMWARE_STATUS_NOTIFICATION = 'firmwareStatusNotification',
  GET_15118_EV_CERTIFICATE = 'get15118EVCertificate',
  GET_CERTIFICATE_STATUS = 'getCertificateStatus',
  HEARTBEAT = 'heartbeat',
  LOG_STATUS_NOTIFICATION = 'logStatusNotification',
  METER_VALUES = 'meterValues',
  NOTIFY_CUSTOMER_INFORMATION = 'notifyCustomerInformation',
  NOTIFY_REPORT = 'notifyReport',
  OPEN_CONNECTION = 'openConnection',
  SECURITY_EVENT_NOTIFICATION = 'securityEventNotification',
  SET_SUPERVISION_URL = 'setSupervisionUrl',
  SIGN_CERTIFICATE = 'signCertificate',
  START_AUTOMATIC_TRANSACTION_GENERATOR = 'startAutomaticTransactionGenerator',
  START_CHARGING_STATION = 'startChargingStation',
  START_TRANSACTION = 'startTransaction',
  STATUS_NOTIFICATION = 'statusNotification',
  STOP_AUTOMATIC_TRANSACTION_GENERATOR = 'stopAutomaticTransactionGenerator',
  STOP_CHARGING_STATION = 'stopChargingStation',
  STOP_TRANSACTION = 'stopTransaction',
  TRANSACTION_EVENT = 'transactionEvent',
}

export type BroadcastChannelRequest = [
  UUIDv4,
  BroadcastChannelProcedureName,
  BroadcastChannelRequestPayload
]

export interface BroadcastChannelRequestPayload extends RequestPayload {
  connectorId?: number
  eventType?: string
  evseId?: number
  idToken?: JsonObject
  transactionData?: JsonObject
  transactionId?: number
}

export type BroadcastChannelResponse = [UUIDv4, BroadcastChannelResponsePayload]

export interface BroadcastChannelResponsePayload extends Omit<
  ResponsePayload,
  'hashIdsFailed' | 'hashIdsSucceeded' | 'responsesFailed'
> {
  hashId: string | undefined
}

export interface MessageEvent {
  data: BroadcastChannelRequest | BroadcastChannelResponse
}
