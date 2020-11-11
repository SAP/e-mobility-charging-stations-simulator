import CommandStatisticsData from '../types/CommandStatisticsData';
import Configuration from './Configuration';
import Constants from './Constants';
import { PerformanceEntry } from 'perf_hooks';
import Utils from './Utils';
import logger from './Logger';

export default class Statistics {
  private static instance: Statistics;
  private _objName: string;
  private _commandsStatistics: {
    [command: string]: CommandStatisticsData
  };

  private constructor() {
    this._commandsStatistics = {};
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
      case Constants.OCPP_JSON_CALL_MESSAGE:
        if (this._commandsStatistics[command] && this._commandsStatistics[command].countRequest) {
          this._commandsStatistics[command].countRequest++;
        } else {
          this._commandsStatistics[command] = {} as CommandStatisticsData;
          this._commandsStatistics[command].countRequest = 1;
        }
        break;
      case Constants.OCPP_JSON_CALL_RESULT_MESSAGE:
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
      case Constants.OCPP_JSON_CALL_ERROR_MESSAGE:
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
    logger.info(`${this._logPrefix()} class->${className}, method->${entry.name}, duration->${entry.duration}`);
  }

  _display(): void {
    logger.info(this._logPrefix() + ' %j', this._commandsStatistics);
  }

  _displayInterval(): void {
    if (Configuration.getStatisticsDisplayInterval() > 0) {
      setInterval(() => {
        this._display();
      }, Configuration.getStatisticsDisplayInterval() * 1000);
      logger.info(this._logPrefix() + ' displayed every ' + Utils.secondsToHHMMSS(Configuration.getStatisticsDisplayInterval()));
    }
  }

  start(): void {
    this._displayInterval();
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
    this._commandsStatistics[command].countTime = this._commandsStatistics[command].countTime ? this._commandsStatistics[command].countTime + 1 : 1;
    this._commandsStatistics[command].minTime = this._commandsStatistics[command].minTime ? (this._commandsStatistics[command].minTime > duration ? duration : this._commandsStatistics[command].minTime) : duration;
    this._commandsStatistics[command].maxTime = this._commandsStatistics[command].maxTime ? (this._commandsStatistics[command].maxTime < duration ? duration : this._commandsStatistics[command].maxTime) : duration;
    this._commandsStatistics[command].totalTime = this._commandsStatistics[command].totalTime ? this._commandsStatistics[command].totalTime + duration : duration;
    this._commandsStatistics[command].avgTime = this._commandsStatistics[command].totalTime / this._commandsStatistics[command].countTime;
  }

  private _logPrefix(): string {
    return Utils.logPrefix(` ${this._objName} Statistics:`);
  }
}
