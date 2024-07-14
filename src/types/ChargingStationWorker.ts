import type { WebSocket } from 'ws'

import type { WorkerData } from '../worker/index.js'
import type { ChargingStationAutomaticTransactionGeneratorConfiguration } from './AutomaticTransactionGenerator.js'
import { ChargingStationEvents } from './ChargingStationEvents.js'
import type { ChargingStationInfo } from './ChargingStationInfo.js'
import type { ChargingStationOcppConfiguration } from './ChargingStationOcppConfiguration.js'
import type { ConnectorStatus } from './ConnectorStatus.js'
import type { EvseStatus } from './Evse.js'
import type { JsonObject } from './JsonType.js'
import type { BootNotificationResponse } from './ocpp/Responses.js'
import type { Statistics } from './Statistics.js'

export interface ChargingStationOptions extends JsonObject {
  supervisionUrls?: string | string[]
  persistentConfiguration?: boolean
  autoStart?: boolean
  autoRegister?: boolean
  enableStatistics?: boolean
  ocppStrictCompliance?: boolean
  stopTransactionsOnStopped?: boolean
}

export interface ChargingStationWorkerData extends WorkerData {
  index: number
  templateFile: string
  options?: ChargingStationOptions
}

export type EvseStatusWorkerType = Omit<EvseStatus, 'connectors'> & {
  connectors?: ConnectorStatus[]
}

export interface ChargingStationData extends WorkerData {
  started: boolean
  stationInfo: ChargingStationInfo
  connectors: ConnectorStatus[]
  evses: EvseStatusWorkerType[]
  ocppConfiguration: ChargingStationOcppConfiguration
  supervisionUrl: string
  wsState?:
  | typeof WebSocket.CONNECTING
  | typeof WebSocket.OPEN
  | typeof WebSocket.CLOSING
  | typeof WebSocket.CLOSED
  bootNotificationResponse?: BootNotificationResponse
  automaticTransactionGenerator?: ChargingStationAutomaticTransactionGeneratorConfiguration
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
  event: ChargingStationWorkerMessageEvents
  data: T
}
