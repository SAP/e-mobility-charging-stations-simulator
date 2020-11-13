export interface CommandStatisticsData {
  countRequest: number;
  countResponse: number;
  countError: number;
  countTime: number;
  minTime: number;
  maxTime: number;
  totalTime: number;
  avgTime: number;
}

export default interface CommandStatistics {
  [command: string]: CommandStatisticsData;
}
