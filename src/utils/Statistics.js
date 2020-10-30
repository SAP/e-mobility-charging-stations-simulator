import Configuration from './Configuration.js';
import Utils from './Utils.js';
import logger from './Logger.js';

export default class Statistics {
  static instance;

  constructor() {
    this._statistics = {};
  }

  set objName(objName) {
    this._objName = objName;
  }

  static getInstance() {
    if (!Statistics.instance) {
      Statistics.instance = new Statistics();
    }
    return Statistics.instance;
  }

  _logPrefix() {
    return Utils.logPrefix(` ${this._objName} Statistics:`);
  }

  addMessage(command, response = false) {
    if (response) {
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
    } else if (this._statistics[command] && this._statistics[command].count) {
      this._statistics[command].count++;
    } else {
      this._statistics[command] = {};
      this._statistics[command].count = 1;
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

  logPerformance(entry, className) {
    this.addPerformanceTimer(entry.name, entry.duration);
    logger.info(`${this._logPrefix()} class->${className}, method->${entry.name}, duration->${entry.duration}`);
  }

  _display() {
    logger.info(this._logPrefix() + ' %j', this._statistics);
  }

  _displayInterval() {
    if (Configuration.getStatisticsDisplayInterval() > 0) {
      setInterval(() => {
        this._display();
      }, Configuration.getStatisticsDisplayInterval() * 1000);
      logger.info(this._logPrefix() + ' displayed every ' + Configuration.getStatisticsDisplayInterval() + 's');
    }
  }

  async start() {
    this._displayInterval();
  }
}
