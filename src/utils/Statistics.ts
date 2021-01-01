import CommandStatistics, { CommandStatisticsData, PerfEntry } from '../types/CommandStatistics';

import CircularArray from './CircularArray';
import Configuration from './Configuration';
import { MessageType } from '../types/ocpp/MessageType';
import { PerformanceEntry } from 'perf_hooks';
import Utils from './Utils';
import logger from './Logger';

export default class Statistics {
  private static instance: Statistics;
  private _objName: string;
  private _commandsStatistics: CommandStatistics;

  private constructor() {
    this._commandsStatistics = {} as CommandStatistics;
  }

  set objName(objName: string) {
    this._objName = objName;
  }

  static getInstance(): Statistics {
    if (!Statistics.instance) {
      Statistics.instance = new Statistics();
    }
    return Statistics.instance;
  }

  addMessage(command: string, messageType: number): void {
    switch (messageType) {
      case MessageType.CALL_MESSAGE:
        if (this._commandsStatistics[command] && this._commandsStatistics[command].countRequest) {
          this._commandsStatistics[command].countRequest++;
        } else {
          this._commandsStatistics[command] = {} as CommandStatisticsData;
          this._commandsStatistics[command].countRequest = 1;
        }
        break;
      case MessageType.CALL_RESULT_MESSAGE:
        if (this._commandsStatistics[command]) {
          if (this._commandsStatistics[command].countResponse) {
            this._commandsStatistics[command].countResponse++;
          } else {
            this._commandsStatistics[command].countResponse = 1;
          }
        } else {
          this._commandsStatistics[command] = {} as CommandStatisticsData;
          this._commandsStatistics[command].countResponse = 1;
        }
        break;
      case MessageType.CALL_ERROR_MESSAGE:
        if (this._commandsStatistics[command]) {
          if (this._commandsStatistics[command].countError) {
            this._commandsStatistics[command].countError++;
          } else {
            this._commandsStatistics[command].countError = 1;
          }
        } else {
          this._commandsStatistics[command] = {} as CommandStatisticsData;
          this._commandsStatistics[command].countError = 1;
        }
        break;
      default:
        logger.error(`${this._logPrefix()} Wrong message type ${messageType}`);
        break;
    }
  }

  logPerformance(entry: PerformanceEntry, className: string): void {
    this.addPerformanceTimer(entry.name, entry.duration);
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
    logger.info(this._logPrefix() + ' %j', this._commandsStatistics);
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

  private addPerformanceTimer(command: string, duration: number): void {
    // Map to proper command name
    const MAPCOMMAND = {
      sendMeterValues: 'MeterValues',
      startTransaction: 'StartTransaction',
      stopTransaction: 'StopTransaction',
    };
    if (MAPCOMMAND[command]) {
      command = MAPCOMMAND[command] as string;
    }
    // Initialize command statistics
    if (!this._commandsStatistics[command]) {
      this._commandsStatistics[command] = {} as CommandStatisticsData;
    }
    // Update current statistics timers
    this._commandsStatistics[command].countTimeMeasurement = this._commandsStatistics[command].countTimeMeasurement ? this._commandsStatistics[command].countTimeMeasurement + 1 : 1;
    this._commandsStatistics[command].currentTimeMeasurement = duration;
    this._commandsStatistics[command].minTimeMeasurement = this._commandsStatistics[command].minTimeMeasurement ? (this._commandsStatistics[command].minTimeMeasurement > duration ? duration : this._commandsStatistics[command].minTimeMeasurement) : duration;
    this._commandsStatistics[command].maxTimeMeasurement = this._commandsStatistics[command].maxTimeMeasurement ? (this._commandsStatistics[command].maxTimeMeasurement < duration ? duration : this._commandsStatistics[command].maxTimeMeasurement) : duration;
    this._commandsStatistics[command].totalTimeMeasurement = this._commandsStatistics[command].totalTimeMeasurement ? this._commandsStatistics[command].totalTimeMeasurement + duration : duration;
    this._commandsStatistics[command].avgTimeMeasurement = this._commandsStatistics[command].totalTimeMeasurement / this._commandsStatistics[command].countTimeMeasurement;
    Array.isArray(this._commandsStatistics[command].timeMeasurementSeries) ? this._commandsStatistics[command].timeMeasurementSeries.push(duration) : this._commandsStatistics[command].timeMeasurementSeries = [duration] as CircularArray<number>;
    this._commandsStatistics[command].medTimeMeasurement = this.median(this._commandsStatistics[command].timeMeasurementSeries);
  }

  private _logPrefix(): string {
    return Utils.logPrefix(` ${this._objName} Statistics:`);
  }
}
