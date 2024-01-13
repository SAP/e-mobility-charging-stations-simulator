import { Entity, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core'

import { PerformanceRecord } from './PerformanceRecord.js'

@Entity()
export class PerformanceData {
  @PrimaryKey()
    commandName!: string

  @Property()
    requestCount!: number

  @Property()
    responseCount!: number

  @Property()
    errorCount!: number

  @Property()
    timeMeasurementCount!: number

  @Property()
    measurementTimeSeries!: number[]

  @Property()
    currentTimeMeasurement!: number

  @Property()
    minTimeMeasurement!: number

  @Property()
    maxTimeMeasurement!: number

  @Property()
    totalTimeMeasurement!: number

  @Property()
    avgTimeMeasurement!: number

  @Property()
    medTimeMeasurement!: number

  @Property()
    ninetyFiveThPercentileTimeMeasurement!: number

  @Property()
    stdDevTimeMeasurement!: number

  @ManyToOne(() => PerformanceRecord)
    performanceRecord!: PerformanceRecord
}
