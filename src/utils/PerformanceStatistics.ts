import { CircularArray, DEFAULT_CIRCULAR_ARRAY_SIZE } from './CircularArray';
import { IncomingRequestCommand, RequestCommand } from '../types/ocpp/Requests';
import { PerformanceEntry, PerformanceObserver, performance } from 'perf_hooks';
import Statistics, { StatisticsData } from '../types/Statistics';

import Configuration from './Configuration';
import { MessageType } from '../types/ocpp/MessageType';
import Utils from './Utils';
import logger from './Logger';

export default class PerformanceStatistics {
  private objId: string;
  private performanceObserver: PerformanceObserver;
  private statistics: Statistics;
  private displayInterval: NodeJS.Timeout;

  public constructor(objId: string) {
    this.objId = objId;
    this.initializePerformanceObserver();
    this.statistics = { id: this.objId ?? 'Object id not specified', statisticsData: {} };
  }

  public static beginMeasure(id: string): string {
    const beginId = 'begin' + id.charAt(0).toUpperCase() + id.slice(1);
    performance.mark(beginId);
    return beginId;
  }

  public static endMeasure(name: string, beginId: string): void {
    performance.measure(name, beginId);
  }

  public addRequestStatistic(command: RequestCommand | IncomingRequestCommand, messageType: MessageType): void {
    switch (messageType) {
      case MessageType.CALL_MESSAGE:
        if (this.statistics.statisticsData[command] && this.statistics.statisticsData[command].countRequest) {
          this.statistics.statisticsData[command].countRequest++;
        } else {
          this.statistics.statisticsData[command] = {} as StatisticsData;
          this.statistics.statisticsData[command].countRequest = 1;
        }
        break;
      case MessageType.CALL_RESULT_MESSAGE:
        if (this.statistics.statisticsData[command]) {
          if (this.statistics.statisticsData[command].countResponse) {
            this.statistics.statisticsData[command].countResponse++;
          } else {
            this.statistics.statisticsData[command].countResponse = 1;
          }
        } else {
          this.statistics.statisticsData[command] = {} as StatisticsData;
          this.statistics.statisticsData[command].countResponse = 1;
        }
        break;
      case MessageType.CALL_ERROR_MESSAGE:
        if (this.statistics.statisticsData[command]) {
          if (this.statistics.statisticsData[command].countError) {
            this.statistics.statisticsData[command].countError++;
          } else {
            this.statistics.statisticsData[command].countError = 1;
          }
        } else {
          this.statistics.statisticsData[command] = {} as StatisticsData;
          this.statistics.statisticsData[command].countError = 1;
        }
        break;
      default:
        logger.error(`${this.logPrefix()} wrong message type ${messageType}`);
        break;
    }
  }

  public start(): void {
    this.startDisplayInterval();
  }

  public stop(): void {
    if (this.displayInterval) {
      clearInterval(this.displayInterval);
    }
    performance.clearMarks();
    this.performanceObserver?.disconnect();
  }

  public restart(): void {
    this.stop();
    this.start();
  }

  private initializePerformanceObserver(): void {
    this.performanceObserver = new PerformanceObserver((list) => {
      this.addPerformanceEntry(list.getEntries()[0]);
    });
    this.performanceObserver.observe({ entryTypes: ['measure'] });
  }

  private addPerformanceEntry(entry: PerformanceEntry): void {
    this.addPerformanceStatistic(entry.name, entry.duration);
    logger.debug(`${this.logPrefix()} '${entry.name}' performance entry: %j`, entry);
  }

  private logStatistics(): void {
    logger.info(this.logPrefix() + ' %j', this.statistics);
  }

  private startDisplayInterval(): void {
    if (Configuration.getStatisticsDisplayInterval() > 0) {
      this.displayInterval = setInterval(() => {
        this.logStatistics();
      }, Configuration.getStatisticsDisplayInterval() * 1000);
      logger.info(this.logPrefix() + ' displayed every ' + Utils.secondsToHHMMSS(Configuration.getStatisticsDisplayInterval()));
    } else {
      logger.info(this.logPrefix() + ' display interval is set to ' + Configuration.getStatisticsDisplayInterval().toString() + '. Not displaying statistics');
    }
  }

  private median(dataSet: number[]): number {
    if (Array.isArray(dataSet) && dataSet.length === 1) {
      return dataSet[0];
    }
    const sortedDataSet = dataSet.slice().sort();
    const middleIndex = Math.floor(sortedDataSet.length / 2);
    if (sortedDataSet.length % 2) {
      return sortedDataSet[middleIndex / 2];
    }
    return (sortedDataSet[(middleIndex - 1)] + sortedDataSet[middleIndex]) / 2;
  }

  private stdDeviation(dataSet: number[]): number {
    let totalDataSet = 0;
    for (const data of dataSet) {
      totalDataSet += data;
    }
    const dataSetMean = totalDataSet / dataSet.length;
    let totalGeometricDeviation = 0;
    for (const data of dataSet) {
      const deviation = data - dataSetMean;
      totalGeometricDeviation += deviation * deviation;
    }
    return Math.sqrt(totalGeometricDeviation / dataSet.length);
  }

  private addPerformanceStatistic(name: string, duration: number): void {
    // Rename entry name
    const MAP_NAME = {};
    if (MAP_NAME[name]) {
      name = MAP_NAME[name] as string;
    }
    // Initialize command statistics
    if (!this.statistics.statisticsData[name]) {
      this.statistics.statisticsData[name] = {} as StatisticsData;
    }
    // Update current statistics timers
    this.statistics.statisticsData[name].countTimeMeasurement = this.statistics.statisticsData[name].countTimeMeasurement ? this.statistics.statisticsData[name].countTimeMeasurement + 1 : 1;
    this.statistics.statisticsData[name].currentTimeMeasurement = duration;
    this.statistics.statisticsData[name].minTimeMeasurement = this.statistics.statisticsData[name].minTimeMeasurement ? (this.statistics.statisticsData[name].minTimeMeasurement > duration ? duration : this.statistics.statisticsData[name].minTimeMeasurement) : duration;
    this.statistics.statisticsData[name].maxTimeMeasurement = this.statistics.statisticsData[name].maxTimeMeasurement ? (this.statistics.statisticsData[name].maxTimeMeasurement < duration ? duration : this.statistics.statisticsData[name].maxTimeMeasurement) : duration;
    this.statistics.statisticsData[name].totalTimeMeasurement = this.statistics.statisticsData[name].totalTimeMeasurement ? this.statistics.statisticsData[name].totalTimeMeasurement + duration : duration;
    this.statistics.statisticsData[name].avgTimeMeasurement = this.statistics.statisticsData[name].totalTimeMeasurement / this.statistics.statisticsData[name].countTimeMeasurement;
    Array.isArray(this.statistics.statisticsData[name].timeMeasurementSeries) ? this.statistics.statisticsData[name].timeMeasurementSeries.push(duration) : this.statistics.statisticsData[name].timeMeasurementSeries = new CircularArray<number>(DEFAULT_CIRCULAR_ARRAY_SIZE, duration);
    this.statistics.statisticsData[name].medTimeMeasurement = this.median(this.statistics.statisticsData[name].timeMeasurementSeries);
    this.statistics.statisticsData[name].stdDevTimeMeasurement = this.stdDeviation(this.statistics.statisticsData[name].timeMeasurementSeries);
  }

  private logPrefix(): string {
    return Utils.logPrefix(` ${this.objId} | Performance statistics`);
  }
}
