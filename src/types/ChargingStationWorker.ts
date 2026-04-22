import type { WebSocket } from 'ws'

import type { WorkerData } from '../worker/index.js'
import type {
  AutomaticTransactionGeneratorConfiguration,
  Status,
} from './AutomaticTransactionGenerator.js'
import type { ChargingStationInfo } from './ChargingStationInfo.js'
import type { ChargingStationOcppConfiguration } from './ChargingStationOcppConfiguration.js'
import type { ConnectorEntry } from './ConnectorStatus.js'
import type { EvseEntry } from './Evse.js'
import type { JsonObject } from './JsonType.js'
import type { BootNotificationResponse } from './ocpp/Responses.js'
import type { Statistics } from './Statistics.js'
import type { UUIDv4 } from './UUID.js'

import { ChargingStationEvents } from './ChargingStationEvents.js'

enum ChargingStationMessageEvents {
  performanceStatistics = 'performanceStatistics',
}

export interface ATGConfiguration {
  automaticTransactionGenerator?: AutomaticTransactionGeneratorConfiguration
  automaticTransactionGeneratorStatuses?: ATGEntry[]
}

export interface ATGEntry {
  connectorId: number
  status: Status
}

export interface ChargingStationData extends WorkerData {
  automaticTransactionGenerator?: ATGConfiguration
  bootNotificationResponse?: BootNotificationResponse
  connectors: ConnectorEntry[]
  evses: EvseEntry[]
  ocppConfiguration: ChargingStationOcppConfiguration
  started: boolean
  stationInfo: ChargingStationInfo
  supervisionUrl: string
  timestamp: number
  wsState?:
    | typeof WebSocket.CLOSED
    | typeof WebSocket.CLOSING
    | typeof WebSocket.CONNECTING
    | typeof WebSocket.OPEN
}

export interface ChargingStationOptions extends JsonObject {
  autoRegister?: boolean
  autoStart?: boolean
  baseName?: string
  enableStatistics?: boolean
  fixedName?: boolean
  nameSuffix?: string
  ocppStrictCompliance?: boolean
  persistentConfiguration?: boolean
  stopTransactionsOnStopped?: boolean
  supervisionPassword?: string
  supervisionUrls?: string | string[]
  supervisionUser?: string
}

export interface ChargingStationWorkerData extends WorkerData {
  index: number
  options?: ChargingStationOptions
  templateFile: string
}

export interface ChargingStationWorkerMessage<T extends ChargingStationWorkerMessageData> {
  data: T
  event: ChargingStationWorkerMessageEvents
  uuid?: UUIDv4
}

export type ChargingStationWorkerMessageData = ChargingStationData | Statistics

export const ChargingStationWorkerMessageEvents = {
  ...ChargingStationEvents,
  ...ChargingStationMessageEvents,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type ChargingStationWorkerMessageEvents =
  | ChargingStationEvents
  | ChargingStationMessageEvents
