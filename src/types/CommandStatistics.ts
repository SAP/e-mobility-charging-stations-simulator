export interface CommandStatisticsData {
  countRequest: number;
  countResponse: number;
  countError: number;
  countTimeMeasurement: number;
  currentTime: number;
  minTime: number;
  maxTime: number;
  totalTime: number;
  avgTime: number;
}

export default interface CommandStatistics {
  [command: string]: CommandStatisticsData;
}
