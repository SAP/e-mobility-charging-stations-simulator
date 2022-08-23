import { CircularArray } from '../utils/CircularArray';
import { WorkerData } from './Worker';

export interface TimeSeries {
  timestamp: number;
  value: number;
}

export interface StatisticsData {
  countRequest: number;
  countResponse: number;
  countError: number;
  countTimeMeasurement: number;
  timeMeasurementSeries: CircularArray<TimeSeries>;
  currentTimeMeasurement: number;
  minTimeMeasurement: number;
  maxTimeMeasurement: number;
  totalTimeMeasurement: number;
  avgTimeMeasurement: number;
  medTimeMeasurement: number;
  ninetyFiveThPercentileTimeMeasurement: number;
  stdDevTimeMeasurement: number;
}

export default interface Statistics extends WorkerData {
  id: string;
  name: string;
  uri: string;
  createdAt: Date;
  updatedAt?: Date;
  statisticsData: Map<string, Partial<StatisticsData>>;
}
