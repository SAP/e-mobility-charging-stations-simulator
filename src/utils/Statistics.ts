import CommandStatistics, { CommandStatisticsData, PerfEntry } from '../types/CommandStatistics';
import { IncomingRequestCommand, RequestCommand } from '../types/ocpp/1.6/Requests';

import CircularArray from './CircularArray';
import Configuration from './Configuration';
import { MessageType } from '../types/ocpp/MessageType';
import { PerformanceEntry } from 'perf_hooks';
import Utils from './Utils';
import logger from './Logger';

export default class Statistics {
  private objId: string;
  private commandsStatistics: CommandStatistics;

  public constructor(objName: string) {
    this.objId = objName;
    this.commandsStatistics = { id: this.objId ? this.objId : ' Object id not specified', commandsStatisticsData: {} };
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
        logger.error(`${this._logPrefix()} Wrong message type ${messageType}`);
        break;
    }
  }

  public logPerformance(entry: PerformanceEntry, className: string): void {
    this.addPerformanceTimer(entry.name as RequestCommand | IncomingRequestCommand, entry.duration);
    const perfEntry: PerfEntry = {} as PerfEntry;
    perfEntry.name = entry.name;
    perfEntry.entryType = entry.entryType;
    perfEntry.startTime = entry.startTime;
    perfEntry.duration = entry.duration;
    logger.info(`${this._logPrefix()} object ${className} method(s) performance entry: %j`, perfEntry);
  }

  public start(): void {
    this._displayInterval();
  }

  private _display(): void {
    logger.info(this._logPrefix() + ' %j', this.commandsStatistics);
  }

  private _displayInterval(): void {
    if (Configuration.getStatisticsDisplayInterval() > 0) {
      setInterval(() => {
        this._display();
      }, Configuration.getStatisticsDisplayInterval() * 1000);
      logger.info(this._logPrefix() + ' displayed every ' + Utils.secondsToHHMMSS(Configuration.getStatisticsDisplayInterval()));
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

  private addPerformanceTimer(command: RequestCommand | IncomingRequestCommand, duration: number): void {
    // Map to proper command name
    const MAPCOMMAND = {
      sendMeterValues: 'MeterValues',
      startTransaction: 'StartTransaction',
      stopTransaction: 'StopTransaction',
    };
    if (MAPCOMMAND[command]) {
      command = MAPCOMMAND[command] as RequestCommand | IncomingRequestCommand;
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
    Array.isArray(this.commandsStatistics.commandsStatisticsData[command].timeMeasurementSeries) ? this.commandsStatistics.commandsStatisticsData[command].timeMeasurementSeries.push(duration) : this.commandsStatistics.commandsStatisticsData[command].timeMeasurementSeries = [duration] as CircularArray<number>;
    this.commandsStatistics.commandsStatisticsData[command].medTimeMeasurement = this.median(this.commandsStatistics.commandsStatisticsData[command].timeMeasurementSeries);
  }

  private _logPrefix(): string {
    return Utils.logPrefix(` ${this.objId} Statistics:`);
  }
}
