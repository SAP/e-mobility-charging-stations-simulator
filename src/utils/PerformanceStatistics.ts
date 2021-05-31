import { CircularArray, DEFAULT_CIRCULAR_ARRAY_SIZE } from './CircularArray';
import CommandStatistics, { CommandStatisticsData, PerfEntry } from '../types/CommandStatistics';
import { IncomingRequestCommand, RequestCommand } from '../types/ocpp/Requests';

import Configuration from './Configuration';
import { MessageType } from '../types/ocpp/MessageType';
import { PerformanceEntry } from 'perf_hooks';
import Utils from './Utils';
import logger from './Logger';

export default class PerformanceStatistics {
  private objId: string;
  private commandsStatistics: CommandStatistics;

  public constructor(objId: string) {
    this.objId = objId;
    this.commandsStatistics = { id: this.objId ? this.objId : 'Object id not specified', commandsStatisticsData: {} };
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

  public logPerformance(entry: PerformanceEntry, className: string): void {
    this.addPerformanceTimer(entry.name as RequestCommand | IncomingRequestCommand, entry.duration);
    const perfEntry: PerfEntry = {
      name: entry.name,
      entryType: entry.entryType,
      startTime: entry.startTime,
      duration: entry.duration
    } ;
    logger.info(`${this.logPrefix()} ${className} method(s) entry: %j`, perfEntry);
  }

  public start(): void {
    this.displayInterval();
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

  private addPerformanceTimer(command: RequestCommand | IncomingRequestCommand, duration: number): void {
    // Map to proper command name
    const MAP_COMMAND = {
      sendMeterValues: RequestCommand.METER_VALUES,
      startTransaction: RequestCommand.START_TRANSACTION,
      stopTransaction: RequestCommand.STOP_TRANSACTION,
    };
    if (MAP_COMMAND[command]) {
      command = MAP_COMMAND[command] as RequestCommand | IncomingRequestCommand;
    }
    // Initialize command statistics
    if (!this.commandsStatistics.commandsStatisticsData[command]) {
      this.commandsStatistics.commandsStatisticsData[command] = {} as CommandStatisticsData;
    }
    // Update current statistics timers
    this.commandsStatistics.commandsStatisticsData[command].countTimeMeasurement = this.commandsStatistics.commandsStatisticsData[command].countTimeMeasurement ? this.commandsStatistics.commandsStatisticsData[command].countTimeMeasurement + 1 : 1;
    this.commandsStatistics.commandsStatisticsData[command].currentTimeMeasurement = duration;
    this.commandsStatistics.commandsStatisticsData[command].minTimeMeasurement = this.commandsStatistics.commandsStatisticsData[command].minTimeMeasurement ? (this.commandsStatistics.commandsStatisticsData[command].minTimeMeasurement > duration ? duration : this.commandsStatistics.commandsStatisticsData[command].minTimeMeasurement) : duration;
    this.commandsStatistics.commandsStatisticsData[command].maxTimeMeasurement = this.commandsStatistics.commandsStatisticsData[command].maxTimeMeasurement ? (this.commandsStatistics.commandsStatisticsData[command].maxTimeMeasurement < duration ? duration : this.commandsStatistics.commandsStatisticsData[command].maxTimeMeasurement) : duration;
    this.commandsStatistics.commandsStatisticsData[command].totalTimeMeasurement = this.commandsStatistics.commandsStatisticsData[command].totalTimeMeasurement ? this.commandsStatistics.commandsStatisticsData[command].totalTimeMeasurement + duration : duration;
    this.commandsStatistics.commandsStatisticsData[command].avgTimeMeasurement = this.commandsStatistics.commandsStatisticsData[command].totalTimeMeasurement / this.commandsStatistics.commandsStatisticsData[command].countTimeMeasurement;
    Array.isArray(this.commandsStatistics.commandsStatisticsData[command].timeMeasurementSeries) ? this.commandsStatistics.commandsStatisticsData[command].timeMeasurementSeries.push(duration) : this.commandsStatistics.commandsStatisticsData[command].timeMeasurementSeries = new CircularArray<number>(DEFAULT_CIRCULAR_ARRAY_SIZE, duration);
    this.commandsStatistics.commandsStatisticsData[command].medTimeMeasurement = this.median(this.commandsStatistics.commandsStatisticsData[command].timeMeasurementSeries);
    this.commandsStatistics.commandsStatisticsData[command].stdDevTimeMeasurement = this.stdDeviation(this.commandsStatistics.commandsStatisticsData[command].timeMeasurementSeries);
  }

  private logPrefix(): string {
    return Utils.logPrefix(` ${this.objId} | Performance statistics`);
  }
}
