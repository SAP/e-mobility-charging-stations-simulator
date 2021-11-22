import { CircularArray } from '../utils/CircularArray';

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

export default interface Statistics {
  id: string;
  URI: string;
  createdAt: Date;
  updatedAt?: Date;
  statisticsData: Map<string, Partial<StatisticsData>>;
}
