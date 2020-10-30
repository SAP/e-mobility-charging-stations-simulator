import {PerformanceObserver, performance} from 'perf_hooks';

import Constants from '../utils/Constants.js';
import Utils from '../utils/Utils.js';
import logger from '../utils/Logger.js';

export default class AutomaticTransactionGenerator {
  constructor(chargingStation) {
    this._chargingStation = chargingStation;
    this._timeToStop = true;
    if (this._chargingStation.getEnableStatistics()) {
      this._performanceObserver = new PerformanceObserver((list) => {
        const entry = list.getEntries()[0];
        this._chargingStation._statistics.logPerformance(entry, 'AutomaticTransactionGenerator');
        this._performanceObserver.disconnect();
      });
    }
  }

  get timeToStop() {
    return this._timeToStop;
  }

  _logPrefix(connectorId = null) {
    if (connectorId) {
      return Utils.logPrefix(' ' + this._chargingStation._stationInfo.name + ' ATG on connector #' + connectorId + ':');
    }
    return Utils.logPrefix(' ' + this._chargingStation._stationInfo.name + ' ATG:');
  }

  async start() {
    this._timeToStop = false;
    if (this._chargingStation._stationInfo.AutomaticTransactionGenerator.stopAfterHours &&
      this._chargingStation._stationInfo.AutomaticTransactionGenerator.stopAfterHours > 0) {
      setTimeout(() => {
        this.stop();
      }, this._chargingStation._stationInfo.AutomaticTransactionGenerator.stopAfterHours * 3600 * 1000);
    }
    for (const connector in this._chargingStation._connectors) {
      if (connector > 0) {
        this.startConnector(connector);
      }
    }
    logger.info(this._logPrefix() + ' ATG started and will stop in ' + Utils.secondstoHHMMSS(this._chargingStation._stationInfo.AutomaticTransactionGenerator.stopAfterHours * 3600));
  }

  async stop(reason = '') {
    logger.info(this._logPrefix() + ' ATG OVER => STOPPING ALL TRANSACTIONS');
    for (const connector in this._chargingStation._connectors) {
      if (this._chargingStation.getConnector(connector).transactionStarted) {
        logger.info(this._logPrefix(connector) + ' ATG OVER. Stop transaction ' + this._chargingStation.getConnector(connector).transactionId);
        await this._chargingStation.sendStopTransaction(this._chargingStation.getConnector(connector).transactionId, reason);
      }
    }
    this._timeToStop = true;
  }

  async startConnector(connectorId) {
    do {
      const wait = Utils.getRandomInt(this._chargingStation._stationInfo.AutomaticTransactionGenerator.maxDelayBetweenTwoTransactions,
          this._chargingStation._stationInfo.AutomaticTransactionGenerator.minDelayBetweenTwoTransactions) * 1000;
      logger.info(this._logPrefix(connectorId) + ' wait for ' + Utils.secondstoHHMMSS(wait / 1000));
      await Utils.sleep(wait);
      if (this._timeToStop) {
        logger.debug(this._logPrefix(connectorId) + ' Entered in transaction loop while a request to stop it was made');
        break;
      }
      const start = Math.random();
      let skip = 0;
      if (start < this._chargingStation._stationInfo.AutomaticTransactionGenerator.probabilityOfStart) {
        skip = 0;
        // Start transaction
        let startResponse;
        if (this._chargingStation.getEnableStatistics()) {
          const startTransaction = performance.timerify(this.startTransaction);
          this._performanceObserver.observe({entryTypes: ['function']});
          startResponse = await startTransaction(connectorId, this);
        } else {
          startResponse = await this.startTransaction(connectorId, this);
        }
        if (startResponse.idTagInfo.status !== 'Accepted') {
          logger.info(this._logPrefix(connectorId) + ' transaction rejected');
          await Utils.sleep(Constants.CHARGING_STATION_ATG_WAIT_TIME);
        } else {
          // Wait until end of transaction
          const wait = Utils.getRandomInt(this._chargingStation._stationInfo.AutomaticTransactionGenerator.maxDuration,
              this._chargingStation._stationInfo.AutomaticTransactionGenerator.minDuration) * 1000;
          logger.info(this._logPrefix(connectorId) + ' transaction ' + this._chargingStation.getConnector(connectorId).transactionId + ' will stop in ' + Utils.secondstoHHMMSS(wait / 1000));
          await Utils.sleep(wait);
          // Stop transaction
          if (this._chargingStation.getConnector(connectorId).transactionStarted) {
            logger.info(this._logPrefix(connectorId) + ' stop transaction ' + this._chargingStation.getConnector(connectorId).transactionId);
            if (this._chargingStation.getEnableStatistics()) {
              const stopTransaction = performance.timerify(this.stopTransaction);
              this._performanceObserver.observe({entryTypes: ['function']});
              await stopTransaction(connectorId, this);
            } else {
              await this.stopTransaction(connectorId, this);
            }
          }
        }
      } else {
        skip++;
        logger.info(this._logPrefix(connectorId) + ' transaction skipped ' + skip);
      }
    } while (!this._timeToStop);
    logger.info(this._logPrefix(connectorId) + ' ATG STOPPED on the connector');
  }

  // eslint-disable-next-line class-methods-use-this
  async startTransaction(connectorId, self) {
    if (self._chargingStation.hasAuthorizedTags()) {
      const tagId = self._chargingStation.getRandomTagId();
      logger.info(self._logPrefix(connectorId) + ' start transaction for tagID ' + tagId);
      return self._chargingStation.sendStartTransaction(connectorId, tagId);
    }
    return self._chargingStation.sendStartTransaction(connectorId);
  }

  // eslint-disable-next-line class-methods-use-this
  async stopTransaction(connectorId, self) {
    await self._chargingStation.sendStopTransaction(self._chargingStation.getConnector(connectorId).transactionId);
  }
}
