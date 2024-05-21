import type { CircularBuffer } from 'mnemonist'

import type { WorkerData } from '../worker/index.js'
import type { IncomingRequestCommand, RequestCommand } from './ocpp/Requests.js'

export interface TimestampedData {
  timestamp: number
  value: number
}

export type StatisticsData = Partial<{
  requestCount: number
  responseCount: number
  errorCount: number
  timeMeasurementCount: number
  measurementTimeSeries: CircularBuffer<TimestampedData>
  currentTimeMeasurement: number
  minTimeMeasurement: number
  maxTimeMeasurement: number
  totalTimeMeasurement: number
  avgTimeMeasurement: number
  medTimeMeasurement: number
  ninetyFiveThPercentileTimeMeasurement: number
  stdDevTimeMeasurement: number
}>

export interface Statistics extends WorkerData {
  id: string
  name: string
  uri: string
  createdAt: Date
  updatedAt?: Date
  statisticsData: Map<string | RequestCommand | IncomingRequestCommand, StatisticsData>
}

export interface TemplateStatistics {
  configured: number
  provisioned: number
  added: number
  started: number
  indexes: Set<number>
}
