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
        if (this._statistics[command] && this._statistics[command].countRequest) {
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

  addPerformanceTimer(command: string, duration: number): void {
    // Map to proper command name
    const MAPCOMMAND = {
      sendMeterValues: 'MeterValues',
      startTransaction: 'StartTransaction',
      stopTransaction: 'StopTransaction',
    };
    if (MAPCOMMAND[command]) {
      command = MAPCOMMAND[command];
    }
    // Initialize command statistics
    if (!this._statistics[command]) {
      this._statistics[command] = {};
    }
    // Update current statistics timers
    this._statistics[command].countTime = this._statistics[command].countTime ? this._statistics[command].countTime + 1 : 1;
    this._statistics[command].minTime = this._statistics[command].minTime ? (this._statistics[command].minTime > duration ? duration : this._statistics[command].minTime) : duration;
    this._statistics[command].maxTime = this._statistics[command].maxTime ? (this._statistics[command].maxTime < duration ? duration : this._statistics[command].maxTime) : duration;
    this._statistics[command].totalTime = this._statistics[command].totalTime ? this._statistics[command].totalTime + duration : duration;
    this._statistics[command].avgTime = this._statistics[command].totalTime / this._statistics[command].countTime;
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
