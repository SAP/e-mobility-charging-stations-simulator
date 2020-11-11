import { AuthorizationStatus, StartTransactionResponse, StopTransactionReason, StopTransactionResponse } from '../types/Transaction';
import { PerformanceObserver, performance } from 'perf_hooks';

import ChargingStation from './ChargingStation';
import Constants from '../utils/Constants';
import Utils from '../utils/Utils';
import logger from '../utils/Logger';

export default class AutomaticTransactionGenerator {
  private _chargingStation: ChargingStation;
  private _timeToStop: boolean;
  private _performanceObserver: PerformanceObserver;

  constructor(chargingStation: ChargingStation) {
    this._chargingStation = chargingStation;
    this._timeToStop = true;
    if (this._chargingStation.getEnableStatistics()) {
      this._performanceObserver = new PerformanceObserver((list) => {
        const entry = list.getEntries()[0];
        this._chargingStation.statistics.logPerformance(entry, Constants.ENTITY_AUTOMATIC_TRANSACTION_GENERATOR);
        this._performanceObserver.disconnect();
      });
    }
  }

  get timeToStop(): boolean {
    return this._timeToStop;
  }

  _logPrefix(connectorId: number = null): string {
    if (connectorId) {
      return Utils.logPrefix(' ' + this._chargingStation.stationInfo.name + ' ATG on connector #' + connectorId.toString() + ':');
    }
    return Utils.logPrefix(' ' + this._chargingStation.stationInfo.name + ' ATG:');
  }

  start(): void {
    this._timeToStop = false;
    if (this._chargingStation.stationInfo.AutomaticTransactionGenerator.stopAfterHours &&
      this._chargingStation.stationInfo.AutomaticTransactionGenerator.stopAfterHours > 0) {
      setTimeout(() => {
        this.stop();
      }, this._chargingStation.stationInfo.AutomaticTransactionGenerator.stopAfterHours * 3600 * 1000);
    }
    for (const connector in this._chargingStation.connectors) {
      if (Utils.convertToInt(connector) > 0) {
        this.startConnector(Utils.convertToInt(connector));
      }
    }
    logger.info(this._logPrefix() + ' ATG started and will stop in ' + Utils.secondsToHHMMSS(this._chargingStation.stationInfo.AutomaticTransactionGenerator.stopAfterHours * 3600));
  }

  async stop(reason: StopTransactionReason = StopTransactionReason.NONE): Promise<void> {
    logger.info(this._logPrefix() + ' ATG OVER => STOPPING ALL TRANSACTIONS');
    for (const connector in this._chargingStation.connectors) {
      if (this._chargingStation.getConnector(Utils.convertToInt(connector)).transactionStarted) {
        logger.info(this._logPrefix(Utils.convertToInt(connector)) + ' ATG OVER. Stop transaction ' + this._chargingStation.getConnector(Utils.convertToInt(connector)).transactionId.toString());
        await this._chargingStation.sendStopTransaction(this._chargingStation.getConnector(Utils.convertToInt(connector)).transactionId, reason);
      }
    }
    this._timeToStop = true;
  }

  async startConnector(connectorId: number): Promise<void> {
    do {
      const wait = Utils.getRandomInt(this._chargingStation.stationInfo.AutomaticTransactionGenerator.maxDelayBetweenTwoTransactions,
        this._chargingStation.stationInfo.AutomaticTransactionGenerator.minDelayBetweenTwoTransactions) * 1000;
      logger.info(this._logPrefix(connectorId) + ' wait for ' + Utils.milliSecondsToHHMMSS(wait));
      await Utils.sleep(wait);
      if (this._timeToStop) {
        logger.debug(this._logPrefix(connectorId) + ' Entered in transaction loop while a request to stop it was made');
        break;
      }
      const start = Math.random();
      let skip = 0;
      if (start < this._chargingStation.stationInfo.AutomaticTransactionGenerator.probabilityOfStart) {
        skip = 0;
        // Start transaction
        let startResponse: StartTransactionResponse;
        if (this._chargingStation.getEnableStatistics()) {
          const startTransaction = performance.timerify(this.startTransaction);
          this._performanceObserver.observe({ entryTypes: ['function'] });
          startResponse = await startTransaction(connectorId, this);
        } else {
          startResponse = await this.startTransaction(connectorId, this);
        }
        if (startResponse.idTagInfo?.status !== AuthorizationStatus.ACCEPTED) {
          logger.info(this._logPrefix(connectorId) + ' transaction rejected');
          await Utils.sleep(Constants.CHARGING_STATION_ATG_WAIT_TIME);
        } else {
          // Wait until end of transaction
          const waitTrxEnd = Utils.getRandomInt(this._chargingStation.stationInfo.AutomaticTransactionGenerator.maxDuration,
            this._chargingStation.stationInfo.AutomaticTransactionGenerator.minDuration) * 1000;
          logger.info(this._logPrefix(connectorId) + ' transaction ' + this._chargingStation.getConnector(connectorId).transactionId.toString() + ' will stop in ' + Utils.milliSecondsToHHMMSS(waitTrxEnd));
          await Utils.sleep(waitTrxEnd);
          // Stop transaction
          if (this._chargingStation.getConnector(connectorId).transactionStarted) {
            logger.info(this._logPrefix(connectorId) + ' stop transaction ' + this._chargingStation.getConnector(connectorId).transactionId.toString());
            if (this._chargingStation.getEnableStatistics()) {
              const stopTransaction = performance.timerify(this.stopTransaction);
              this._performanceObserver.observe({ entryTypes: ['function'] });
              await stopTransaction(connectorId, this);
            } else {
              await this.stopTransaction(connectorId, this);
            }
          }
        }
      } else {
        skip++;
        logger.info(this._logPrefix(connectorId) + ' transaction skipped ' + skip.toString());
      }
    } while (!this._timeToStop);
    logger.info(this._logPrefix(connectorId) + ' ATG STOPPED on the connector');
  }

  // eslint-disable-next-line consistent-this
  async startTransaction(connectorId: number, self: AutomaticTransactionGenerator): Promise<StartTransactionResponse> {
    if (self._chargingStation.hasAuthorizedTags()) {
      const tagId = self._chargingStation.getRandomTagId();
      logger.info(self._logPrefix(connectorId) + ' start transaction for tagID ' + tagId);
      return await self._chargingStation.sendStartTransaction(connectorId, tagId);
    }
    logger.info(self._logPrefix(connectorId) + ' start transaction without a tagID');
    return await self._chargingStation.sendStartTransaction(connectorId);
  }

  // eslint-disable-next-line consistent-this
  async stopTransaction(connectorId: number, self: AutomaticTransactionGenerator): Promise<StopTransactionResponse> {
    return await self._chargingStation.sendStopTransaction(self._chargingStation.getConnector(connectorId).transactionId);
  }
}
