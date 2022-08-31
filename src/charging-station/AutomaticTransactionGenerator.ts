// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import PerformanceStatistics from '../performance/PerformanceStatistics';
import type {
  AutomaticTransactionGeneratorConfiguration,
  Status,
} from '../types/AutomaticTransactionGenerator';
import { MeterValuesRequest, RequestCommand } from '../types/ocpp/Requests';
import type { MeterValuesResponse } from '../types/ocpp/Responses';
import {
  AuthorizationStatus,
  AuthorizeRequest,
  AuthorizeResponse,
  StartTransactionRequest,
  StartTransactionResponse,
  StopTransactionReason,
  StopTransactionRequest,
  StopTransactionResponse,
} from '../types/ocpp/Transaction';
import Constants from '../utils/Constants';
import logger from '../utils/Logger';
import Utils from '../utils/Utils';
import type ChargingStation from './ChargingStation';
import { OCPP16ServiceUtils } from './ocpp/1.6/OCPP16ServiceUtils';

export default class AutomaticTransactionGenerator {
  private static readonly instances: Map<string, AutomaticTransactionGenerator> = new Map<
    string,
    AutomaticTransactionGenerator
  >();

  public readonly configuration: AutomaticTransactionGeneratorConfiguration;
  public started: boolean;
  private readonly chargingStation: ChargingStation;
  private readonly connectorsStatus: Map<number, Status>;

  private constructor(
    automaticTransactionGeneratorConfiguration: AutomaticTransactionGeneratorConfiguration,
    chargingStation: ChargingStation
  ) {
    this.configuration = automaticTransactionGeneratorConfiguration;
    this.chargingStation = chargingStation;
    this.connectorsStatus = new Map<number, Status>();
    this.stopConnectors();
    this.started = false;
  }

  public static getInstance(
    automaticTransactionGeneratorConfiguration: AutomaticTransactionGeneratorConfiguration,
    chargingStation: ChargingStation
  ): AutomaticTransactionGenerator {
    if (!AutomaticTransactionGenerator.instances.has(chargingStation.stationInfo.hashId)) {
      AutomaticTransactionGenerator.instances.set(
        chargingStation.stationInfo.hashId,
        new AutomaticTransactionGenerator(
          automaticTransactionGeneratorConfiguration,
          chargingStation
        )
      );
    }
    return AutomaticTransactionGenerator.instances.get(chargingStation.stationInfo.hashId);
  }

  public start(): void {
    if (this.started === true) {
      logger.warn(`${this.logPrefix()} trying to start while already started`);
      return;
    }
    this.startConnectors();
    this.started = true;
  }

  public stop(): void {
    if (this.started === false) {
      logger.warn(`${this.logPrefix()} trying to stop while not started`);
      return;
    }
    this.stopConnectors();
    this.started = false;
  }

  public startConnector(connectorId: number): void {
    if (this.chargingStation.connectors.has(connectorId) === false) {
      logger.warn(`${this.logPrefix(connectorId)} trying to start on non existing connector`);
      return;
    }
    if (this.connectorsStatus.get(connectorId)?.start === false) {
      // Avoid hogging the event loop with a busy loop
      setImmediate(() => {
        this.internalStartConnector(connectorId).catch(() => {
          /* This is intentional */
        });
      });
    } else if (this.connectorsStatus.get(connectorId)?.start === true) {
      logger.warn(`${this.logPrefix(connectorId)} already started on connector`);
    }
  }

  public stopConnector(connectorId: number): void {
    this.connectorsStatus.set(connectorId, {
      ...this.connectorsStatus.get(connectorId),
      start: false,
    });
  }

  private startConnectors(): void {
    if (
      this.connectorsStatus?.size > 0 &&
      this.connectorsStatus.size !== this.chargingStation.getNumberOfConnectors()
    ) {
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
    this.initializeConnectorStatus(connectorId);
    logger.info(
      this.logPrefix(connectorId) +
        ' started on connector and will run for ' +
        Utils.formatDurationMilliSeconds(
          this.connectorsStatus.get(connectorId).stopDate.getTime() -
            this.connectorsStatus.get(connectorId).startDate.getTime()
        )
    );
    while (this.connectorsStatus.get(connectorId).start === true) {
      if (new Date() > this.connectorsStatus.get(connectorId).stopDate) {
        this.stopConnector(connectorId);
        break;
      }
      if (!this.chargingStation.isInAcceptedState()) {
        logger.error(
          this.logPrefix(connectorId) +
            ' entered in transaction loop while the charging station is not in accepted state'
        );
        this.stopConnector(connectorId);
        break;
      }
      if (!this.chargingStation.isChargingStationAvailable()) {
        logger.info(
          this.logPrefix(connectorId) +
            ' entered in transaction loop while the charging station is unavailable'
        );
        this.stopConnector(connectorId);
        break;
      }
      if (!this.chargingStation.isConnectorAvailable(connectorId)) {
        logger.info(
          `${this.logPrefix(
            connectorId
          )} entered in transaction loop while the connector ${connectorId} is unavailable`
        );
        this.stopConnector(connectorId);
        break;
      }
      if (!this.chargingStation?.ocppRequestService) {
        logger.info(
          `${this.logPrefix(
            connectorId
          )} transaction loop waiting for charging station service to be initialized`
        );
        do {
          await Utils.sleep(Constants.CHARGING_STATION_ATG_INITIALIZATION_TIME);
        } while (!this.chargingStation?.ocppRequestService);
      }
      const wait =
        Utils.getRandomInteger(
          this.configuration.maxDelayBetweenTwoTransactions,
          this.configuration.minDelayBetweenTwoTransactions
        ) * 1000;
      logger.info(
        this.logPrefix(connectorId) + ' waiting for ' + Utils.formatDurationMilliSeconds(wait)
      );
      await Utils.sleep(wait);
      const start = Utils.secureRandom();
      if (start < this.configuration.probabilityOfStart) {
        this.connectorsStatus.get(connectorId).skippedConsecutiveTransactions = 0;
        // Start transaction
        const startResponse = await this.startTransaction(connectorId);
        this.connectorsStatus.get(connectorId).startTransactionRequests++;
        if (startResponse?.idTagInfo?.status !== AuthorizationStatus.ACCEPTED) {
          logger.warn(this.logPrefix(connectorId) + ' start transaction rejected');
          this.connectorsStatus.get(connectorId).rejectedStartTransactionRequests++;
        } else {
          // Wait until end of transaction
          const waitTrxEnd =
            Utils.getRandomInteger(this.configuration.maxDuration, this.configuration.minDuration) *
            1000;
          logger.info(
            this.logPrefix(connectorId) +
              ' transaction ' +
              this.chargingStation.getConnectorStatus(connectorId).transactionId.toString() +
              ' started and will stop in ' +
              Utils.formatDurationMilliSeconds(waitTrxEnd)
          );
          this.connectorsStatus.get(connectorId).acceptedStartTransactionRequests++;
          await Utils.sleep(waitTrxEnd);
          // Stop transaction
          logger.info(
            this.logPrefix(connectorId) +
              ' stop transaction ' +
              this.chargingStation.getConnectorStatus(connectorId).transactionId.toString()
          );
          await this.stopTransaction(connectorId);
        }
      } else {
        this.connectorsStatus.get(connectorId).skippedConsecutiveTransactions++;
        this.connectorsStatus.get(connectorId).skippedTransactions++;
        logger.info(
          this.logPrefix(connectorId) +
            ' skipped consecutively ' +
            this.connectorsStatus.get(connectorId).skippedConsecutiveTransactions.toString() +
            '/' +
            this.connectorsStatus.get(connectorId).skippedTransactions.toString() +
            ' transaction(s)'
        );
      }
      this.connectorsStatus.get(connectorId).lastRunDate = new Date();
    }
    await this.stopTransaction(connectorId);
    this.connectorsStatus.get(connectorId).stoppedDate = new Date();
    logger.info(
      this.logPrefix(connectorId) +
        ' stopped on connector and lasted for ' +
        Utils.formatDurationMilliSeconds(
          this.connectorsStatus.get(connectorId).stoppedDate.getTime() -
            this.connectorsStatus.get(connectorId).startDate.getTime()
        )
    );
    logger.debug(
      `${this.logPrefix(connectorId)} connector status: %j`,
      this.connectorsStatus.get(connectorId)
    );
  }

  private initializeConnectorStatus(connectorId: number): void {
    this.connectorsStatus.get(connectorId).authorizeRequests =
      this?.connectorsStatus.get(connectorId)?.authorizeRequests ?? 0;
    this.connectorsStatus.get(connectorId).acceptedAuthorizeRequests =
      this?.connectorsStatus.get(connectorId)?.acceptedAuthorizeRequests ?? 0;
    this.connectorsStatus.get(connectorId).rejectedAuthorizeRequests =
      this?.connectorsStatus.get(connectorId)?.rejectedAuthorizeRequests ?? 0;
    this.connectorsStatus.get(connectorId).startTransactionRequests =
      this?.connectorsStatus.get(connectorId)?.startTransactionRequests ?? 0;
    this.connectorsStatus.get(connectorId).acceptedStartTransactionRequests =
      this?.connectorsStatus.get(connectorId)?.acceptedStartTransactionRequests ?? 0;
    this.connectorsStatus.get(connectorId).rejectedStartTransactionRequests =
      this?.connectorsStatus.get(connectorId)?.rejectedStartTransactionRequests ?? 0;
    this.connectorsStatus.get(connectorId).stopTransactionRequests =
      this?.connectorsStatus.get(connectorId)?.stopTransactionRequests ?? 0;
    this.connectorsStatus.get(connectorId).skippedConsecutiveTransactions = 0;
    this.connectorsStatus.get(connectorId).skippedTransactions =
      this?.connectorsStatus.get(connectorId)?.skippedTransactions ?? 0;
    const previousRunDuration =
      this?.connectorsStatus.get(connectorId)?.startDate &&
      this?.connectorsStatus.get(connectorId)?.lastRunDate
        ? this.connectorsStatus.get(connectorId).lastRunDate.getTime() -
          this.connectorsStatus.get(connectorId).startDate.getTime()
        : 0;
    this.connectorsStatus.get(connectorId).startDate = new Date();
    this.connectorsStatus.get(connectorId).stopDate = new Date(
      this.connectorsStatus.get(connectorId).startDate.getTime() +
        (this.configuration.stopAfterHours ??
          Constants.CHARGING_STATION_ATG_DEFAULT_STOP_AFTER_HOURS) *
          3600 *
          1000 -
        previousRunDuration
    );
    this.connectorsStatus.get(connectorId).start = true;
  }

  private async startTransaction(
    connectorId: number
  ): Promise<StartTransactionResponse | AuthorizeResponse> {
    const measureId = 'StartTransaction with ATG';
    const beginId = PerformanceStatistics.beginMeasure(measureId);
    let startResponse: StartTransactionResponse;
    if (this.chargingStation.hasAuthorizedTags()) {
      const idTag = this.chargingStation.getRandomIdTag();
      const startTransactionLogMsg = `${this.logPrefix(
        connectorId
      )} start transaction for idTag '${idTag}'`;
      if (this.getRequireAuthorize()) {
        this.chargingStation.getConnectorStatus(connectorId).authorizeIdTag = idTag;
        // Authorize idTag
        const authorizeResponse: AuthorizeResponse =
          await this.chargingStation.ocppRequestService.requestHandler<
            AuthorizeRequest,
            AuthorizeResponse
          >(this.chargingStation, RequestCommand.AUTHORIZE, {
            idTag,
          });
        this.connectorsStatus.get(connectorId).authorizeRequests++;
        if (authorizeResponse?.idTagInfo?.status === AuthorizationStatus.ACCEPTED) {
          this.connectorsStatus.get(connectorId).acceptedAuthorizeRequests++;
          logger.info(startTransactionLogMsg);
          // Start transaction
          startResponse = await this.chargingStation.ocppRequestService.requestHandler<
            StartTransactionRequest,
            StartTransactionResponse
          >(this.chargingStation, RequestCommand.START_TRANSACTION, {
            connectorId,
            idTag,
          });
          PerformanceStatistics.endMeasure(measureId, beginId);
          return startResponse;
        }
        this.connectorsStatus.get(connectorId).rejectedAuthorizeRequests++;
        PerformanceStatistics.endMeasure(measureId, beginId);
        return authorizeResponse;
      }
      logger.info(startTransactionLogMsg);
      // Start transaction
      startResponse = await this.chargingStation.ocppRequestService.requestHandler<
        StartTransactionRequest,
        StartTransactionResponse
      >(this.chargingStation, RequestCommand.START_TRANSACTION, {
        connectorId,
        idTag,
      });
      PerformanceStatistics.endMeasure(measureId, beginId);
      return startResponse;
    }
    logger.info(`${this.logPrefix(connectorId)} start transaction without an idTag`);
    startResponse = await this.chargingStation.ocppRequestService.requestHandler<
      StartTransactionRequest,
      StartTransactionResponse
    >(this.chargingStation, RequestCommand.START_TRANSACTION, { connectorId });
    PerformanceStatistics.endMeasure(measureId, beginId);
    return startResponse;
  }

  private async stopTransaction(
    connectorId: number,
    reason: StopTransactionReason = StopTransactionReason.NONE
  ): Promise<StopTransactionResponse> {
    const measureId = 'StopTransaction with ATG';
    const beginId = PerformanceStatistics.beginMeasure(measureId);
    let transactionId = 0;
    let stopResponse: StopTransactionResponse;
    if (this.chargingStation.getConnectorStatus(connectorId)?.transactionStarted) {
      transactionId = this.chargingStation.getConnectorStatus(connectorId).transactionId;
      if (
        this.chargingStation.getBeginEndMeterValues() &&
        this.chargingStation.getOcppStrictCompliance() &&
        !this.chargingStation.getOutOfOrderEndMeterValues()
      ) {
        // FIXME: Implement OCPP version agnostic helpers
        const transactionEndMeterValue = OCPP16ServiceUtils.buildTransactionEndMeterValue(
          this.chargingStation,
          connectorId,
          this.chargingStation.getEnergyActiveImportRegisterByTransactionId(transactionId)
        );
        await this.chargingStation.ocppRequestService.requestHandler<
          MeterValuesRequest,
          MeterValuesResponse
        >(this.chargingStation, RequestCommand.METER_VALUES, {
          connectorId,
          transactionId,
          meterValue: [transactionEndMeterValue],
        });
      }
      stopResponse = await this.chargingStation.ocppRequestService.requestHandler<
        StopTransactionRequest,
        StopTransactionResponse
      >(this.chargingStation, RequestCommand.STOP_TRANSACTION, {
        transactionId,
        meterStop: this.chargingStation.getEnergyActiveImportRegisterByTransactionId(
          transactionId,
          true
        ),
        idTag: this.chargingStation.getTransactionIdTag(transactionId),
        reason,
      });
      this.connectorsStatus.get(connectorId).stopTransactionRequests++;
    } else {
      logger.warn(
        `${this.logPrefix(connectorId)} trying to stop a not started transaction${
          transactionId ? ' ' + transactionId.toString() : ''
        }`
      );
    }
    PerformanceStatistics.endMeasure(measureId, beginId);
    return stopResponse;
  }

  private getRequireAuthorize(): boolean {
    return this.configuration?.requireAuthorize ?? true;
  }

  private logPrefix(connectorId?: number): string {
    return Utils.logPrefix(
      ` ${this.chargingStation.stationInfo.chargingStationId} | ATG${
        connectorId !== undefined ? ` on connector #${connectorId.toString()}` : ''
      }:`
    );
  }
}
