import type { IncomingRequestCommand, RequestCommand } from './ocpp/Requests';
import type { CircularArray } from '../utils';
import type { WorkerData } from '../worker';

export interface TimestampedData {
  timestamp: number;
  value: number;
}

export type StatisticsData = Partial<{
  requestCount: number;
  responseCount: number;
  errorCount: number;
  timeMeasurementCount: number;
  measurementTimeSeries: CircularArray<TimestampedData>;
  currentTimeMeasurement: number;
  minTimeMeasurement: number;
  maxTimeMeasurement: number;
  totalTimeMeasurement: number;
  avgTimeMeasurement: number;
  medTimeMeasurement: number;
  ninetyFiveThPercentileTimeMeasurement: number;
  stdDevTimeMeasurement: number;
}>;

export type Statistics = {
  id: string;
  name: string;
  uri: string;
  createdAt: Date;
  updatedAt?: Date;
  statisticsData: Map<string | RequestCommand | IncomingRequestCommand, StatisticsData>;
} & WorkerData;
