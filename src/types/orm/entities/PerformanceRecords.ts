import { Column, Entity, ManyToOne, OneToMany } from 'typeorm';

import { CircularArray } from '../../../utils/CircularArray';

@Entity()
export class PerformanceRecords {
  @Column('string')
  id: string;

  @Column('string')
  URI: string;

  @Column('date')
  createdAt: Date;

  @Column('date')
  lastUpdatedAt?: Date;

  @OneToMany((type) => PerformanceData, (performanceData) => performanceData.performanceRecords)
  performanceData?: PerformanceData[];
}

@Entity()
export class PerformanceData {
  @Column('string')
  commandName: string;

  @Column('integer')
  countRequest: number;

  @Column('integer')
  countResponse: number;

  @Column('integer')
  countError: number;

  @Column('integer')
  countTimeMeasurement: number;

  @Column({ type: 'double', array: true })
  timeMeasurementSeries: CircularArray<number>;

  @Column('double')
  currentTimeMeasurement: number;

  @Column('double')
  minTimeMeasurement: number;

  @Column('double')
  maxTimeMeasurement: number;

  @Column('double')
  totalTimeMeasurement: number;

  @Column('double')
  avgTimeMeasurement: number;

  @Column('double')
  medTimeMeasurement: number;

  @Column('double')
  ninetyFiveThPercentileTimeMeasurement: number;

  @Column('double')
  stdDevTimeMeasurement: number;

  @ManyToOne((type) => PerformanceRecords, (performanceRecords) => performanceRecords.performanceData)
  performanceRecords?: PerformanceRecords;
}
