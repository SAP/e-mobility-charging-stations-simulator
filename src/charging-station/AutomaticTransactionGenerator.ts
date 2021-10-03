// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import { AuthorizationStatus, AuthorizeResponse, StartTransactionResponse, StopTransactionReason, StopTransactionResponse } from '../types/ocpp/Transaction';

import ChargingStation from './ChargingStation';
import Constants from '../utils/Constants';
import PerformanceStatistics from '../performance/PerformanceStatistics';
import { Status } from '../types/AutomaticTransactionGenerator';
import Utils from '../utils/Utils';
import logger from '../utils/Logger';

export default class AutomaticTransactionGenerator {
  public started: boolean;
  private readonly chargingStation: ChargingStation;
  private readonly connectorsStatus: Map<number, Status>;

  constructor(chargingStation: ChargingStation) {
    this.chargingStation = chargingStation;
    this.connectorsStatus = new Map<number, Status>();
    this.stopConnectors();
    this.started = false;
  }

  public start(): void {
    if (this.started) {
      logger.error(`${this.logPrefix()} trying to start while already started`);
      return;
    }
    this.startConnectors();
    this.started = true;
  }

  public stop(): void {
    if (!this.started) {
      logger.error(`${this.logPrefix()} trying to stop while not started`);
      return;
    }
    this.stopConnectors();
    this.started = false;
  }

  private startConnectors(): void {
    if (this.connectorsStatus?.size > 0 && this.connectorsStatus.size !== this.chargingStation.getNumberOfConnectors()) {
      this.connectorsStatus.clear();
    }
    for (const connectorId of this.chargingStation.connectors.keys()) {
      if (connectorId > 0) {
        this.startConnector(connectorId);
      }
    }
  }

  private stopConnectors(): void {
    for (const connectorId of this.chargingStation.connectors.keys()) {
      if (connectorId > 0) {
        this.stopConnector(connectorId);
      }
    }
  }

  private async internalStartConnector(connectorId: number): Promise<void> {
    this.initStartConnectorStatus(connectorId);
    logger.info(this.logPrefix(connectorId) + ' started on connector and will run for ' + Utils.formatDurationMilliSeconds(this.connectorsStatus.get(connectorId).stopDate.getTime() - this.connectorsStatus.get(connectorId).startDate.getTime()));
    while (this.connectorsStatus.get(connectorId).start) {
      if ((new Date()) > this.connectorsStatus.get(connectorId).stopDate) {
        this.stopConnector(connectorId);
        break;
      }
      if (!this.chargingStation.isRegistered()) {
        logger.error(this.logPrefix(connectorId) + ' entered in transaction loop while the charging station is not registered');
        this.stopConnector(connectorId);
        break;
      }
      if (!this.chargingStation.isChargingStationAvailable()) {
        logger.info(this.logPrefix(connectorId) + ' entered in transaction loop while the charging station is unavailable');
        this.stopConnector(connectorId);
        break;
      }
      if (!this.chargingStation.isConnectorAvailable(connectorId)) {
        logger.info(`${this.logPrefix(connectorId)} entered in transaction loop while the connector ${connectorId} is unavailable`);
        this.stopConnector(connectorId);
        break;
      }
      if (!this.chargingStation?.ocppRequestService) {
        logger.info(`${this.logPrefix(connectorId)} transaction loop waiting for charging station service to be initialized`);
        do {
          await Utils.sleep(Constants.CHARGING_STATION_ATG_INITIALIZATION_TIME);
        } while (!this.chargingStation?.ocppRequestService);
      }
      const wait = Utils.getRandomInteger(this.chargingStation.stationInfo.AutomaticTransactionGenerator.maxDelayBetweenTwoTransactions,
        this.chargingStation.stationInfo.AutomaticTransactionGenerator.minDelayBetweenTwoTransactions) * 1000;
      logger.info(this.logPrefix(connectorId) + ' waiting for ' + Utils.formatDurationMilliSeconds(wait));
      await Utils.sleep(wait);
      const start = Utils.secureRandom();
      if (start < this.chargingStation.stationInfo.AutomaticTransactionGenerator.probabilityOfStart) {
        this.connectorsStatus.get(connectorId).skippedConsecutiveTransactions = 0;
        // Start transaction
        const startResponse = await this.startTransaction(connectorId);
        this.connectorsStatus.get(connectorId).startTransactionRequests++;
        if (startResponse?.idTagInfo?.status !== AuthorizationStatus.ACCEPTED) {
          logger.warn(this.logPrefix(connectorId) + ' start transaction rejected');
          this.connectorsStatus.get(connectorId).rejectedStartTransactionRequests++;
        } else {
          // Wait until end of transaction
          const waitTrxEnd = Utils.getRandomInteger(this.chargingStation.stationInfo.AutomaticTransactionGenerator.maxDuration,
            this.chargingStation.stationInfo.AutomaticTransactionGenerator.minDuration) * 1000;
          logger.info(this.logPrefix(connectorId) + ' transaction ' + this.chargingStation.getConnectorStatus(connectorId).transactionId.toString() + ' started and will stop in ' + Utils.formatDurationMilliSeconds(waitTrxEnd));
          this.connectorsStatus.get(connectorId).acceptedStartTransactionRequests++;
          await Utils.sleep(waitTrxEnd);
          // Stop transaction
          logger.info(this.logPrefix(connectorId) + ' stop transaction ' + this.chargingStation.getConnectorStatus(connectorId).transactionId.toString());
          await this.stopTransaction(connectorId);
        }
      } else {
        this.connectorsStatus.get(connectorId).skippedConsecutiveTransactions++;
        this.connectorsStatus.get(connectorId).skippedTransactions++;
        logger.info(this.logPrefix(connectorId) + ' skipped consecutively ' + this.connectorsStatus.get(connectorId).skippedConsecutiveTransactions.toString() + '/' + this.connectorsStatus.get(connectorId).skippedTransactions.toString() + ' transaction(s)');
      }
      this.connectorsStatus.get(connectorId).lastRunDate = new Date();
    }
    await this.stopTransaction(connectorId);
    this.connectorsStatus.get(connectorId).stoppedDate = new Date();
    logger.info(this.logPrefix(connectorId) + ' stopped on connector and lasted for ' + Utils.formatDurationMilliSeconds(this.connectorsStatus.get(connectorId).stoppedDate.getTime() - this.connectorsStatus.get(connectorId).startDate.getTime()));
    logger.debug(`${this.logPrefix(connectorId)} connector status %j`, this.connectorsStatus.get(connectorId));
  }

  private startConnector(connectorId: number): void {
    // Avoid hogging the event loop with a busy loop
    setImmediate(() => {
      this.internalStartConnector(connectorId).catch(() => { /* This is intentional */ });
    });
  }

  private stopConnector(connectorId: number): void {
    this.connectorsStatus.set(connectorId, { ...this.connectorsStatus.get(connectorId), start: false });
  }

  private initStartConnectorStatus(connectorId: number): void {
    this.connectorsStatus.get(connectorId).authorizeRequests = this?.connectorsStatus.get(connectorId)?.authorizeRequests ?? 0;
    this.connectorsStatus.get(connectorId).acceptedAuthorizeRequests = this?.connectorsStatus.get(connectorId)?.acceptedAuthorizeRequests ?? 0;
    this.connectorsStatus.get(connectorId).rejectedAuthorizeRequests = this?.connectorsStatus.get(connectorId)?.rejectedAuthorizeRequests ?? 0;
    this.connectorsStatus.get(connectorId).startTransactionRequests = this?.connectorsStatus.get(connectorId)?.startTransactionRequests ?? 0;
    this.connectorsStatus.get(connectorId).acceptedStartTransactionRequests = this?.connectorsStatus.get(connectorId)?.acceptedStartTransactionRequests ?? 0;
    this.connectorsStatus.get(connectorId).rejectedStartTransactionRequests = this?.connectorsStatus.get(connectorId)?.rejectedStartTransactionRequests ?? 0;
    this.connectorsStatus.get(connectorId).stopTransactionRequests = this?.connectorsStatus.get(connectorId)?.stopTransactionRequests ?? 0;
    this.connectorsStatus.get(connectorId).skippedConsecutiveTransactions = 0;
    this.connectorsStatus.get(connectorId).skippedTransactions = this?.connectorsStatus.get(connectorId)?.skippedTransactions ?? 0;
    const previousRunDuration = (this?.connectorsStatus.get(connectorId)?.startDate && this?.connectorsStatus.get(connectorId)?.lastRunDate)
      ? (this.connectorsStatus.get(connectorId).lastRunDate.getTime() - this.connectorsStatus.get(connectorId).startDate.getTime())
      : 0;
    this.connectorsStatus.get(connectorId).startDate = new Date();
    this.connectorsStatus.get(connectorId).stopDate = new Date(this.connectorsStatus.get(connectorId).startDate.getTime()
      + (this.chargingStation.stationInfo?.AutomaticTransactionGenerator?.stopAfterHours ?? Constants.CHARGING_STATION_ATG_DEFAULT_STOP_AFTER_HOURS) * 3600 * 1000
      - previousRunDuration);
    this.connectorsStatus.get(connectorId).start = true;
  }

  private async startTransaction(connectorId: number): Promise<StartTransactionResponse | AuthorizeResponse> {
    const measureId = 'StartTransaction with ATG';
    const beginId = PerformanceStatistics.beginMeasure(measureId);
    let startResponse: StartTransactionResponse;
    if (this.chargingStation.hasAuthorizedTags()) {
      const idTag = this.chargingStation.getRandomIdTag();
      if (this.chargingStation.getAutomaticTransactionGeneratorRequireAuthorize()) {
        // Authorize idTag
        const authorizeResponse = await this.chargingStation.ocppRequestService.sendAuthorize(connectorId, idTag);
        this.connectorsStatus.get(connectorId).authorizeRequests++;
        if (authorizeResponse?.idTagInfo?.status === AuthorizationStatus.ACCEPTED) {
          this.connectorsStatus.get(connectorId).acceptedAuthorizeRequests++;
          logger.info(this.logPrefix(connectorId) + ' start transaction for idTag ' + idTag);
          // Start transaction
          startResponse = await this.chargingStation.ocppRequestService.sendStartTransaction(connectorId, idTag);
          PerformanceStatistics.endMeasure(measureId, beginId);
          return startResponse;
        }
        this.connectorsStatus.get(connectorId).rejectedAuthorizeRequests++;
        PerformanceStatistics.endMeasure(measureId, beginId);
        return authorizeResponse;
      }
      logger.info(this.logPrefix(connectorId) + ' start transaction for idTag ' + idTag);
      // Start transaction
      startResponse = await this.chargingStation.ocppRequestService.sendStartTransaction(connectorId, idTag);
      PerformanceStatistics.endMeasure(measureId, beginId);
      return startResponse;
    }
    logger.info(this.logPrefix(connectorId) + ' start transaction without an idTag');
    startResponse = await this.chargingStation.ocppRequestService.sendStartTransaction(connectorId);
    PerformanceStatistics.endMeasure(measureId, beginId);
    return startResponse;
  }

  private async stopTransaction(connectorId: number, reason: StopTransactionReason = StopTransactionReason.NONE): Promise<StopTransactionResponse> {
    const measureId = 'StopTransaction with ATG';
    const beginId = PerformanceStatistics.beginMeasure(measureId);
    let transactionId = 0;
    let stopResponse: StopTransactionResponse;
    if (this.chargingStation.getConnectorStatus(connectorId)?.transactionStarted) {
      transactionId = this.chargingStation.getConnectorStatus(connectorId).transactionId;
      stopResponse = await this.chargingStation.ocppRequestService.sendStopTransaction(transactionId,
        this.chargingStation.getEnergyActiveImportRegisterByTransactionId(transactionId),
        this.chargingStation.getTransactionIdTag(transactionId),
        reason);
      this.connectorsStatus.get(connectorId).stopTransactionRequests++;
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
