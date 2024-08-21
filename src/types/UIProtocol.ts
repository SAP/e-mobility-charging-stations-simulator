import type { JsonObject } from './JsonType.js'
import type { BroadcastChannelResponsePayload } from './WorkerBroadcastChannel.js'

export enum Protocol {
  UI = 'ui'
}

export enum ApplicationProtocol {
  HTTP = 'http',
  WS = 'ws'
}

export enum AuthenticationType {
  BASIC_AUTH = 'basic-auth',
  PROTOCOL_BASIC_AUTH = 'protocol-basic-auth'
}

export enum ProtocolVersion {
  '0.0.1' = '0.0.1'
}

export type ProtocolRequest = [
  `${string}-${string}-${string}-${string}-${string}`,
  ProcedureName,
  RequestPayload
]
export type ProtocolResponse = [
  `${string}-${string}-${string}-${string}-${string}`,
  ResponsePayload
]

export type ProtocolRequestHandler = (
  uuid?: `${string}-${string}-${string}-${string}-${string}`,
  procedureName?: ProcedureName,
  payload?: RequestPayload
) => Promise<ResponsePayload> | Promise<undefined> | ResponsePayload | undefined

export enum ProcedureName {
  ADD_CHARGING_STATIONS = 'addChargingStations',
  AUTHORIZE = 'authorize',
  BOOT_NOTIFICATION = 'bootNotification',
  CLOSE_CONNECTION = 'closeConnection',
  DATA_TRANSFER = 'dataTransfer',
  DELETE_CHARGING_STATIONS = 'deleteChargingStations',
  DIAGNOSTICS_STATUS_NOTIFICATION = 'diagnosticsStatusNotification',
  FIRMWARE_STATUS_NOTIFICATION = 'firmwareStatusNotification',
  HEARTBEAT = 'heartbeat',
  LIST_CHARGING_STATIONS = 'listChargingStations',
  LIST_TEMPLATES = 'listTemplates',
  METER_VALUES = 'meterValues',
  OPEN_CONNECTION = 'openConnection',
  PERFORMANCE_STATISTICS = 'performanceStatistics',
  SET_SUPERVISION_URL = 'setSupervisionUrl',
  SIMULATOR_STATE = 'simulatorState',
  START_AUTOMATIC_TRANSACTION_GENERATOR = 'startAutomaticTransactionGenerator',
  START_CHARGING_STATION = 'startChargingStation',
  START_SIMULATOR = 'startSimulator',
  START_TRANSACTION = 'startTransaction',
  STATUS_NOTIFICATION = 'statusNotification',
  STOP_AUTOMATIC_TRANSACTION_GENERATOR = 'stopAutomaticTransactionGenerator',
  STOP_CHARGING_STATION = 'stopChargingStation',
  STOP_SIMULATOR = 'stopSimulator',
  STOP_TRANSACTION = 'stopTransaction'
}

export interface RequestPayload extends JsonObject {
  connectorIds?: number[]
  hashIds?: string[]
}

export enum ResponseStatus {
  FAILURE = 'failure',
  SUCCESS = 'success'
}

export interface ResponsePayload extends JsonObject {
  hashIdsFailed?: string[]
  hashIdsSucceeded?: string[]
  responsesFailed?: BroadcastChannelResponsePayload[]
  status: ResponseStatus
}
