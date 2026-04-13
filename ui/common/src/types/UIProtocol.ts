import type { JsonObject } from './JsonType.js'
import type { UUIDv4 } from './UUID.js'

export enum AuthenticationType {
  PROTOCOL_BASIC_AUTH = 'protocol-basic-auth',
}

export enum ProcedureName {
  ADD_CHARGING_STATIONS = 'addChargingStations',
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
  LIST_CHARGING_STATIONS = 'listChargingStations',
  LIST_TEMPLATES = 'listTemplates',
  LOCK_CONNECTOR = 'lockConnector',
  LOG_STATUS_NOTIFICATION = 'logStatusNotification',
  METER_VALUES = 'meterValues',
  NOTIFY_CUSTOMER_INFORMATION = 'notifyCustomerInformation',
  NOTIFY_REPORT = 'notifyReport',
  OPEN_CONNECTION = 'openConnection',
  PERFORMANCE_STATISTICS = 'performanceStatistics',
  SECURITY_EVENT_NOTIFICATION = 'securityEventNotification',
  SET_SUPERVISION_URL = 'setSupervisionUrl',
  SIGN_CERTIFICATE = 'signCertificate',
  SIMULATOR_STATE = 'simulatorState',
  START_AUTOMATIC_TRANSACTION_GENERATOR = 'startAutomaticTransactionGenerator',
  START_CHARGING_STATION = 'startChargingStation',
  START_SIMULATOR = 'startSimulator',
  START_TRANSACTION = 'startTransaction',
  STATUS_NOTIFICATION = 'statusNotification',
  STOP_AUTOMATIC_TRANSACTION_GENERATOR = 'stopAutomaticTransactionGenerator',
  STOP_CHARGING_STATION = 'stopChargingStation',
  STOP_SIMULATOR = 'stopSimulator',
  STOP_TRANSACTION = 'stopTransaction',
  TRANSACTION_EVENT = 'transactionEvent',
  UNLOCK_CONNECTOR = 'unlockConnector',
}

export enum ProtocolVersion {
  '0.0.1' = '0.0.1',
}

export enum ResponseStatus {
  FAILURE = 'failure',
  SUCCESS = 'success',
}

export enum ServerNotification {
  REFRESH = 'refresh',
}

export interface BroadcastChannelResponsePayload extends JsonObject {
  hashId: string | undefined
  status: ResponseStatus
}

export type ProtocolNotification = [ServerNotification]

export type ProtocolRequest = [UUIDv4, ProcedureName, RequestPayload]

export type ProtocolRequestHandler = (
  uuid?: UUIDv4,
  procedureName?: ProcedureName,
  payload?: RequestPayload
) => Promise<ResponsePayload> | Promise<undefined> | ResponsePayload | undefined

export type ProtocolResponse = [UUIDv4, ResponsePayload]

export interface RequestPayload extends JsonObject {
  connectorIds?: number[]
  hashIds?: string[]
}

export interface ResponsePayload extends JsonObject {
  hashIdsFailed?: string[]
  hashIdsSucceeded?: string[]
  responsesFailed?: BroadcastChannelResponsePayload[]
  status: ResponseStatus
}
