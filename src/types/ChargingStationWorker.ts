import type { WebSocket } from 'ws'

import type { WorkerData } from '../worker/index.js'
import type { ChargingStationAutomaticTransactionGeneratorConfiguration } from './AutomaticTransactionGenerator.js'
import type { ChargingStationInfo } from './ChargingStationInfo.js'
import type { ChargingStationOcppConfiguration } from './ChargingStationOcppConfiguration.js'
import type { ConnectorStatus } from './ConnectorStatus.js'
import type { EvseStatus } from './Evse.js'
import type { JsonObject } from './JsonType.js'
import type { BootNotificationResponse } from './ocpp/Responses.js'
import type { Statistics } from './Statistics.js'

import { ChargingStationEvents } from './ChargingStationEvents.js'

export interface ChargingStationOptions extends JsonObject {
  autoRegister?: boolean
  autoStart?: boolean
  enableStatistics?: boolean
  ocppStrictCompliance?: boolean
  persistentConfiguration?: boolean
  stopTransactionsOnStopped?: boolean
  supervisionUrls?: string | string[]
}

export interface ChargingStationWorkerData extends WorkerData {
  index: number
  options?: ChargingStationOptions
  templateFile: string
}

export type EvseStatusWorkerType = {
  connectors?: ConnectorStatus[]
} & Omit<EvseStatus, 'connectors'>

export interface ChargingStationData extends WorkerData {
  automaticTransactionGenerator?: ChargingStationAutomaticTransactionGeneratorConfiguration
  bootNotificationResponse?: BootNotificationResponse
  connectors: ConnectorStatus[]
  evses: EvseStatusWorkerType[]
  ocppConfiguration: ChargingStationOcppConfiguration
  started: boolean
  stationInfo: ChargingStationInfo
  supervisionUrl: string
  wsState?:
    | typeof WebSocket.CLOSED
    | typeof WebSocket.CLOSING
    | typeof WebSocket.CONNECTING
    | typeof WebSocket.OPEN
}

enum ChargingStationMessageEvents {
  performanceStatistics = 'performanceStatistics'
}

export const ChargingStationWorkerMessageEvents = {
  ...ChargingStationEvents,
  ...ChargingStationMessageEvents,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type ChargingStationWorkerMessageEvents =
  | ChargingStationEvents
  | ChargingStationMessageEvents

export type ChargingStationWorkerMessageData = ChargingStationData | Statistics

export interface ChargingStationWorkerMessage<T extends ChargingStationWorkerMessageData> {
  data: T
  event: ChargingStationWorkerMessageEvents
}
