export default interface CommandStatisticsData {
  countRequest: number;
  countResponse: number;
  countError: number;
  countTime: number;
  minTime: number;
  maxTime: number;
  totalTime: number;
  avgTime: number;
}
