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
) => undefined | Promise<undefined> | ResponsePayload | Promise<ResponsePayload>

export enum ProcedureName {
  SIMULATOR_STATE = 'simulatorState',
  START_SIMULATOR = 'startSimulator',
  STOP_SIMULATOR = 'stopSimulator',
  LIST_TEMPLATES = 'listTemplates',
  LIST_CHARGING_STATIONS = 'listChargingStations',
  ADD_CHARGING_STATIONS = 'addChargingStations',
  DELETE_CHARGING_STATIONS = 'deleteChargingStations',
  PERFORMANCE_STATISTICS = 'performanceStatistics',
  START_CHARGING_STATION = 'startChargingStation',
  STOP_CHARGING_STATION = 'stopChargingStation',
  OPEN_CONNECTION = 'openConnection',
  CLOSE_CONNECTION = 'closeConnection',
  START_AUTOMATIC_TRANSACTION_GENERATOR = 'startAutomaticTransactionGenerator',
  STOP_AUTOMATIC_TRANSACTION_GENERATOR = 'stopAutomaticTransactionGenerator',
  SET_SUPERVISION_URL = 'setSupervisionUrl',
  START_TRANSACTION = 'startTransaction',
  STOP_TRANSACTION = 'stopTransaction',
  AUTHORIZE = 'authorize',
  BOOT_NOTIFICATION = 'bootNotification',
  STATUS_NOTIFICATION = 'statusNotification',
  HEARTBEAT = 'heartbeat',
  METER_VALUES = 'meterValues',
  DATA_TRANSFER = 'dataTransfer',
  DIAGNOSTICS_STATUS_NOTIFICATION = 'diagnosticsStatusNotification',
  FIRMWARE_STATUS_NOTIFICATION = 'firmwareStatusNotification'
}

export interface RequestPayload extends JsonObject {
  hashIds?: string[]
  connectorIds?: number[]
}

export enum ResponseStatus {
  SUCCESS = 'success',
  FAILURE = 'failure'
}

export interface ResponsePayload extends JsonObject {
  status: ResponseStatus
  hashIdsSucceeded?: string[]
  hashIdsFailed?: string[]
  responsesFailed?: BroadcastChannelResponsePayload[]
}
