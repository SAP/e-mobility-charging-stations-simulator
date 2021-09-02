// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import { AuthorizationStatus, AuthorizeResponse, StartTransactionResponse, StopTransactionReason, StopTransactionResponse } from '../types/ocpp/Transaction';

import ChargingStation from './ChargingStation';
import Constants from '../utils/Constants';
import PerformanceStatistics from '../performance/PerformanceStatistics';
import Utils from '../utils/Utils';
import logger from '../utils/Logger';

export default class AutomaticTransactionGenerator {
  public timeToStop: boolean;
  private chargingStation: ChargingStation;

  constructor(chargingStation: ChargingStation) {
    this.chargingStation = chargingStation;
    this.timeToStop = true;
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
        await this.chargingStation.ocppRequestService.sendStopTransaction(transactionId, this.chargingStation.getEnergyActiveImportRegisterByTransactionId(transactionId),
          this.chargingStation.getTransactionIdTag(transactionId), reason);
      }
    }
    this.timeToStop = true;
  }

  private async startConnector(connectorId: number): Promise<void> {
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
        // Start transaction
        const startResponse = await this.startTransaction(connectorId);
        if (startResponse?.idTagInfo?.status !== AuthorizationStatus.ACCEPTED) {
          logger.warn(this.logPrefix(connectorId) + ' transaction rejected');
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
            await this.stopTransaction(connectorId);
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
  private async startTransaction(connectorId: number): Promise<StartTransactionResponse | AuthorizeResponse> {
    const measureId = 'StartTransaction with ATG';
    const beginId = PerformanceStatistics.beginMeasure(measureId);
    let startResponse: StartTransactionResponse;
    if (this.chargingStation.hasAuthorizedTags()) {
      const tagId = this.chargingStation.getRandomTagId();
      if (this.chargingStation.getAutomaticTransactionGeneratorRequireAuthorize()) {
        // Authorize tagId
        const authorizeResponse = await this.chargingStation.ocppRequestService.sendAuthorize(connectorId, tagId);
        if (authorizeResponse?.idTagInfo?.status === AuthorizationStatus.ACCEPTED) {
          logger.info(this.logPrefix(connectorId) + ' start transaction for tagID ' + tagId);
          // Start transaction
          startResponse = await this.chargingStation.ocppRequestService.sendStartTransaction(connectorId, tagId);
          PerformanceStatistics.endMeasure(measureId, beginId);
          return startResponse;
        }
        PerformanceStatistics.endMeasure(measureId, beginId);
        return authorizeResponse;
      }
      logger.info(this.logPrefix(connectorId) + ' start transaction for tagID ' + tagId);
      // Start transaction
      startResponse = await this.chargingStation.ocppRequestService.sendStartTransaction(connectorId, tagId);
      PerformanceStatistics.endMeasure(measureId, beginId);
      return startResponse;
    }
    logger.info(this.logPrefix(connectorId) + ' start transaction without a tagID');
    startResponse = await this.chargingStation.ocppRequestService.sendStartTransaction(connectorId);
    PerformanceStatistics.endMeasure(measureId, beginId);
    return startResponse;
  }

  // eslint-disable-next-line consistent-this
  private async stopTransaction(connectorId: number): Promise<StopTransactionResponse> {
    const measureId = 'StopTransaction with ATG';
    const beginId = PerformanceStatistics.beginMeasure(measureId);
    const transactionId = this.chargingStation.getConnector(connectorId).transactionId;
    const stopResponse = this.chargingStation.ocppRequestService.sendStopTransaction(transactionId,
      this.chargingStation.getEnergyActiveImportRegisterByTransactionId(transactionId), this.chargingStation.getTransactionIdTag(transactionId));
    PerformanceStatistics.endMeasure(measureId, beginId);
    return stopResponse;
  }

  private logPrefix(connectorId?: number): string {
    if (connectorId) {
      return Utils.logPrefix(' ' + this.chargingStation.stationInfo.chargingStationId + ' | ATG on connector #' + connectorId.toString() + ':');
    }
    return Utils.logPrefix(' ' + this.chargingStation.stationInfo.chargingStationId + ' | ATG:');
  }
}
