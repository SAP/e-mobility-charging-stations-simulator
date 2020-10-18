const logger = require('../utils/Logger');
const Utils = require('../utils/Utils');
const {performance, PerformanceObserver} = require('perf_hooks');

class AutomaticTransactionGenerator {
  constructor(chargingStation) {
    this._chargingStation = chargingStation;
    this._timeToStop = true;
    this._performanceObserver = new PerformanceObserver((list) => {
      const entry = list.getEntries()[0];
      this._chargingStation._statistics.logPerformance(entry, 'AutomaticTransactionGenerator');
      this._performanceObserver.disconnect();
    });
  }

  get timeToStop() {
    return this._timeToStop;
  }

  _basicFormatLog(connectorId = null) {
    if (connectorId) {
      return Utils.basicFormatLog(' ' + this._chargingStation._stationInfo.name + ' ATG on connector #' + connectorId + ':');
    }
    return Utils.basicFormatLog(' ' + this._chargingStation._stationInfo.name + ' ATG:');
  }

  async stop() {
    logger.info(this._basicFormatLog() + ' ATG OVER => STOPPING ALL TRANSACTIONS');
    for (const connector in this._chargingStation._connectors) {
      if (this._chargingStation._connectors[connector].transactionStarted) {
        logger.info(this._basicFormatLog(connector) + ' ATG OVER. Stop transaction ' + this._chargingStation._connectors[connector].transactionId);
        await this._chargingStation.sendStopTransaction(this._chargingStation._connectors[connector].transactionId);
      }
    }
    this._timeToStop = true;
  }

  async start() {
    this._timeToStop = false;
    if (this._chargingStation._stationInfo.AutomaticTransactionGenerator.stopAfterHours &&
      this._chargingStation._stationInfo.AutomaticTransactionGenerator.stopAfterHours > 0) {
      logger.info(this._basicFormatLog() + ' ATG will stop in ' + Utils.secondstoHHMMSS(this._chargingStation._stationInfo.AutomaticTransactionGenerator.stopAfterHours * 3600));
      setTimeout(() => {
        this.stop();
      }, this._chargingStation._stationInfo.AutomaticTransactionGenerator.stopAfterHours * 3600 * 1000);
    }
    for (const connector in this._chargingStation._connectors) {
      if (connector > 0) {
        this.startConnector(connector);
      }
    }
  }

  async startConnector(connectorId) {
    do {
      const wait = Utils.getRandomInt(this._chargingStation._stationInfo.AutomaticTransactionGenerator.maxDelayBetweenTwoTransactions,
          this._chargingStation._stationInfo.AutomaticTransactionGenerator.minDelayBetweenTwoTransactions) * 1000;
      logger.info(this._basicFormatLog(connectorId) + ' wait for ' + Utils.secondstoHHMMSS(wait / 1000));
      await Utils.sleep(wait);
      if (this._timeToStop) break;
      const start = Math.random();
      let skip = 0;
      if (start < this._chargingStation._stationInfo.AutomaticTransactionGenerator.probabilityOfStart) {
        skip = 0;
        // Start transaction
        const startTransaction = performance.timerify(this.startTransaction);
        this._performanceObserver.observe({entryTypes: ['function']});
        const startResponse = await startTransaction(connectorId, this);
        if (startResponse.idTagInfo.status !== 'Accepted') {
          logger.info(this._basicFormatLog(connectorId) + ' transaction rejected');
          await Utils.sleep(2000);
        } else {
          // Wait until end of transaction
          const wait = Utils.getRandomInt(this._chargingStation._stationInfo.AutomaticTransactionGenerator.maxDuration,
              this._chargingStation._stationInfo.AutomaticTransactionGenerator.minDuration) * 1000;
          logger.info(this._basicFormatLog(connectorId) + ' transaction ' + this._chargingStation._connectors[connectorId].transactionId + ' will stop in ' + Utils.secondstoHHMMSS(wait / 1000));
          await Utils.sleep(wait);
          // Stop transaction
          if (this._chargingStation._connectors[connectorId].transactionStarted) {
            logger.info(this._basicFormatLog(connectorId) + ' stop transaction ' + this._chargingStation._connectors[connectorId].transactionId);
            const stopTransaction = performance.timerify(this.stopTransaction);
            this._performanceObserver.observe({entryTypes: ['function']});
            await stopTransaction(connectorId, this);
          }
        }
      } else {
        skip++;
        logger.info(this._basicFormatLog(connectorId) + ' transaction skipped ' + skip);
      }
    } while (!this._timeToStop);
    logger.info(this._basicFormatLog(connectorId) + ' ATG STOPPED on the connector');
  }

  // eslint-disable-next-line class-methods-use-this
  async startTransaction(connectorId, self) {
    if (self._chargingStation.hasAuthorizedTags()) {
      const tagId = self._chargingStation.getRandomTagId();
      logger.info(self._basicFormatLog(connectorId) + ' start transaction for tagID ' + tagId);
      return self._chargingStation.sendStartTransaction(connectorId, tagId);
    }
    return self._chargingStation.sendStartTransaction(connectorId);
  }

  // eslint-disable-next-line class-methods-use-this
  async stopTransaction(connectorId, self) {
    await self._chargingStation.sendStopTransaction(self._chargingStation._connectors[connectorId].transactionId);
  }
}

module.exports = AutomaticTransactionGenerator;
