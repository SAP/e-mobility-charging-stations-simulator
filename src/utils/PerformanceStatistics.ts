import { CircularArray, DEFAULT_CIRCULAR_ARRAY_SIZE } from './CircularArray';
import CommandStatistics, { CommandStatisticsData, PerfEntry } from '../types/CommandStatistics';
import { IncomingRequestCommand, RequestCommand } from '../types/ocpp/Requests';
import { PerformanceEntry, PerformanceObserver, performance } from 'perf_hooks';

import Configuration from './Configuration';
import { MessageType } from '../types/ocpp/MessageType';
import Utils from './Utils';
import logger from './Logger';

export default class PerformanceStatistics {
  private objId: string;
  private commandsStatistics: CommandStatistics;

  public constructor(objId: string) {
    this.initFunctionPerformanceObserver();
    this.objId = objId;
    this.commandsStatistics = { id: this.objId ? this.objId : 'Object id not specified', commandsStatisticsData: {} };
  }

  public static timedFunction(method: (...optionalParams: any[]) => any): (...optionalParams: any[]) => any {
    return performance.timerify(method);
  }

  public addMessage(command: RequestCommand | IncomingRequestCommand, messageType: MessageType): void {
    switch (messageType) {
      case MessageType.CALL_MESSAGE:
        if (this.commandsStatistics.commandsStatisticsData[command] && this.commandsStatistics.commandsStatisticsData[command].countRequest) {
          this.commandsStatistics.commandsStatisticsData[command].countRequest++;
        } else {
          this.commandsStatistics.commandsStatisticsData[command] = {} as CommandStatisticsData;
          this.commandsStatistics.commandsStatisticsData[command].countRequest = 1;
        }
        break;
      case MessageType.CALL_RESULT_MESSAGE:
        if (this.commandsStatistics.commandsStatisticsData[command]) {
          if (this.commandsStatistics.commandsStatisticsData[command].countResponse) {
            this.commandsStatistics.commandsStatisticsData[command].countResponse++;
          } else {
            this.commandsStatistics.commandsStatisticsData[command].countResponse = 1;
          }
        } else {
          this.commandsStatistics.commandsStatisticsData[command] = {} as CommandStatisticsData;
          this.commandsStatistics.commandsStatisticsData[command].countResponse = 1;
        }
        break;
      case MessageType.CALL_ERROR_MESSAGE:
        if (this.commandsStatistics.commandsStatisticsData[command]) {
          if (this.commandsStatistics.commandsStatisticsData[command].countError) {
            this.commandsStatistics.commandsStatisticsData[command].countError++;
          } else {
            this.commandsStatistics.commandsStatisticsData[command].countError = 1;
          }
        } else {
          this.commandsStatistics.commandsStatisticsData[command] = {} as CommandStatisticsData;
          this.commandsStatistics.commandsStatisticsData[command].countError = 1;
        }
        break;
      default:
        logger.error(`${this.logPrefix()} wrong message type ${messageType}`);
        break;
    }
  }

  public logPerformance(entry: PerformanceEntry): void {
    this.addPerformanceTimer(entry.name, entry.duration);
    const perfEntry: PerfEntry = {
      name: entry.name,
      entryType: entry.entryType,
      startTime: entry.startTime,
      duration: entry.duration
    };
    logger.debug(`${this.logPrefix()} method or function '${entry.name}' performance entry: %j`, perfEntry);
  }

  public start(): void {
    this.displayInterval();
  }

  private initFunctionPerformanceObserver(): void {
    const performanceObserver = new PerformanceObserver((list, observer) => {
      this.logPerformance(list.getEntries()[0]);
      observer.disconnect();
    });
    performanceObserver.observe({ entryTypes: ['function'] });
  }

  private display(): void {
    logger.info(this.logPrefix() + ' %j', this.commandsStatistics);
  }

  private displayInterval(): void {
    if (Configuration.getStatisticsDisplayInterval() > 0) {
      setInterval(() => {
        this.display();
      }, Configuration.getStatisticsDisplayInterval() * 1000);
      logger.info(this.logPrefix() + ' displayed every ' + Utils.secondsToHHMMSS(Configuration.getStatisticsDisplayInterval()));
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

  private addPerformanceTimer(name: string, duration: number): void {
    // Rename entry name
    const MAP_NAME = {
      startATGTransaction: 'StartATGTransaction',
      stopATGTransaction: 'StartATGTransaction'
    };
    if (MAP_NAME[name]) {
      name = MAP_NAME[name] as string;
    }
    // Initialize command statistics
    if (!this.commandsStatistics.commandsStatisticsData[name]) {
      this.commandsStatistics.commandsStatisticsData[name] = {} as CommandStatisticsData;
    }
    // Update current statistics timers
    this.commandsStatistics.commandsStatisticsData[name].countTimeMeasurement = this.commandsStatistics.commandsStatisticsData[name].countTimeMeasurement ? this.commandsStatistics.commandsStatisticsData[name].countTimeMeasurement + 1 : 1;
    this.commandsStatistics.commandsStatisticsData[name].currentTimeMeasurement = duration;
    this.commandsStatistics.commandsStatisticsData[name].minTimeMeasurement = this.commandsStatistics.commandsStatisticsData[name].minTimeMeasurement ? (this.commandsStatistics.commandsStatisticsData[name].minTimeMeasurement > duration ? duration : this.commandsStatistics.commandsStatisticsData[name].minTimeMeasurement) : duration;
    this.commandsStatistics.commandsStatisticsData[name].maxTimeMeasurement = this.commandsStatistics.commandsStatisticsData[name].maxTimeMeasurement ? (this.commandsStatistics.commandsStatisticsData[name].maxTimeMeasurement < duration ? duration : this.commandsStatistics.commandsStatisticsData[name].maxTimeMeasurement) : duration;
    this.commandsStatistics.commandsStatisticsData[name].totalTimeMeasurement = this.commandsStatistics.commandsStatisticsData[name].totalTimeMeasurement ? this.commandsStatistics.commandsStatisticsData[name].totalTimeMeasurement + duration : duration;
    this.commandsStatistics.commandsStatisticsData[name].avgTimeMeasurement = this.commandsStatistics.commandsStatisticsData[name].totalTimeMeasurement / this.commandsStatistics.commandsStatisticsData[name].countTimeMeasurement;
    Array.isArray(this.commandsStatistics.commandsStatisticsData[name].timeMeasurementSeries) ? this.commandsStatistics.commandsStatisticsData[name].timeMeasurementSeries.push(duration) : this.commandsStatistics.commandsStatisticsData[name].timeMeasurementSeries = new CircularArray<number>(DEFAULT_CIRCULAR_ARRAY_SIZE, duration);
    this.commandsStatistics.commandsStatisticsData[name].medTimeMeasurement = this.median(this.commandsStatistics.commandsStatisticsData[name].timeMeasurementSeries);
    this.commandsStatistics.commandsStatisticsData[name].stdDevTimeMeasurement = this.stdDeviation(this.commandsStatistics.commandsStatisticsData[name].timeMeasurementSeries);
  }

  private logPrefix(): string {
    return Utils.logPrefix(` ${this.objId} | Performance statistics`);
  }
}
