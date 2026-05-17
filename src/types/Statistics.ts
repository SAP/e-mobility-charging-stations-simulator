import type { CircularBuffer } from 'mnemonist'

import type { WorkerData } from '../worker/index.js'
import type { IncomingRequestCommand, RequestCommand } from './ocpp/Requests.js'

export interface Statistics extends WorkerData {
  createdAt: Date
  id: string
  name: string
  statisticsData: Map<IncomingRequestCommand | RequestCommand | string, StatisticsData>
  updatedAt?: Date
  uri: string
}

export type StatisticsData = Partial<{
  avgTimeMeasurement: number
  currentTimeMeasurement: number
  errorCount: number
  maxTimeMeasurement: number
  measurementTimeSeries: CircularBuffer<TimestampedData> | TimestampedData[]
  medTimeMeasurement: number
  minTimeMeasurement: number
  ninetyFiveThPercentileTimeMeasurement: number
  requestCount: number
  responseCount: number
  stdTimeMeasurement: number
  timeMeasurementCount: number
  totalTimeMeasurement: number
}>

export interface TemplateStatistics {
  /** Number of charging stations added via `addChargingStation` in the current process. Decremented when a station is deleted. */
  added: number
  /** `numberOfStations` from the matching `stationTemplateUrls` entry. */
  configured: number
  /**
   * Template indexes known to the simulator: those allocated in the current process plus those reconstructed at startup
   * from existing charging station configuration files in `dist/assets/configurations/`. Used by `getLastContiguousIndex`
   * to allocate collision-free indexes when adding stations via UI. May exceed `added` because reconstructed indexes
   * reserve disk-persisted slots without re-spawning their stations.
   */
  indexes: Set<number>
  /** `provisionedNumberOfStations` from the matching `stationTemplateUrls` entry. */
  provisioned: number
  /** Number of currently started charging stations across this template. */
  started: number
}

export interface TimestampedData {
  timestamp: number
  value: number
}
