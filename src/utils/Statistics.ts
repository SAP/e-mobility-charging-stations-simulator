import Configuration from './Configuration';
import Constants from './Constants';
import Utils from './Utils';
import logger from './Logger';

export default class Statistics {
  private static instance: Statistics;
  private _statistics;
  private _objName: string;

  private constructor() {
    this._statistics = {};
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
        if (this._statistics[command] && this._statistics[command].count) {
          this._statistics[command].countRequest++;
        } else {
          this._statistics[command] = {};
          this._statistics[command].countRequest = 1;
        }
        break;
      case Constants.OCPP_JSON_CALL_RESULT_MESSAGE:
        if (this._statistics[command]) {
          if (this._statistics[command].countResponse) {
            this._statistics[command].countResponse++;
          } else {
            this._statistics[command].countResponse = 1;
          }
        } else {
          this._statistics[command] = {};
          this._statistics[command].countResponse = 1;
        }
        break;
      case Constants.OCPP_JSON_CALL_ERROR_MESSAGE:
        if (this._statistics[command]) {
          if (this._statistics[command].countError) {
            this._statistics[command].countError++;
          } else {
            this._statistics[command].countError = 1;
          }
        } else {
          this._statistics[command] = {};
          this._statistics[command].countError = 1;
        }
        break;
      default:
        logger.error(`${this._logPrefix()} Wrong message type ${messageType}`);
        break;
    }
  }

  addPerformanceTimer(command, duration) {
    let currentStatistics;
    // Map to proper command name
    const MAPCOMMAND = {
      sendMeterValues: 'MeterValues',
      startTransaction: 'StartTransaction',
      stopTransaction: 'StopTransaction',
    };
    // Get current command statistics
    if (MAPCOMMAND[command]) {
      currentStatistics = this._statistics[MAPCOMMAND[command]];
    } else if (this._statistics[command]) {
      currentStatistics = this._statistics[command];
    } else {
      this._statistics[command] = {};
      currentStatistics = this._statistics[command];
    }

    if (currentStatistics) {
      // Update current statistics timers
      currentStatistics.countTime = currentStatistics.countTime ? currentStatistics.countTime + 1 : 1;
      currentStatistics.minTime = currentStatistics.minTime ? (currentStatistics.minTime > duration ? duration : currentStatistics.minTime) : duration;
      currentStatistics.maxTime = currentStatistics.maxTime ? (currentStatistics.maxTime < duration ? duration : currentStatistics.maxTime) : duration;
      currentStatistics.totalTime = currentStatistics.totalTime ? currentStatistics.totalTime + duration : duration;
      currentStatistics.avgTime = currentStatistics.totalTime / currentStatistics.countTime;
    }
  }

  logPerformance(entry, className: string): void {
    this.addPerformanceTimer(entry.name, entry.duration);
    logger.info(`${this._logPrefix()} class->${className}, method->${entry.name}, duration->${entry.duration}`);
  }

  _display(): void {
    logger.info(this._logPrefix() + ' %j', this._statistics);
  }

  _displayInterval(): void {
    if (Configuration.getStatisticsDisplayInterval() > 0) {
      setInterval(() => {
        this._display();
      }, Configuration.getStatisticsDisplayInterval() * 1000);
      logger.info(this._logPrefix() + ' displayed every ' + Configuration.getStatisticsDisplayInterval() + 's');
    }
  }

  start(): void {
    this._displayInterval();
  }

  private _logPrefix(): string {
    return Utils.logPrefix(` ${this._objName} Statistics:`);
  }
}
