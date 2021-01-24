import CircularArray from '../utils/CircularArray';
import { EntryType } from 'perf_hooks';

export interface PerfEntry {
  name: string;
  entryType: EntryType;
  startTime: number;
  duration: number;
}

export interface CommandStatisticsData {
  countRequest: number;
  countResponse: number;
  countError: number;
  countTimeMeasurement: number;
  timeMeasurementSeries: CircularArray<number>;
  currentTimeMeasurement: number;
  minTimeMeasurement: number;
  maxTimeMeasurement: number;
  totalTimeMeasurement: number;
  avgTimeMeasurement: number;
  medTimeMeasurement: number;
}

export default interface CommandStatistics {
  id: string;
  commandsStatisticsData: Record<string, CommandStatisticsData>;
}
