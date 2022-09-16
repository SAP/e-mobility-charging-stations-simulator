import type { CircularArray } from '../utils/CircularArray';
import type { WorkerData } from './Worker';

export type TimeSeries = {
  timestamp: number;
  value: number;
};

export type StatisticsData = {
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
};

export type Statistics = WorkerData & {
  id: string;
  name: string;
  uri: string;
  createdAt: Date;
  updatedAt?: Date;
  statisticsData: Map<string, Partial<StatisticsData>>;
};
