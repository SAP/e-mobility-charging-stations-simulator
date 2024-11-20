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
  stdDevTimeMeasurement: number
  timeMeasurementCount: number
  totalTimeMeasurement: number
}>

export interface TemplateStatistics {
  added: number
  configured: number
  indexes: Set<number>
  provisioned: number
  started: number
}

export interface TimestampedData {
  timestamp: number
  value: number
}
