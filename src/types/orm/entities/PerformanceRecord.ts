import { Entity, PrimaryKey, Property } from '@mikro-orm/core'

interface StatisticsData {
  name: string
  requestCount: number
  responseCount: number
  errorCount: number
  timeMeasurementCount: number
  measurementTimeSeries: {
    timestamp: number
    value: number
  }[]
  currentTimeMeasurement: number
  minTimeMeasurement: number
  maxTimeMeasurement: number
  totalTimeMeasurement: number
  avgTimeMeasurement: number
  medTimeMeasurement: number
  ninetyFiveThPercentileTimeMeasurement: number
  stdDevTimeMeasurement: number
}

@Entity()
export class PerformanceRecord {
  @PrimaryKey()
  id!: string

  @Property()
  name!: string

  @Property()
  uri!: string

  @Property()
  createdAt!: Date

  @Property()
  updatedAt?: Date

  @Property()
  statisticsData!: Partial<StatisticsData>[]
}
