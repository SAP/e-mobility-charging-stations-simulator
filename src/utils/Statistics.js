const Configuration = require('./Configuration');
const logger = require('./Logger');
const Utils = require('./Utils');

class Statistics {
  constructor(objName) {
    this._objName = objName;
    this._statistics = {};
  }

  _basicFormatLog() {
    return Utils.basicFormatLog(` ${this._objName} Statistics:`);
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
    logger.info(`${this._basicFormatLog()} class->${className}, method->${entry.name}, duration->${entry.duration}`);
  }

  _display() {
    logger.info(this._basicFormatLog() + ' %j', this._statistics);
  }

  _displayInterval() {
    if (Configuration.getStatisticsDisplayInterval() !== 0) {
      logger.info(this._basicFormatLog() + ' displayed every ' + Configuration.getStatisticsDisplayInterval() + 's');
      setInterval(() => {
        this._display();
      }, Configuration.getStatisticsDisplayInterval() * 1000);
    }
  }

  async start() {
    this._displayInterval();
  }
}

module.exports = Statistics;
