// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import { hoursToMilliseconds, secondsToMilliseconds } from 'date-fns'
import { randomInt } from 'node:crypto'

import type { ChargingStation } from './ChargingStation.js'

import { BaseError } from '../exception/index.js'
import { PerformanceStatistics } from '../performance/index.js'
import {
  ChargingStationEvents,
  IdTagDistribution,
  type StartTransactionResult,
  type Status,
  StopTransactionReason,
  type StopTransactionResult,
} from '../types/index.js'
import {
  clone,
  Constants,
  convertToDate,
  formatDurationMilliSeconds,
  isEmpty,
  isValidDate,
  logger,
  logPrefix,
  secureRandom,
  sleep,
} from '../utils/index.js'
import { checkChargingStationState } from './Helpers.js'
import { IdTagsCache } from './IdTagsCache.js'
import {
  isIdTagAuthorized,
  startTransactionOnConnector,
  stopTransactionOnConnector,
} from './ocpp/index.js'

export class AutomaticTransactionGenerator {
  private static readonly instances: Map<string, AutomaticTransactionGenerator> = new Map<
    string,
    AutomaticTransactionGenerator
  >()

  public readonly connectorsStatus: Map<number, Status>
  public started: boolean

  private readonly chargingStation: ChargingStation
  private starting: boolean
  private stopping: boolean

  private constructor (chargingStation: ChargingStation) {
    this.started = false
    this.starting = false
    this.stopping = false
    this.chargingStation = chargingStation
    this.connectorsStatus = new Map<number, Status>()
    this.initializeConnectorsStatus()
  }

  public static deleteInstance (chargingStation: ChargingStation): boolean {
    const hashId = chargingStation.stationInfo?.hashId
    if (hashId == null) {
      return false
    }
    return AutomaticTransactionGenerator.instances.delete(hashId)
  }

  public static getInstance (
    chargingStation: ChargingStation
  ): AutomaticTransactionGenerator | undefined {
    const hashId = chargingStation.stationInfo?.hashId
    if (hashId == null) {
      return undefined
    }
    if (!AutomaticTransactionGenerator.instances.has(hashId)) {
      AutomaticTransactionGenerator.instances.set(
        hashId,
        new AutomaticTransactionGenerator(chargingStation)
      )
    }
    return AutomaticTransactionGenerator.instances.get(hashId)
  }

  public start (stopAbsoluteDuration?: boolean): void {
    if (!checkChargingStationState(this.chargingStation, this.logPrefix())) {
      return
    }
    if (this.started) {
      logger.warn(`${this.logPrefix()} is already started`)
      return
    }
    if (this.starting) {
      logger.warn(`${this.logPrefix()} is already starting`)
      return
    }
    this.starting = true
    this.startConnectors(stopAbsoluteDuration)
    this.started = true
    this.starting = false
  }

  public startConnector (connectorId: number, stopAbsoluteDuration?: boolean): void {
    if (!checkChargingStationState(this.chargingStation, this.logPrefix(connectorId))) {
      return
    }
    if (!this.connectorsStatus.has(connectorId)) {
      logger.error(`${this.logPrefix(connectorId)} starting on non existing connector`)
      throw new BaseError(`Connector ${connectorId.toString()} does not exist`)
    }
    if (this.connectorsStatus.get(connectorId)?.start === false) {
      this.internalStartConnector(connectorId, stopAbsoluteDuration).catch((error: unknown) =>
        logger.error(`${this.logPrefix(connectorId)} Error while starting connector:`, error)
      )
    } else if (this.connectorsStatus.get(connectorId)?.start === true) {
      logger.warn(`${this.logPrefix(connectorId)} is already started on connector`)
    }
  }

  public stop (): void {
    if (!this.started) {
      logger.warn(`${this.logPrefix()} is already stopped`)
      return
    }
    if (this.stopping) {
      logger.warn(`${this.logPrefix()} is already stopping`)
      return
    }
    this.stopping = true
    this.stopConnectors()
    this.started = false
    this.stopping = false
  }

  public stopConnector (connectorId: number): void {
    if (!this.connectorsStatus.has(connectorId)) {
      logger.error(`${this.logPrefix(connectorId)} stopping on non existing connector`)
      throw new BaseError(`Connector ${connectorId.toString()} does not exist`)
    }
    const connectorStatus = this.connectorsStatus.get(connectorId)
    if (connectorStatus?.start === true) {
      connectorStatus.start = false
    } else if (connectorStatus?.start === false) {
      logger.warn(`${this.logPrefix(connectorId)} is already stopped on connector`)
    }
  }

  private canStartConnector (connectorId: number): boolean {
    const stopDate = this.connectorsStatus.get(connectorId)?.stopDate
    if (stopDate != null && new Date() > stopDate) {
      logger.info(
        `${this.logPrefix(
          connectorId
        )} entered in transaction loop while the ATG stop date has been reached`
      )
      return false
    }
    if (!this.chargingStation.inAcceptedState()) {
      logger.error(
        `${this.logPrefix(
          connectorId
        )} entered in transaction loop while the charging station is not in accepted state`
      )
      return false
    }
    if (!this.chargingStation.isChargingStationAvailable()) {
      logger.info(
        `${this.logPrefix(
          connectorId
        )} entered in transaction loop while the charging station is unavailable`
      )
      return false
    }
    if (!this.chargingStation.isConnectorAvailable(connectorId)) {
      logger.info(
        `${this.logPrefix(
          connectorId
        )} entered in transaction loop while the connector ${connectorId.toString()} is unavailable`
      )
      return false
    }
    const connectorStatus = this.chargingStation.getConnectorStatus(connectorId)
    if (connectorStatus?.transactionStarted === true) {
      logger.info(
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `${this.logPrefix(connectorId)} entered in transaction loop while a transaction ${connectorStatus.transactionId?.toString()} is already started on connector ${connectorId.toString()}`
      )
      return false
    }
    return true
  }

  private getConnectorStatus (connectorId: number): Status {
    const statusIndex = connectorId - 1
    if (statusIndex < 0) {
      logger.error(`${this.logPrefix(connectorId)} invalid connector id`)
      throw new BaseError(`Invalid connector id ${connectorId.toString()}`)
    }
    let connectorStatus: Status | undefined
    const statusEntry =
      this.chargingStation.getAutomaticTransactionGeneratorStatuses()?.[statusIndex]
    if (statusEntry != null) {
      connectorStatus = clone(statusEntry)
    } else {
      logger.warn(
        `${this.logPrefix(
          connectorId
        )} no status found for connector #${connectorId.toString()} in charging station configuration file. New status will be created`
      )
    }
    if (connectorStatus != null) {
      connectorStatus.startDate = convertToDate(connectorStatus.startDate)
      connectorStatus.lastRunDate = convertToDate(connectorStatus.lastRunDate)
      connectorStatus.stopDate = convertToDate(connectorStatus.stopDate)
      connectorStatus.stoppedDate = convertToDate(connectorStatus.stoppedDate)
      if (
        !this.started &&
        (connectorStatus.start ||
          this.chargingStation.getAutomaticTransactionGeneratorConfiguration()?.enable !== true)
      ) {
        connectorStatus.start = false
      }
    }
    return (
      connectorStatus ?? {
        acceptedAuthorizeRequests: 0,
        acceptedStartTransactionRequests: 0,
        acceptedStopTransactionRequests: 0,
        authorizeRequests: 0,
        rejectedAuthorizeRequests: 0,
        rejectedStartTransactionRequests: 0,
        rejectedStopTransactionRequests: 0,
        skippedConsecutiveTransactions: 0,
        skippedTransactions: 0,
        start: false,
        startTransactionRequests: 0,
        stopTransactionRequests: 0,
      }
    )
  }

  private getRequireAuthorize (): boolean {
    return (
      this.chargingStation.getAutomaticTransactionGeneratorConfiguration()?.requireAuthorize ?? true
    )
  }

  private handleStartTransactionResult (connectorId: number, result: StartTransactionResult): void {
    const connectorStatus = this.connectorsStatus.get(connectorId)
    if (connectorStatus == null) {
      return
    }
    ++connectorStatus.startTransactionRequests
    if (result.accepted) {
      ++connectorStatus.acceptedStartTransactionRequests
    } else {
      logger.warn(`${this.logPrefix(connectorId)} start transaction rejected`)
      ++connectorStatus.rejectedStartTransactionRequests
    }
  }

  private initializeConnectorsStatus (): void {
    for (const { connectorId } of this.chargingStation.iterateConnectors(true)) {
      this.connectorsStatus.set(connectorId, this.getConnectorStatus(connectorId))
    }
  }

  private async internalStartConnector (
    connectorId: number,
    stopAbsoluteDuration?: boolean
  ): Promise<void> {
    this.setStartConnectorStatus(connectorId, stopAbsoluteDuration)
    const connectorStatus = this.connectorsStatus.get(connectorId)
    if (connectorStatus == null) {
      return
    }
    logger.info(
      `${this.logPrefix(
        connectorId
      )} started on connector and will run for ${formatDurationMilliSeconds(
        (connectorStatus.stopDate?.getTime() ?? 0) - (connectorStatus.startDate?.getTime() ?? 0)
      )}`
    )
    while (this.connectorsStatus.get(connectorId)?.start === true) {
      await this.waitChargingStationAvailable(connectorId)
      await this.waitConnectorAvailable(connectorId)
      await this.waitRunningTransactionStopped(connectorId)
      if (!this.canStartConnector(connectorId)) {
        this.stopConnector(connectorId)
        break
      }
      const wait = secondsToMilliseconds(
        randomInt(
          this.chargingStation.getAutomaticTransactionGeneratorConfiguration()
            ?.minDelayBetweenTwoTransactions ?? 0,
          (this.chargingStation.getAutomaticTransactionGeneratorConfiguration()
            ?.maxDelayBetweenTwoTransactions ?? 0) + 1
        )
      )
      logger.info(`${this.logPrefix(connectorId)} waiting for ${formatDurationMilliSeconds(wait)}`)
      await sleep(wait)
      const start = secureRandom()
      if (
        start <
        (this.chargingStation.getAutomaticTransactionGeneratorConfiguration()?.probabilityOfStart ??
          0)
      ) {
        connectorStatus.skippedConsecutiveTransactions = 0
        // Start transaction
        const startResponse = await this.startTransaction(connectorId)
        if (startResponse?.accepted === true) {
          // Wait until end of transaction
          const waitTrxEnd = secondsToMilliseconds(
            randomInt(
              this.chargingStation.getAutomaticTransactionGeneratorConfiguration()?.minDuration ??
                0,
              (this.chargingStation.getAutomaticTransactionGeneratorConfiguration()?.maxDuration ??
                0) + 1
            )
          )
          logger.info(
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            `${this.logPrefix(connectorId)} transaction started with id ${this.chargingStation
              .getConnectorStatus(connectorId)
              ?.transactionId?.toString()} and will stop in ${formatDurationMilliSeconds(waitTrxEnd)}`
          )
          await sleep(waitTrxEnd)
          await this.stopTransaction(connectorId)
        }
      } else {
        ++connectorStatus.skippedConsecutiveTransactions
        ++connectorStatus.skippedTransactions
        logger.info(
          `${this.logPrefix(connectorId)} skipped consecutively ${connectorStatus.skippedConsecutiveTransactions.toString()}/${connectorStatus.skippedTransactions.toString()} transaction(s)`
        )
      }
      connectorStatus.lastRunDate = new Date()
    }
    connectorStatus.stoppedDate = new Date()
    logger.info(
      `${this.logPrefix(
        connectorId
      )} stopped on connector and lasted for ${formatDurationMilliSeconds(
        connectorStatus.stoppedDate.getTime() - (connectorStatus.startDate?.getTime() ?? 0)
      )}`
    )
    logger.debug(
      `${this.logPrefix(connectorId)} stopped with connector status: %j`,
      connectorStatus
    )
    this.chargingStation.emitChargingStationEvent(ChargingStationEvents.updated)
  }

  private readonly logPrefix = (connectorId?: number): string => {
    return logPrefix(
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      ` ${this.chargingStation.stationInfo?.chargingStationId} | ATG${
        connectorId != null ? ` on connector #${connectorId.toString()}` : ''
      }:`
    )
  }

  private setStartConnectorStatus (
    connectorId: number,
    stopAbsoluteDuration = this.chargingStation.getAutomaticTransactionGeneratorConfiguration()
      ?.stopAbsoluteDuration
  ): void {
    const connectorStatus = this.connectorsStatus.get(connectorId)
    if (connectorStatus == null) {
      return
    }
    connectorStatus.startDate = new Date()
    if (stopAbsoluteDuration === false || !isValidDate(connectorStatus.stopDate)) {
      connectorStatus.stopDate = new Date(
        connectorStatus.startDate.getTime() +
          hoursToMilliseconds(
            this.chargingStation.getAutomaticTransactionGeneratorConfiguration()?.stopAfterHours ??
              0
          )
      )
    }
    delete connectorStatus.stoppedDate
    connectorStatus.skippedConsecutiveTransactions = 0
    connectorStatus.start = true
    this.chargingStation.emitChargingStationEvent(ChargingStationEvents.updated)
  }

  private startConnectors (stopAbsoluteDuration?: boolean): void {
    if (
      !isEmpty(this.connectorsStatus) &&
      this.connectorsStatus.size !== this.chargingStation.getNumberOfConnectors()
    ) {
      this.connectorsStatus.clear()
      this.initializeConnectorsStatus()
    }
    for (const { connectorId } of this.chargingStation.iterateConnectors(true)) {
      this.startConnector(connectorId, stopAbsoluteDuration)
    }
  }

  private async startTransaction (connectorId: number): Promise<StartTransactionResult | undefined> {
    const measureId = 'StartTransaction with ATG'
    const beginId = PerformanceStatistics.beginMeasure(measureId)
    let result: StartTransactionResult | undefined
    if (this.chargingStation.hasIdTags()) {
      const idTag = IdTagsCache.getInstance().getIdTag(
        this.chargingStation.getAutomaticTransactionGeneratorConfiguration()?.idTagDistribution ??
          IdTagDistribution.ROUND_ROBIN,
        this.chargingStation,
        connectorId
      )
      const startTransactionLogMsg = `${this.logPrefix(
        connectorId
      )} start transaction with an idTag '${idTag}'`
      if (this.getRequireAuthorize()) {
        const connectorStatus = this.connectorsStatus.get(connectorId)
        if (connectorStatus != null) {
          ++connectorStatus.authorizeRequests
        }
        if (await isIdTagAuthorized(this.chargingStation, connectorId, idTag)) {
          if (connectorStatus != null) {
            ++connectorStatus.acceptedAuthorizeRequests
          }
          logger.info(startTransactionLogMsg)
          result = await startTransactionOnConnector(this.chargingStation, connectorId, idTag)
          this.handleStartTransactionResult(connectorId, result)
          PerformanceStatistics.endMeasure(measureId, beginId)
          return result
        }
        if (connectorStatus != null) {
          ++connectorStatus.rejectedAuthorizeRequests
        }
        PerformanceStatistics.endMeasure(measureId, beginId)
        return result
      }
      logger.info(startTransactionLogMsg)
      result = await startTransactionOnConnector(this.chargingStation, connectorId, idTag)
      this.handleStartTransactionResult(connectorId, result)
      PerformanceStatistics.endMeasure(measureId, beginId)
      return result
    }
    logger.info(`${this.logPrefix(connectorId)} start transaction without an idTag`)
    result = await startTransactionOnConnector(this.chargingStation, connectorId)
    this.handleStartTransactionResult(connectorId, result)
    PerformanceStatistics.endMeasure(measureId, beginId)
    return result
  }

  private stopConnectors (): void {
    for (const { connectorId } of this.chargingStation.iterateConnectors(true)) {
      this.stopConnector(connectorId)
    }
  }

  private async stopTransaction (
    connectorId: number,
    reason = StopTransactionReason.LOCAL
  ): Promise<StopTransactionResult | undefined> {
    const measureId = 'StopTransaction with ATG'
    const beginId = PerformanceStatistics.beginMeasure(measureId)
    let result: StopTransactionResult | undefined
    if (this.chargingStation.getConnectorStatus(connectorId)?.transactionStarted === true) {
      logger.info(
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `${this.logPrefix(connectorId)} stop transaction with id ${this.chargingStation
          .getConnectorStatus(connectorId)
          ?.transactionId?.toString()}`
      )
      result = await stopTransactionOnConnector(this.chargingStation, connectorId, reason)
      const connectorStatus = this.connectorsStatus.get(connectorId)
      if (connectorStatus != null) {
        ++connectorStatus.stopTransactionRequests
        if (result.accepted) {
          ++connectorStatus.acceptedStopTransactionRequests
        } else {
          ++connectorStatus.rejectedStopTransactionRequests
        }
      }
    } else {
      const transactionId = this.chargingStation.getConnectorStatus(connectorId)?.transactionId
      logger.debug(
        `${this.logPrefix(connectorId)} stopping a not started transaction${
          transactionId != null ? ` with id ${transactionId.toString()}` : ''
        }`
      )
    }
    PerformanceStatistics.endMeasure(measureId, beginId)
    return result
  }

  private async waitChargingStationAvailable (connectorId: number): Promise<void> {
    let logged = false
    while (!this.chargingStation.isChargingStationAvailable()) {
      if (!logged) {
        logger.info(
          `${this.logPrefix(
            connectorId
          )} transaction loop waiting for charging station to be available`
        )
        logged = true
      }
      await sleep(Constants.DEFAULT_ATG_WAIT_TIME_MS)
    }
  }

  private async waitConnectorAvailable (connectorId: number): Promise<void> {
    let logged = false
    while (!this.chargingStation.isConnectorAvailable(connectorId)) {
      if (!logged) {
        logger.info(
          `${this.logPrefix(
            connectorId
          )} transaction loop waiting for connector ${connectorId.toString()} to be available`
        )
        logged = true
      }
      await sleep(Constants.DEFAULT_ATG_WAIT_TIME_MS)
    }
  }

  private async waitRunningTransactionStopped (connectorId: number): Promise<void> {
    const connectorStatus = this.chargingStation.getConnectorStatus(connectorId)
    let logged = false
    while (connectorStatus?.transactionStarted === true) {
      if (!logged) {
        logger.info(
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `${this.logPrefix(connectorId)} transaction loop waiting for started transaction ${connectorStatus.transactionId?.toString()} on connector ${connectorId.toString()} to be stopped`
        )
        logged = true
      }
      await sleep(Constants.DEFAULT_ATG_WAIT_TIME_MS)
    }
  }
}
