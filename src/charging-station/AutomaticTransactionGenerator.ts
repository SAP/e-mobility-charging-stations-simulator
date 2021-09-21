// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import { AuthorizationStatus, AuthorizeResponse, StartTransactionResponse, StopTransactionReason, StopTransactionResponse } from '../types/ocpp/Transaction';

import ChargingStation from './ChargingStation';
import Constants from '../utils/Constants';
import PerformanceStatistics from '../performance/PerformanceStatistics';
import Utils from '../utils/Utils';
import logger from '../utils/Logger';

export default class AutomaticTransactionGenerator {
  public started: boolean;
  private startDate!: Date;
  private lastRunDate!: Date;
  private stopDate!: Date;
  private chargingStation: ChargingStation;

  constructor(chargingStation: ChargingStation) {
    this.chargingStation = chargingStation;
    this.started = false;
  }

  public start(): void {
    const previousRunDuration = (this?.startDate && this?.lastRunDate) ? (this.lastRunDate.getTime() - this.startDate.getTime()) : 0;
    this.startDate = new Date();
    this.lastRunDate = this.startDate;
    this.stopDate = new Date(this.startDate.getTime()
      + (this.chargingStation.stationInfo?.AutomaticTransactionGenerator?.stopAfterHours ?? Constants.CHARGING_STATION_ATG_DEFAULT_STOP_AFTER_HOURS) * 3600 * 1000
      - previousRunDuration);
    this.started = true;
    for (const connector in this.chargingStation.connectors) {
      if (Utils.convertToInt(connector) > 0) {
        // Avoid hogging the event loop with a busy loop
        setImmediate(() => {
          this.startOnConnector(Utils.convertToInt(connector)).catch(() => { /* This is intentional */ });
        });
      }
    }
    logger.info(this.logPrefix() + ' started and will run for ' + Utils.formatDurationMilliSeconds(this.stopDate.getTime() - this.startDate.getTime()));
  }

  public stop(): void {
    if (!this.started) {
      logger.error(`${this.logPrefix()} trying to stop while not started`);
      return;
    }
    this.started = false;
    logger.info(`${this.logPrefix()} over and lasted for ${Utils.formatDurationMilliSeconds(this.lastRunDate.getTime() - this.startDate.getTime())}. Stopping all transactions`);
  }

  private async startOnConnector(connectorId: number): Promise<void> {
    logger.info(this.logPrefix(connectorId) + ' started on connector');
    let skippedTransactions = 0;
    let skippedTransactionsTotal = 0;
    while (this.started) {
      if ((new Date()) > this.stopDate) {
        this.stop();
        break;
      }
      if (!this.chargingStation.isRegistered()) {
        logger.error(this.logPrefix(connectorId) + ' Entered in transaction loop while the charging station is not registered');
        break;
      }
      if (!this.chargingStation.isChargingStationAvailable()) {
        logger.info(this.logPrefix(connectorId) + ' Entered in transaction loop while the charging station is unavailable');
        this.stop();
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
      logger.info(this.logPrefix(connectorId) + ' waiting for ' + Utils.formatDurationMilliSeconds(wait));
      await Utils.sleep(wait);
      const start = Utils.secureRandom();
      if (start < this.chargingStation.stationInfo.AutomaticTransactionGenerator.probabilityOfStart) {
        skippedTransactions = 0;
        // Start transaction
        const startResponse = await this.startTransaction(connectorId);
        if (startResponse?.idTagInfo?.status !== AuthorizationStatus.ACCEPTED) {
          logger.warn(this.logPrefix(connectorId) + ' transaction rejected');
          await Utils.sleep(Constants.CHARGING_STATION_ATG_WAIT_TIME);
        } else {
          // Wait until end of transaction
          const waitTrxEnd = Utils.getRandomInt(this.chargingStation.stationInfo.AutomaticTransactionGenerator.maxDuration,
            this.chargingStation.stationInfo.AutomaticTransactionGenerator.minDuration) * 1000;
          logger.info(this.logPrefix(connectorId) + ' transaction ' + this.chargingStation.getConnector(connectorId).transactionId.toString() + ' will stop in ' + Utils.formatDurationMilliSeconds(waitTrxEnd));
          await Utils.sleep(waitTrxEnd);
          // Stop transaction
          logger.info(this.logPrefix(connectorId) + ' stop transaction ' + this.chargingStation.getConnector(connectorId).transactionId.toString());
          await this.stopTransaction(connectorId);
        }
      } else {
        skippedTransactions++;
        skippedTransactionsTotal++;
        logger.info(this.logPrefix(connectorId) + ' skipped transaction ' + skippedTransactions.toString() + '/' + skippedTransactionsTotal.toString());
      }
      this.lastRunDate = new Date();
    }
    await this.stopTransaction(connectorId);
    logger.info(this.logPrefix(connectorId) + ' stopped on connector');
  }

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

  private async stopTransaction(connectorId: number, reason: StopTransactionReason = StopTransactionReason.NONE): Promise<StopTransactionResponse> {
    const measureId = 'StopTransaction with ATG';
    const beginId = PerformanceStatistics.beginMeasure(measureId);
    let transactionId = 0;
    let stopResponse: StopTransactionResponse;
    if (this.chargingStation.getConnector(connectorId)?.transactionStarted) {
      transactionId = this.chargingStation.getConnector(connectorId).transactionId;
      stopResponse = await this.chargingStation.ocppRequestService.sendStopTransaction(transactionId,
        this.chargingStation.getEnergyActiveImportRegisterByTransactionId(transactionId),
        this.chargingStation.getTransactionIdTag(transactionId),
        reason);
    } else {
      logger.warn(`${this.logPrefix(connectorId)} trying to stop a not started transaction${transactionId ? ' ' + transactionId.toString() : ''}`);
    }
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
