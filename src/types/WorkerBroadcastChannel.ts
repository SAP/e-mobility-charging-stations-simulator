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
  START_CHARGING_STATION = 'startChargingStation',
  STOP_CHARGING_STATION = 'stopChargingStation',
  DELETE_CHARGING_STATIONS = 'deleteChargingStations',
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

export interface BroadcastChannelRequestPayload extends RequestPayload {
  connectorId?: number
  transactionId?: number
}

export interface BroadcastChannelResponsePayload
  extends Omit<ResponsePayload, 'hashIdsSucceeded' | 'hashIdsFailed' | 'responsesFailed'> {
  hashId: string | undefined
}

export interface MessageEvent {
  data: BroadcastChannelRequest | BroadcastChannelResponse
}
