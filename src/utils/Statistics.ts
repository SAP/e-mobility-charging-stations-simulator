import CommandStatistics, { CommandStatisticsData, PerfEntry } from '../types/CommandStatistics';
import { IncomingRequestCommand, RequestCommand } from '../types/ocpp/1.6/Requests';

import CircularArray from './CircularArray';
import Configuration from './Configuration';
import { MessageType } from '../types/ocpp/MessageType';
import { PerformanceEntry } from 'perf_hooks';
import Utils from './Utils';
import logger from './Logger';

export default class Statistics {
  private static instance: Statistics;
  public objName: string;
  private commandsStatistics: CommandStatistics;

  private constructor() {
    this.commandsStatistics = {} as CommandStatistics;
  }

  static getInstance(): Statistics {
    if (!Statistics.instance) {
      Statistics.instance = new Statistics();
    }
    return Statistics.instance;
  }

  addMessage(command: RequestCommand | IncomingRequestCommand, messageType: MessageType): void {
    switch (messageType) {
      case MessageType.CALL_MESSAGE:
        if (this.commandsStatistics[command] && this.commandsStatistics[command].countRequest) {
          this.commandsStatistics[command].countRequest++;
        } else {
          this.commandsStatistics[command] = {} as CommandStatisticsData;
          this.commandsStatistics[command].countRequest = 1;
        }
        break;
      case MessageType.CALL_RESULT_MESSAGE:
        if (this.commandsStatistics[command]) {
          if (this.commandsStatistics[command].countResponse) {
            this.commandsStatistics[command].countResponse++;
          } else {
            this.commandsStatistics[command].countResponse = 1;
          }
        } else {
          this.commandsStatistics[command] = {} as CommandStatisticsData;
          this.commandsStatistics[command].countResponse = 1;
        }
        break;
      case MessageType.CALL_ERROR_MESSAGE:
        if (this.commandsStatistics[command]) {
          if (this.commandsStatistics[command].countError) {
            this.commandsStatistics[command].countError++;
          } else {
            this.commandsStatistics[command].countError = 1;
          }
        } else {
          this.commandsStatistics[command] = {} as CommandStatisticsData;
          this.commandsStatistics[command].countError = 1;
        }
        break;
      default:
        logger.error(`${this._logPrefix()} Wrong message type ${messageType}`);
        break;
    }
  }

  logPerformance(entry: PerformanceEntry, className: string): void {
    this.addPerformanceTimer(entry.name as RequestCommand | IncomingRequestCommand, entry.duration);
    const perfEntry: PerfEntry = {} as PerfEntry;
    perfEntry.name = entry.name;
    perfEntry.entryType = entry.entryType;
    perfEntry.startTime = entry.startTime;
    perfEntry.duration = entry.duration;
    logger.info(`${this._logPrefix()} object ${className} method(s) performance entry: %j`, perfEntry);
  }

  start(): void {
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
    if (!this.commandsStatistics[command]) {
      this.commandsStatistics[command] = {} as CommandStatisticsData;
    }
    // Update current statistics timers
    this.commandsStatistics[command].countTimeMeasurement = this.commandsStatistics[command].countTimeMeasurement ? this.commandsStatistics[command].countTimeMeasurement + 1 : 1;
    this.commandsStatistics[command].currentTimeMeasurement = duration;
    this.commandsStatistics[command].minTimeMeasurement = this.commandsStatistics[command].minTimeMeasurement ? (this.commandsStatistics[command].minTimeMeasurement > duration ? duration : this.commandsStatistics[command].minTimeMeasurement) : duration;
    this.commandsStatistics[command].maxTimeMeasurement = this.commandsStatistics[command].maxTimeMeasurement ? (this.commandsStatistics[command].maxTimeMeasurement < duration ? duration : this.commandsStatistics[command].maxTimeMeasurement) : duration;
    this.commandsStatistics[command].totalTimeMeasurement = this.commandsStatistics[command].totalTimeMeasurement ? this.commandsStatistics[command].totalTimeMeasurement + duration : duration;
    this.commandsStatistics[command].avgTimeMeasurement = this.commandsStatistics[command].totalTimeMeasurement / this.commandsStatistics[command].countTimeMeasurement;
    Array.isArray(this.commandsStatistics[command].timeMeasurementSeries) ? this.commandsStatistics[command].timeMeasurementSeries.push(duration) : this.commandsStatistics[command].timeMeasurementSeries = [duration] as CircularArray<number>;
    this.commandsStatistics[command].medTimeMeasurement = this.median(this.commandsStatistics[command].timeMeasurementSeries);
  }

  private _logPrefix(): string {
    return Utils.logPrefix(` ${this.objName} Statistics:`);
  }
}
