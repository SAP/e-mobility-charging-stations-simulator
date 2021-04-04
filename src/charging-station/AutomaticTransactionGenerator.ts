import { AuthorizationStatus, AuthorizeResponse, StartTransactionResponse, StopTransactionReason, StopTransactionResponse } from '../types/ocpp/Transaction';
import { PerformanceObserver, performance } from 'perf_hooks';

import ChargingStation from './ChargingStation';
import Constants from '../utils/Constants';
import Utils from '../utils/Utils';
import logger from '../utils/Logger';

export default class AutomaticTransactionGenerator {
  public timeToStop: boolean;
  private chargingStation: ChargingStation;
  private performanceObserver: PerformanceObserver;

  constructor(chargingStation: ChargingStation) {
    this.chargingStation = chargingStation;
    this.timeToStop = true;
    if (this.chargingStation.getEnableStatistics()) {
      this.performanceObserver = new PerformanceObserver((list) => {
        const entry = list.getEntries()[0];
        this.chargingStation.statistics.logPerformance(entry, Constants.ENTITY_AUTOMATIC_TRANSACTION_GENERATOR);
        this.performanceObserver.disconnect();
      });
    }
  }

  public async start(): Promise<void> {
    this.timeToStop = false;
    if (this.chargingStation.stationInfo.AutomaticTransactionGenerator.stopAfterHours &&
      this.chargingStation.stationInfo.AutomaticTransactionGenerator.stopAfterHours > 0) {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      setTimeout(async (): Promise<void> => {
        await this.stop();
      }, this.chargingStation.stationInfo.AutomaticTransactionGenerator.stopAfterHours * 3600 * 1000);
    }
    for (const connector in this.chargingStation.connectors) {
      if (Utils.convertToInt(connector) > 0) {
        await this.startConnector(Utils.convertToInt(connector));
      }
    }
    logger.info(this.logPrefix() + ' ATG started and will stop in ' + Utils.secondsToHHMMSS(this.chargingStation.stationInfo.AutomaticTransactionGenerator.stopAfterHours * 3600));
  }

  public async stop(reason: StopTransactionReason = StopTransactionReason.NONE): Promise<void> {
    logger.info(this.logPrefix() + ' ATG OVER => STOPPING ALL TRANSACTIONS');
    for (const connector in this.chargingStation.connectors) {
      const transactionId = this.chargingStation.getConnector(Utils.convertToInt(connector)).transactionId;
      if (this.chargingStation.getConnector(Utils.convertToInt(connector)).transactionStarted) {
        logger.info(this.logPrefix(Utils.convertToInt(connector)) + ' ATG OVER. Stop transaction ' + transactionId.toString());
        await this.chargingStation.ocppRequestService.sendStopTransaction(transactionId, this.chargingStation.getTransactionMeterStop(transactionId),
          this.chargingStation.getTransactionIdTag(transactionId), reason);
      }
    }
    this.timeToStop = true;
  }

  public async startConnector(connectorId: number): Promise<void> {
    do {
      if (this.timeToStop) {
        logger.error(this.logPrefix(connectorId) + ' Entered in transaction loop while a request to stop it was made');
        break;
      }
      if (!this.chargingStation.isRegistered()) {
        logger.error(this.logPrefix(connectorId) + ' Entered in transaction loop while the charging station is not registered');
        break;
      }
      if (!this.chargingStation.isChargingStationAvailable()) {
        logger.info(this.logPrefix(connectorId) + ' Entered in transaction loop while the charging station is unavailable');
        await this.stop();
        break;
      }
      if (!this.chargingStation.isConnectorAvailable(connectorId)) {
        logger.info(`${this.logPrefix(connectorId)} Entered in transaction loop while the connector ${connectorId} is unavailable, stop it`);
        break;
      }
      if (!this.chargingStation?.ocppRequestService) {
        logger.info(`${this.logPrefix(connectorId)} Transaction loop waiting for charging station service to be initialized`);
        do {
          await Utils.sleep(Constants.CHARGING_STATION_ATG_INITIALIZATION_TIME);
        } while (!this.chargingStation?.ocppRequestService);
      }
      const wait = Utils.getRandomInt(this.chargingStation.stationInfo.AutomaticTransactionGenerator.maxDelayBetweenTwoTransactions,
        this.chargingStation.stationInfo.AutomaticTransactionGenerator.minDelayBetweenTwoTransactions) * 1000;
      logger.info(this.logPrefix(connectorId) + ' wait for ' + Utils.milliSecondsToHHMMSS(wait));
      await Utils.sleep(wait);
      const start = Math.random();
      let skip = 0;
      if (start < this.chargingStation.stationInfo.AutomaticTransactionGenerator.probabilityOfStart) {
        skip = 0;
        // Start transaction
        let startResponse: StartTransactionResponse | AuthorizeResponse;
        if (this.chargingStation.getEnableStatistics()) {
          const startTransaction = performance.timerify(this.startTransaction);
          this.performanceObserver.observe({ entryTypes: ['function'] });
          startResponse = await startTransaction(connectorId, this);
        } else {
          startResponse = await this.startTransaction(connectorId, this);
        }
        if (startResponse?.idTagInfo?.status !== AuthorizationStatus.ACCEPTED) {
          logger.info(this.logPrefix(connectorId) + ' transaction rejected');
          await Utils.sleep(Constants.CHARGING_STATION_ATG_WAIT_TIME);
        } else {
          // Wait until end of transaction
          const waitTrxEnd = Utils.getRandomInt(this.chargingStation.stationInfo.AutomaticTransactionGenerator.maxDuration,
            this.chargingStation.stationInfo.AutomaticTransactionGenerator.minDuration) * 1000;
          logger.info(this.logPrefix(connectorId) + ' transaction ' + this.chargingStation.getConnector(connectorId).transactionId.toString() + ' will stop in ' + Utils.milliSecondsToHHMMSS(waitTrxEnd));
          await Utils.sleep(waitTrxEnd);
          // Stop transaction
          if (this.chargingStation.getConnector(connectorId)?.transactionStarted) {
            logger.info(this.logPrefix(connectorId) + ' stop transaction ' + this.chargingStation.getConnector(connectorId).transactionId.toString());
            if (this.chargingStation.getEnableStatistics()) {
              const stopTransaction = performance.timerify(this.stopTransaction);
              this.performanceObserver.observe({ entryTypes: ['function'] });
              await stopTransaction(connectorId, this);
            } else {
              await this.stopTransaction(connectorId, this);
            }
          }
        }
      } else {
        skip++;
        logger.info(this.logPrefix(connectorId) + ' transaction skipped ' + skip.toString());
      }
    } while (!this.timeToStop);
    logger.info(this.logPrefix(connectorId) + ' ATG STOPPED on the connector');
  }

  // eslint-disable-next-line consistent-this
  private async startTransaction(connectorId: number, self: AutomaticTransactionGenerator): Promise<StartTransactionResponse | AuthorizeResponse> {
    if (self.chargingStation.hasAuthorizedTags()) {
      const tagId = self.chargingStation.getRandomTagId();
      if (self.chargingStation.stationInfo.AutomaticTransactionGenerator.requireAuthorize) {
        // Authorize tagId
        const authorizeResponse = await self.chargingStation.ocppRequestService.sendAuthorize(tagId);
        if (authorizeResponse?.idTagInfo?.status === AuthorizationStatus.ACCEPTED) {
          logger.info(self.logPrefix(connectorId) + ' start transaction for tagID ' + tagId);
          // Start transaction
          return await self.chargingStation.ocppRequestService.sendStartTransaction(connectorId, tagId);
        }
        return authorizeResponse;
      }
      logger.info(self.logPrefix(connectorId) + ' start transaction for tagID ' + tagId);
      // Start transaction
      return await self.chargingStation.ocppRequestService.sendStartTransaction(connectorId, tagId);
    }
    logger.info(self.logPrefix(connectorId) + ' start transaction without a tagID');
    return await self.chargingStation.ocppRequestService.sendStartTransaction(connectorId);
  }

  // eslint-disable-next-line consistent-this
  private async stopTransaction(connectorId: number, self: AutomaticTransactionGenerator): Promise<StopTransactionResponse> {
    const transactionId = self.chargingStation.getConnector(connectorId).transactionId;
    return await self.chargingStation.ocppRequestService.sendStopTransaction(transactionId, self.chargingStation.getTransactionMeterStop(transactionId), self.chargingStation.getTransactionIdTag(transactionId));
  }

  private logPrefix(connectorId: number = null): string {
    if (connectorId) {
      return Utils.logPrefix(' ' + this.chargingStation.stationInfo.chargingStationId + ' ATG on connector #' + connectorId.toString() + ':');
    }
    return Utils.logPrefix(' ' + this.chargingStation.stationInfo.chargingStationId + ' ATG:');
  }
}
