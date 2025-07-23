import type { JsonObject } from './JsonType'

export enum ApplicationProtocol {
  WS = 'ws',
  WSS = 'wss',
}

export enum AuthenticationType {
  PROTOCOL_BASIC_AUTH = 'protocol-basic-auth',
}

export enum ProcedureName {
  ADD_CHARGING_STATIONS = 'addChargingStations',
  AUTHORIZE = 'authorize',
  CLOSE_CONNECTION = 'closeConnection',
  DELETE_CHARGING_STATIONS = 'deleteChargingStations',
  LIST_CHARGING_STATIONS = 'listChargingStations',
  LIST_TEMPLATES = 'listTemplates',
  OPEN_CONNECTION = 'openConnection',
  SET_SUPERVISION_URL = 'setSupervisionUrl',
  SIMULATOR_STATE = 'simulatorState',
  START_AUTOMATIC_TRANSACTION_GENERATOR = 'startAutomaticTransactionGenerator',
  START_CHARGING_STATION = 'startChargingStation',
  START_SIMULATOR = 'startSimulator',
  START_TRANSACTION = 'startTransaction',
  STOP_AUTOMATIC_TRANSACTION_GENERATOR = 'stopAutomaticTransactionGenerator',
  STOP_CHARGING_STATION = 'stopChargingStation',
  STOP_SIMULATOR = 'stopSimulator',
  STOP_TRANSACTION = 'stopTransaction',
}

export enum Protocol {
  UI = 'ui',
}

export enum ProtocolVersion {
  '0.0.1' = '0.0.1',
}

export enum ResponseStatus {
  FAILURE = 'failure',
  SUCCESS = 'success',
}

export type ProtocolRequest = [
  `${string}-${string}-${string}-${string}-${string}`,
  ProcedureName,
  RequestPayload
]

export type ProtocolRequestHandler = (
  payload: RequestPayload
) => Promise<ResponsePayload> | ResponsePayload

export type ProtocolResponse = [
  `${string}-${string}-${string}-${string}-${string}`,
  ResponsePayload
]

export interface RequestPayload extends JsonObject {
  connectorIds?: number[]
  hashIds?: string[]
}

export interface ResponsePayload extends JsonObject {
  hashIds?: string[]
  status: ResponseStatus
}

export interface SimulatorState extends JsonObject {
  started: boolean
  templateStatistics: Record<string, TemplateStatistics>
  version: string
}

interface TemplateStatistics extends JsonObject {
  added: number
  configured: number
  indexes: number[]
  started: number
}
