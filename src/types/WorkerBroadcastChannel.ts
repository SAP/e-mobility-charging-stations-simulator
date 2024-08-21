import type { RequestPayload, ResponsePayload } from './UIProtocol.js'

export type BroadcastChannelRequest = [
  `${string}-${string}-${string}-${string}-${string}`,
  BroadcastChannelProcedureName,
  BroadcastChannelRequestPayload
]
export type BroadcastChannelResponse = [
  `${string}-${string}-${string}-${string}-${string}`,
  BroadcastChannelResponsePayload
]

export enum BroadcastChannelProcedureName {
  AUTHORIZE = 'authorize',
  BOOT_NOTIFICATION = 'bootNotification',
  CLOSE_CONNECTION = 'closeConnection',
  DATA_TRANSFER = 'dataTransfer',
  DELETE_CHARGING_STATIONS = 'deleteChargingStations',
  DIAGNOSTICS_STATUS_NOTIFICATION = 'diagnosticsStatusNotification',
  FIRMWARE_STATUS_NOTIFICATION = 'firmwareStatusNotification',
  HEARTBEAT = 'heartbeat',
  METER_VALUES = 'meterValues',
  OPEN_CONNECTION = 'openConnection',
  SET_SUPERVISION_URL = 'setSupervisionUrl',
  START_AUTOMATIC_TRANSACTION_GENERATOR = 'startAutomaticTransactionGenerator',
  START_CHARGING_STATION = 'startChargingStation',
  START_TRANSACTION = 'startTransaction',
  STATUS_NOTIFICATION = 'statusNotification',
  STOP_AUTOMATIC_TRANSACTION_GENERATOR = 'stopAutomaticTransactionGenerator',
  STOP_CHARGING_STATION = 'stopChargingStation',
  STOP_TRANSACTION = 'stopTransaction'
}

export interface BroadcastChannelRequestPayload extends RequestPayload {
  connectorId?: number
  transactionId?: number
}

export interface BroadcastChannelResponsePayload
  extends Omit<ResponsePayload, 'hashIdsFailed' | 'hashIdsSucceeded' | 'responsesFailed'> {
  hashId: string | undefined
}

export interface MessageEvent {
  data: BroadcastChannelRequest | BroadcastChannelResponse
}
