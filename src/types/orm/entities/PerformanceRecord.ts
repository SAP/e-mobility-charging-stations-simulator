import { Entity, PrimaryKey, Property } from '@mikro-orm/core'

interface StatisticsData {
  avgTimeMeasurement: number
  currentTimeMeasurement: number
  errorCount: number
  maxTimeMeasurement: number
  measurementTimeSeries: {
    timestamp: number
    value: number
  }[]
  medTimeMeasurement: number
  minTimeMeasurement: number
  name: string
  ninetyFiveThPercentileTimeMeasurement: number
  requestCount: number
  responseCount: number
  stdTimeMeasurement: number
  timeMeasurementCount: number
  totalTimeMeasurement: number
}

@Entity()
export class PerformanceRecord {
  @Property()
  createdAt!: Date

  @PrimaryKey()
  id!: string

  @Property()
  name!: string

  @Property()
  statisticsData!: Partial<StatisticsData>[]

  @Property()
  updatedAt?: Date

  @Property()
  uri!: string
}
