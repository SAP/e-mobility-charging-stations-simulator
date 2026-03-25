// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import { millisecondsToSeconds, secondsToMilliseconds } from 'date-fns'
import { hash, randomInt } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync, type FSWatcher, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { URL } from 'node:url'
import { parentPort } from 'node:worker_threads'
import { type RawData, WebSocket } from 'ws'

import { BaseError, OCPPError } from '../exception/index.js'
import { PerformanceStatistics } from '../performance/index.js'
import {
  type AutomaticTransactionGeneratorConfiguration,
  AvailabilityType,
  type BootNotificationRequest,
  type BootNotificationResponse,
  type CachedRequest,
  type ChargingStationConfiguration,
  ChargingStationEvents,
  type ChargingStationInfo,
  type ChargingStationOcppConfiguration,
  type ChargingStationOptions,
  type ChargingStationTemplate,
  type ConnectorStatus,
  ConnectorStatusEnum,
  CurrentType,
  type ErrorCallback,
  type ErrorResponse,
  ErrorType,
  type EvseStatus,
  type EvseStatusConfiguration,
  FileType,
  FirmwareStatus,
  type FirmwareStatusNotificationRequest,
  type FirmwareStatusNotificationResponse,
  type HeartbeatRequest,
  type HeartbeatResponse,
  type IncomingRequest,
  type IncomingRequestCommand,
  MessageType,
  MeterValueMeasurand,
  OCPPVersion,
  type OutgoingRequest,
  PowerUnits,
  RegistrationStatusEnumType,
  RequestCommand,
  type Reservation,
  type ReservationKey,
  ReservationTerminationReason,
  type Response,
  StandardParametersKey,
  type Status,
  type StatusNotificationRequest,
  type StopTransactionReason,
  SupervisionUrlDistribution,
  SupportedFeatureProfiles,
  type Voltage,
  WebSocketCloseEventStatusCode,
  type WSError,
  type WsOptions,
} from '../types/index.js'
import {
  ACElectricUtils,
  AsyncLock,
  AsyncLockType,
  buildAddedMessage,
  buildChargingStationAutomaticTransactionGeneratorConfiguration,
  buildConnectorsStatus,
  buildDeletedMessage,
  buildEvsesStatus,
  buildStartedMessage,
  buildStoppedMessage,
  buildUpdatedMessage,
  clampToSafeTimerValue,
  clone,
  Configuration,
  Constants,
  convertToBoolean,
  convertToDate,
  convertToInt,
  DCElectricUtils,
  ensureError,
  exponentialDelay,
  formatDurationMilliSeconds,
  formatDurationSeconds,
  getErrorMessage,
  getWebSocketCloseEventStatusString,
  handleFileException,
  isEmpty,
  isNotEmptyArray,
  isNotEmptyString,
  logger,
  logPrefix,
  mergeDeepRight,
  min,
  once,
  promiseWithTimeout,
  roundTo,
  secureRandom,
  sleep,
  watchJsonFile,
} from '../utils/index.js'
import { AutomaticTransactionGenerator } from './AutomaticTransactionGenerator.js'
import { ChargingStationWorkerBroadcastChannel } from './broadcast-channel/ChargingStationWorkerBroadcastChannel.js'
import {
  addConfigurationKey,
  deleteConfigurationKey,
  getConfigurationKey,
  setConfigurationKeyValue,
} from './ConfigurationKeyUtils.js'
import {
  buildConnectorsMap,
  buildTemplateName,
  checkChargingStationState,
  checkConfiguration,
  checkConnectorsConfiguration,
  checkEvsesConfiguration,
  checkStationInfoConnectorStatus,
  checkTemplate,
  createBootNotificationRequest,
  createSerialNumber,
  getAmperageLimitationUnitDivider,
  getBootConnectorStatus,
  getChargingStationChargingProfilesLimit,
  getChargingStationId,
  getConnectorChargingProfilesLimit,
  getDefaultVoltageOut,
  getHashId,
  getIdTagsFile,
  getMaxNumberOfEvses,
  getMessageTypeString,
  getNumberOfReservableConnectors,
  getPhaseRotationValue,
  hasFeatureProfile,
  hasReservationExpired,
  initializeConnectorsMapStatus,
  prepareConnectorStatus,
  propagateSerialNumber,
  setChargingStationOptions,
  stationTemplateToStationInfo,
  validateStationInfo,
  warnTemplateKeysDeprecation,
} from './Helpers.js'
import { IdTagsCache } from './IdTagsCache.js'
import {
  OCPP16IncomingRequestService,
  OCPP16RequestService,
  OCPP16ResponseService,
  OCPP20IncomingRequestService,
  OCPP20RequestService,
  OCPP20ResponseService,
  OCPPAuthServiceFactory,
  type OCPPIncomingRequestService,
  type OCPPRequestService,
  sendAndSetConnectorStatus,
} from './ocpp/index.js'
import { flushQueuedTransactionMessages, stopRunningTransactions } from './ocpp/OCPPServiceUtils.js'
import { SharedLRUCache } from './SharedLRUCache.js'

export class ChargingStation extends EventEmitter {
  public automaticTransactionGenerator?: AutomaticTransactionGenerator
  public bootNotificationRequest?: BootNotificationRequest
  public bootNotificationResponse?: BootNotificationResponse
  public readonly connectors: Map<number, ConnectorStatus>
  public readonly evses: Map<number, EvseStatus>
  public heartbeatSetInterval?: NodeJS.Timeout
  public idTagsCache: IdTagsCache
  public readonly index: number
  public ocppConfiguration?: ChargingStationOcppConfiguration
  public ocppRequestService!: OCPPRequestService
  public performanceStatistics?: PerformanceStatistics
  public powerDivider?: number
  public readonly requests: Map<string, CachedRequest>
  public started: boolean
  public starting: boolean
  public stationInfo?: ChargingStationInfo
  public readonly templateFile: string
  public wsConnection: null | WebSocket

  public get hasEvses (): boolean {
    return isEmpty(this.connectors) && this.evses.size > 0
  }

  public get wsConnectionUrl (): URL {
    const wsConnectionBaseUrlStr = `${
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      this.stationInfo?.supervisionUrlOcppConfiguration === true &&
      isNotEmptyString(this.stationInfo.supervisionUrlOcppKey) &&
      isNotEmptyString(getConfigurationKey(this, this.stationInfo.supervisionUrlOcppKey)?.value)
        ? getConfigurationKey(this, this.stationInfo.supervisionUrlOcppKey)?.value
        : this.configuredSupervisionUrl.href
    }`
    return new URL(
      `${wsConnectionBaseUrlStr}${
        !wsConnectionBaseUrlStr.endsWith('/') ? '/' : ''
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      }${this.stationInfo?.chargingStationId}`
    )
  }

  private automaticTransactionGeneratorConfiguration?: AutomaticTransactionGeneratorConfiguration
  private readonly chargingStationWorkerBroadcastChannel: ChargingStationWorkerBroadcastChannel
  private configurationFile!: string
  private configurationFileHash!: string
  private configuredSupervisionUrl!: URL
  private connectorsConfigurationHash!: string
  private evsesConfigurationHash!: string
  private flushingMessageBuffer: boolean
  private flushMessageBufferSetInterval?: NodeJS.Timeout
  private readonly messageQueue: string[]
  private ocppIncomingRequestService!: OCPPIncomingRequestService
  private readonly sharedLRUCache: SharedLRUCache
  private stopping: boolean
  private templateFileHash!: string
  private templateFileWatcher?: FSWatcher
  private wsConnectionRetryCount: number
  private wsPingSetInterval?: NodeJS.Timeout

  constructor (index: number, templateFile: string, options?: ChargingStationOptions) {
    super()
    this.started = false
    this.starting = false
    this.stopping = false
    this.wsConnection = null
    this.wsConnectionRetryCount = 0
    this.index = index
    this.templateFile = templateFile
    this.connectors = new Map<number, ConnectorStatus>()
    this.evses = new Map<number, EvseStatus>()
    this.requests = new Map<string, CachedRequest>()
    this.flushingMessageBuffer = false
    this.messageQueue = [] as string[]
    this.sharedLRUCache = SharedLRUCache.getInstance()
    this.idTagsCache = IdTagsCache.getInstance()
    this.chargingStationWorkerBroadcastChannel = new ChargingStationWorkerBroadcastChannel(this)

    this.on(ChargingStationEvents.added, () => {
      parentPort?.postMessage(buildAddedMessage(this))
    })
    this.on(ChargingStationEvents.deleted, () => {
      parentPort?.postMessage(buildDeletedMessage(this))
    })
    this.on(ChargingStationEvents.started, () => {
      parentPort?.postMessage(buildStartedMessage(this))
    })
    this.on(ChargingStationEvents.stopped, () => {
      parentPort?.postMessage(buildStoppedMessage(this))
    })
    this.on(ChargingStationEvents.updated, () => {
      parentPort?.postMessage(buildUpdatedMessage(this))
    })
    this.on(ChargingStationEvents.accepted, () => {
      this.startMessageSequence(
        this.wsConnectionRetryCount > 0
          ? true
          : this.getAutomaticTransactionGeneratorConfiguration()?.stopAbsoluteDuration
      ).catch((error: unknown) => {
        logger.error(`${this.logPrefix()} Error while starting the message sequence:`, error)
      })
      this.wsConnectionRetryCount = 0
    })
    this.on(ChargingStationEvents.rejected, () => {
      this.wsConnectionRetryCount = 0
    })
    this.on(ChargingStationEvents.connected, () => {
      if (this.wsPingSetInterval == null) {
        this.startWebSocketPing()
      }
    })
    this.on(ChargingStationEvents.disconnected, () => {
      try {
        this.internalStopMessageSequence()
      } catch (error) {
        logger.error(
          `${this.logPrefix()} Error while stopping the internal message sequence:`,
          error
        )
      }
    })

    this.initialize(options)

    this.add()

    if (this.stationInfo?.autoStart === true) {
      this.start()
    }
  }

  /**
   * Adds a reservation to the specified connector.
   * @param reservation - The reservation to add
   */
  public async addReservation (reservation: Reservation): Promise<void> {
    const reservationFound = this.getReservationBy('reservationId', reservation.reservationId)
    if (reservationFound != null) {
      await this.removeReservation(reservationFound, ReservationTerminationReason.REPLACE_EXISTING)
    }
    const connectorStatus = this.getConnectorStatus(reservation.connectorId)
    if (connectorStatus == null) {
      logger.error(
        `${this.logPrefix()} No connector ${reservation.connectorId.toString()} found during reservation ${reservation.reservationId.toString()} addition`
      )
      return
    }
    connectorStatus.reservation = reservation
    await sendAndSetConnectorStatus(
      this,
      {
        connectorId: reservation.connectorId,
        status: ConnectorStatusEnum.Reserved,
      } as unknown as StatusNotificationRequest,
      { send: reservation.connectorId !== 0 }
    )
  }

  /**
   * Buffers an OCPP message for deferred sending when connection is unavailable.
   * @param message - The OCPP message to buffer
   */
  public bufferMessage (message: string): void {
    this.messageQueue.push(message)
    this.setIntervalFlushMessageBuffer()
  }

  /** Closes the WebSocket connection to the central server. */
  public closeWSConnection (): void {
    if (this.wsConnection != null) {
      if (this.isWebSocketConnectionOpened()) {
        this.wsConnection.close()
      }
      this.wsConnection = null
    }
  }

  /**
   * Deletes the charging station instance and optionally its persisted configuration.
   * @param deleteConfiguration - Whether to delete the persisted configuration file
   */
  public async delete (deleteConfiguration = true): Promise<void> {
    if (this.started) {
      try {
        await this.stop()
      } catch (error) {
        logger.error(`${this.logPrefix()} Error stopping station during delete:`, error)
      }
    }
    AutomaticTransactionGenerator.deleteInstance(this)
    PerformanceStatistics.deleteInstance(this.stationInfo?.hashId)
    OCPPAuthServiceFactory.clearInstance(this)
    if (this.stationInfo != null) {
      const idTagsFile = getIdTagsFile(this.stationInfo)
      if (idTagsFile != null) {
        this.idTagsCache.deleteIdTags(idTagsFile)
      } else {
        logger.warn(`${this.logPrefix()} No ID tags file found during deletion`)
      }
    } else {
      logger.warn(`${this.logPrefix()} No station info available during deletion`)
    }
    this.requests.clear()
    this.connectors.clear()
    this.evses.clear()
    this.messageQueue.length = 0
    this.templateFileWatcher?.unref()
    if (deleteConfiguration && existsSync(this.configurationFile)) {
      try {
        rmSync(this.configurationFile, { force: true })
      } catch (error) {
        logger.error(
          `${this.logPrefix()} Failed to delete configuration file ${this.configurationFile}:`,
          error
        )
      }
    }
    this.chargingStationWorkerBroadcastChannel.unref()
    this.emitChargingStationEvent(ChargingStationEvents.deleted)
    this.removeAllListeners()
  }

  /**
   * Emit a ChargingStation event only if there are listeners registered for it.
   * This optimizes performance by avoiding unnecessary event emission.
   * @param event - The ChargingStation event to emit
   * @param args - Arguments to pass to the event listeners
   */
  public emitChargingStationEvent (event: ChargingStationEvents, ...args: unknown[]): void {
    if (this.listenerCount(event) > 0) {
      this.emit(event, ...args)
    }
  }

  public getAuthorizeRemoteTxRequests (): boolean {
    const authorizeRemoteTxRequests = getConfigurationKey(
      this,
      StandardParametersKey.AuthorizeRemoteTxRequests
    )
    return authorizeRemoteTxRequests != null
      ? convertToBoolean(authorizeRemoteTxRequests.value)
      : false
  }

  /**
   * Gets the automatic transaction generator configuration.
   * @returns The ATG configuration or undefined if not available
   */
  public getAutomaticTransactionGeneratorConfiguration ():
    | AutomaticTransactionGeneratorConfiguration
    | undefined {
    if (this.automaticTransactionGeneratorConfiguration == null) {
      let automaticTransactionGeneratorConfiguration:
        | AutomaticTransactionGeneratorConfiguration
        | undefined
      const stationTemplate = this.getTemplateFromFile()
      const stationConfiguration = this.getConfigurationFromFile()
      if (
        this.stationInfo?.automaticTransactionGeneratorPersistentConfiguration === true &&
        stationConfiguration?.stationInfo?.templateHash === stationTemplate?.templateHash &&
        stationConfiguration?.automaticTransactionGenerator != null
      ) {
        automaticTransactionGeneratorConfiguration =
          stationConfiguration.automaticTransactionGenerator
      } else {
        automaticTransactionGeneratorConfiguration = stationTemplate?.AutomaticTransactionGenerator
      }
      this.automaticTransactionGeneratorConfiguration = {
        ...Constants.DEFAULT_ATG_CONFIGURATION,
        ...automaticTransactionGeneratorConfiguration,
      }
    }
    return this.automaticTransactionGeneratorConfiguration
  }

  /**
   * Gets the status of each ATG connector.
   * @returns Array of ATG connector statuses or undefined
   */
  public getAutomaticTransactionGeneratorStatuses (): Status[] | undefined {
    return this.getConfigurationFromFile()?.automaticTransactionGeneratorStatuses
  }

  public getConnectionTimeout (): number {
    if (getConfigurationKey(this, StandardParametersKey.ConnectionTimeOut) != null) {
      return convertToInt(
        getConfigurationKey(this, StandardParametersKey.ConnectionTimeOut)?.value ??
          Constants.DEFAULT_CONNECTION_TIMEOUT
      )
    }
    return Constants.DEFAULT_CONNECTION_TIMEOUT
  }

  /**
   * Resolves the connector ID for a given transaction ID.
   * @param transactionId - The transaction ID to resolve
   * @returns The connector ID or undefined if not found
   */
  public getConnectorIdByTransactionId (
    transactionId: number | string | undefined
  ): number | undefined {
    if (transactionId == null) {
      return undefined
    } else if (this.hasEvses) {
      for (const evseStatus of this.evses.values()) {
        for (const [connectorId, connectorStatus] of evseStatus.connectors) {
          if (connectorStatus.transactionId === transactionId) {
            return connectorId
          }
        }
      }
    } else {
      for (const connectorId of this.connectors.keys()) {
        if (this.getConnectorStatus(connectorId)?.transactionId === transactionId) {
          return connectorId
        }
      }
    }
  }

  /**
   * Computes the maximum power available on a connector considering amperage limitations and charging profiles.
   * @param connectorId - The connector ID
   * @returns The maximum available power in watts
   */
  public getConnectorMaximumAvailablePower (connectorId: number): number {
    let connectorAmperageLimitationLimit: number | undefined
    const amperageLimitation = this.getAmperageLimitation()
    if (
      amperageLimitation != null &&
      amperageLimitation < (this.stationInfo?.maximumAmperage ?? Infinity)
    ) {
      const voltageOut = this.getVoltageOut()
      connectorAmperageLimitationLimit =
        (this.stationInfo?.currentOutType === CurrentType.AC
          ? ACElectricUtils.powerTotal(
            this.getNumberOfPhases(),
            voltageOut,
            amperageLimitation *
                (this.hasEvses ? this.getNumberOfEvses() : this.getNumberOfConnectors())
          )
          : DCElectricUtils.power(voltageOut, amperageLimitation)) / (this.powerDivider ?? 1)
    }
    const connectorMaximumPower = (this.stationInfo?.maximumPower ?? 0) / (this.powerDivider ?? 1)
    const chargingStationChargingProfilesLimit =
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      getChargingStationChargingProfilesLimit(this)! / this.powerDivider!
    const connectorChargingProfilesLimit = getConnectorChargingProfilesLimit(this, connectorId)
    return min(
      Number.isNaN(connectorMaximumPower) ? Number.POSITIVE_INFINITY : connectorMaximumPower,
      connectorAmperageLimitationLimit == null || Number.isNaN(connectorAmperageLimitationLimit)
        ? Number.POSITIVE_INFINITY
        : connectorAmperageLimitationLimit,
      Number.isNaN(chargingStationChargingProfilesLimit)
        ? Number.POSITIVE_INFINITY
        : chargingStationChargingProfilesLimit,
      connectorChargingProfilesLimit == null || Number.isNaN(connectorChargingProfilesLimit)
        ? Number.POSITIVE_INFINITY
        : connectorChargingProfilesLimit
    )
  }

  public getConnectorStatus (connectorId: number): ConnectorStatus | undefined {
    if (this.hasEvses) {
      for (const evseStatus of this.evses.values()) {
        if (evseStatus.connectors.has(connectorId)) {
          return evseStatus.connectors.get(connectorId)
        }
      }
      return undefined
    }
    return this.connectors.get(connectorId)
  }

  /**
   * Gets cumulative active energy imported on a connector.
   * @param connectorId - The connector ID
   * @param rounded - Whether to round the value
   * @returns The cumulative active energy imported in watt-hours
   */
  public getEnergyActiveImportRegisterByConnectorId (connectorId: number, rounded = false): number {
    return this.getEnergyActiveImportRegister(this.getConnectorStatus(connectorId), rounded)
  }

  /**
   * Gets cumulative active energy imported for a transaction.
   * @param transactionId - The transaction ID
   * @param rounded - Whether to round the value
   * @returns The cumulative active energy imported in watt-hours
   */
  public getEnergyActiveImportRegisterByTransactionId (
    transactionId: number | string | undefined,
    rounded = false
  ): number {
    return this.getEnergyActiveImportRegister(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.getConnectorStatus(this.getConnectorIdByTransactionId(transactionId)!),
      rounded
    )
  }

  /**
   * Resolves the EVSE ID for a given connector ID.
   * @param connectorId - The connector ID
   * @returns The EVSE ID or undefined if not found
   */
  public getEvseIdByConnectorId (connectorId: number): number | undefined {
    if (!this.hasEvses) {
      return undefined
    }
    for (const [evseId, evseStatus] of this.evses) {
      if (evseStatus.connectors.has(connectorId)) {
        return evseId
      }
    }
    return undefined
  }

  /**
   * Resolves the EVSE ID for a given transaction ID.
   * @param transactionId - The transaction ID
   * @returns The EVSE ID or undefined if not found
   */
  public getEvseIdByTransactionId (transactionId: number | string | undefined): number | undefined {
    if (transactionId == null) {
      return undefined
    } else if (this.hasEvses) {
      for (const [evseId, evseStatus] of this.evses) {
        for (const connectorStatus of evseStatus.connectors.values()) {
          if (connectorStatus.transactionId === transactionId) {
            return evseId
          }
        }
      }
    }
    return undefined
  }

  /**
   * Returns the EVSE status for the given EVSE ID.
   * @param evseId - The EVSE ID to look up
   * @returns The EvseStatus if found, undefined otherwise
   */
  public getEvseStatus (evseId: number): EvseStatus | undefined {
    return this.evses.get(evseId)
  }

  public getHeartbeatInterval (): number {
    const HeartbeatInterval = getConfigurationKey(this, StandardParametersKey.HeartbeatInterval)
    if (HeartbeatInterval != null) {
      return secondsToMilliseconds(convertToInt(HeartbeatInterval.value))
    }
    const HeartBeatInterval = getConfigurationKey(this, StandardParametersKey.HeartBeatInterval)
    if (HeartBeatInterval != null) {
      return secondsToMilliseconds(convertToInt(HeartBeatInterval.value))
    }
    this.stationInfo?.autoRegister === false &&
      logger.warn(
        `${this.logPrefix()} Heartbeat interval configuration key not set, using default value: ${Constants.DEFAULT_HEARTBEAT_INTERVAL.toString()}`
      )
    return Constants.DEFAULT_HEARTBEAT_INTERVAL
  }

  public getLocalAuthListEnabled (): boolean {
    const localAuthListEnabled = getConfigurationKey(
      this,
      StandardParametersKey.LocalAuthListEnabled
    )
    return localAuthListEnabled != null ? convertToBoolean(localAuthListEnabled.value) : false
  }

  public getNumberOfConnectors (): number {
    if (this.hasEvses) {
      let numberOfConnectors = 0
      for (const [evseId, evseStatus] of this.evses) {
        if (evseId > 0) {
          numberOfConnectors += evseStatus.connectors.size
        }
      }
      return numberOfConnectors
    }
    return this.connectors.has(0) ? this.connectors.size - 1 : this.connectors.size
  }

  public getNumberOfEvses (): number {
    return this.evses.has(0) ? this.evses.size - 1 : this.evses.size
  }

  /**
   * Gets the number of electrical phases for this station.
   * @param stationInfo - Optional station info to use instead of this.stationInfo
   * @returns The number of phases (3 for AC, 0 for DC)
   */
  public getNumberOfPhases (stationInfo?: ChargingStationInfo): number {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const localStationInfo = stationInfo ?? this.stationInfo!
    switch (this.getCurrentOutType(stationInfo)) {
      case CurrentType.AC:
        return localStationInfo.numberOfPhases ?? 3
      case CurrentType.DC:
        return 0
    }
  }

  /**
   * Counts currently active transactions across all connectors.
   * @returns The number of running transactions
   */
  public getNumberOfRunningTransactions (): number {
    let numberOfRunningTransactions = 0
    if (this.hasEvses) {
      for (const [evseId, evseStatus] of this.evses) {
        if (evseId === 0) {
          continue
        }
        for (const connectorStatus of evseStatus.connectors.values()) {
          if (connectorStatus.transactionStarted === true) {
            ++numberOfRunningTransactions
          }
        }
      }
    } else {
      for (const connectorId of this.connectors.keys()) {
        if (connectorId > 0 && this.getConnectorStatus(connectorId)?.transactionStarted === true) {
          ++numberOfRunningTransactions
        }
      }
    }
    return numberOfRunningTransactions
  }

  /**
   * Finds a reservation matching the given filter predicate.
   * @param filterKey - The reservation property to filter by
   * @param value - The value to match
   * @returns The matching reservation or undefined
   */
  public getReservationBy (
    filterKey: ReservationKey,
    value: number | string
  ): Reservation | undefined {
    if (this.hasEvses) {
      for (const evseStatus of this.evses.values()) {
        for (const connectorStatus of evseStatus.connectors.values()) {
          if (connectorStatus.reservation?.[filterKey] === value) {
            return connectorStatus.reservation
          }
        }
      }
    } else {
      for (const connectorStatus of this.connectors.values()) {
        if (connectorStatus.reservation?.[filterKey] === value) {
          return connectorStatus.reservation
        }
      }
    }
  }

  public getReserveConnectorZeroSupported (): boolean {
    return convertToBoolean(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      getConfigurationKey(this, StandardParametersKey.ReserveConnectorZeroSupported)!.value
    )
  }

  /**
   * Gets the ID tag used for a given transaction.
   * @param transactionId - The transaction ID
   * @returns The ID tag or undefined if not found
   */
  public getTransactionIdTag (transactionId: number): string | undefined {
    if (this.hasEvses) {
      for (const evseStatus of this.evses.values()) {
        for (const connectorStatus of evseStatus.connectors.values()) {
          if (connectorStatus.transactionId === transactionId) {
            return connectorStatus.transactionIdTag
          }
        }
      }
    } else {
      for (const connectorId of this.connectors.keys()) {
        if (this.getConnectorStatus(connectorId)?.transactionId === transactionId) {
          return this.getConnectorStatus(connectorId)?.transactionIdTag
        }
      }
    }
  }

  public getVoltageOut (stationInfo?: ChargingStationInfo): Voltage {
    return (
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      (stationInfo ?? this.stationInfo!).voltageOut ??
      getDefaultVoltageOut(this.getCurrentOutType(stationInfo), this.logPrefix(), this.templateFile)
    )
  }

  public getWebSocketPingInterval (): number {
    return getConfigurationKey(this, StandardParametersKey.WebSocketPingInterval) != null
      ? convertToInt(getConfigurationKey(this, StandardParametersKey.WebSocketPingInterval)?.value)
      : Constants.DEFAULT_WEBSOCKET_PING_INTERVAL
  }

  public hasConnector (connectorId: number): boolean {
    if (this.hasEvses) {
      for (const evseStatus of this.evses.values()) {
        if (evseStatus.connectors.has(connectorId)) {
          return true
        }
      }
      return false
    }
    return this.connectors.has(connectorId)
  }

  public hasIdTags (): boolean {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return isNotEmptyArray(this.idTagsCache.getIdTags(getIdTagsFile(this.stationInfo!)!))
  }

  public inAcceptedState (): boolean {
    return this.bootNotificationResponse?.status === RegistrationStatusEnumType.ACCEPTED
  }

  public inPendingState (): boolean {
    return this.bootNotificationResponse?.status === RegistrationStatusEnumType.PENDING
  }

  public inRejectedState (): boolean {
    return this.bootNotificationResponse?.status === RegistrationStatusEnumType.REJECTED
  }

  public inUnknownState (): boolean {
    return this.bootNotificationResponse?.status == null
  }

  public isChargingStationAvailable (): boolean {
    return this.getConnectorStatus(0)?.availability === AvailabilityType.Operative
  }

  public isConnectorAvailable (connectorId: number): boolean {
    return (
      connectorId > 0 &&
      this.getConnectorStatus(connectorId)?.availability === AvailabilityType.Operative
    )
  }

  /**
   * Checks whether a connector can accept a new reservation.
   * @param reservationId - The reservation ID to check
   * @param idTag - Optional ID tag for user reservation check
   * @param connectorId - Optional connector ID to check availability
   * @returns True if the connector can accept a reservation
   */
  public isConnectorReservable (
    reservationId: number,
    idTag?: string,
    connectorId?: number
  ): boolean {
    const reservation = this.getReservationBy('reservationId', reservationId)
    const reservationExists = reservation != null && !hasReservationExpired(reservation)
    if (arguments.length === 1) {
      return !reservationExists
    } else if (arguments.length > 1) {
      const userReservation = idTag != null ? this.getReservationBy('idTag', idTag) : undefined
      const userReservationExists =
        userReservation != null && !hasReservationExpired(userReservation)
      const notConnectorZero = connectorId == null ? true : connectorId > 0
      const freeConnectorsAvailable = this.getNumberOfReservableConnectors() > 0
      return (
        !reservationExists && !userReservationExists && notConnectorZero && freeConnectorsAvailable
      )
    }
    return false
  }

  public isWebSocketConnectionOpened (): boolean {
    return this.wsConnection?.readyState === WebSocket.OPEN
  }

  public lockConnector (connectorId: number): void {
    if (connectorId === 0) {
      logger.warn(`${this.logPrefix()} lockConnector: connector id 0 is not a physical connector`)
      return
    }
    if (!this.hasConnector(connectorId)) {
      logger.warn(
        `${this.logPrefix()} lockConnector: connector id ${connectorId.toString()} does not exist`
      )
      return
    }
    const connectorStatus = this.getConnectorStatus(connectorId)
    if (connectorStatus == null) {
      logger.warn(
        `${this.logPrefix()} lockConnector: connector id ${connectorId.toString()} status is null`
      )
      return
    }
    if (connectorStatus.locked !== true) {
      connectorStatus.locked = true
      this.emitChargingStationEvent(ChargingStationEvents.connectorStatusChanged, {
        connectorId,
        ...connectorStatus,
      })
    }
  }

  public logPrefix = (): string => {
    if (
      this instanceof ChargingStation &&
      this.stationInfo != null &&
      isNotEmptyString(this.stationInfo.chargingStationId)
    ) {
      return logPrefix(` ${this.stationInfo.chargingStationId} |`)
    }
    let stationTemplate: ChargingStationTemplate | undefined
    try {
      stationTemplate = JSON.parse(
        readFileSync(this.templateFile, 'utf8')
      ) as ChargingStationTemplate
    } catch {
      // Ignore
    }
    return logPrefix(` ${getChargingStationId(this.index, stationTemplate)} |`)
  }

  /**
   * Opens the WebSocket connection to the OCPP central server.
   * @param options - Optional WebSocket connection options
   * @param params - Optional connection parameters
   * @param params.closeOpened - Whether to close an existing connection
   * @param params.terminateOpened - Whether to terminate an existing connection
   */
  public openWSConnection (
    options?: WsOptions,
    params?: { closeOpened?: boolean; terminateOpened?: boolean }
  ): void {
    options = {
      handshakeTimeout: secondsToMilliseconds(this.getConnectionTimeout()),
      ...this.stationInfo?.wsOptions,
      ...options,
    }
    params = { ...{ closeOpened: false, terminateOpened: false }, ...params }
    if (!checkChargingStationState(this, this.logPrefix())) {
      return
    }
    if (this.stationInfo?.supervisionUser != null && this.stationInfo.supervisionPassword != null) {
      options.auth = `${this.stationInfo.supervisionUser}:${this.stationInfo.supervisionPassword}`
    }
    if (params.closeOpened) {
      this.closeWSConnection()
    }
    if (params.terminateOpened) {
      this.terminateWSConnection()
    }

    if (this.isWebSocketConnectionOpened()) {
      logger.warn(
        `${this.logPrefix()} OCPP connection to URL ${this.wsConnectionUrl.href} is already opened`
      )
      return
    }

    logger.info(`${this.logPrefix()} Open OCPP connection to URL ${this.wsConnectionUrl.href}`)

    this.wsConnection = new WebSocket(
      this.wsConnectionUrl,
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `ocpp${this.stationInfo?.ocppVersion}`,
      options
    )

    // Handle WebSocket message
    this.wsConnection.on('message', data => {
      this.onMessage(data).catch((error: unknown) =>
        logger.error(`${this.logPrefix()} Error while processing WebSocket message:`, error)
      )
    })
    // Handle WebSocket error
    this.wsConnection.on('error', this.onError.bind(this))
    // Handle WebSocket close
    this.wsConnection.on('close', this.onClose.bind(this))
    // Handle WebSocket open
    this.wsConnection.on('open', () => {
      this.onOpen().catch((error: unknown) =>
        logger.error(`${this.logPrefix()} Error while opening WebSocket connection:`, error)
      )
    })
    // Handle WebSocket ping
    this.wsConnection.on('ping', this.onPing.bind(this))
    // Handle WebSocket pong
    this.wsConnection.on('pong', this.onPong.bind(this))
  }

  /**
   * Removes a reservation and restores the connector to its previous status.
   * @param reservation - The reservation to remove
   * @param reason - The reason for removing the reservation
   */
  public async removeReservation (
    reservation: Reservation,
    reason: ReservationTerminationReason
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const connector = this.getConnectorStatus(reservation.connectorId)!
    switch (reason) {
      case ReservationTerminationReason.CONNECTOR_STATE_CHANGED:
      case ReservationTerminationReason.TRANSACTION_STARTED:
        delete connector.reservation
        break
      case ReservationTerminationReason.EXPIRED:
      case ReservationTerminationReason.REPLACE_EXISTING:
      case ReservationTerminationReason.RESERVATION_CANCELED:
        await sendAndSetConnectorStatus(
          this,
          {
            connectorId: reservation.connectorId,
            status: ConnectorStatusEnum.Available,
          } as unknown as StatusNotificationRequest,
          { send: reservation.connectorId !== 0 }
        )
        delete connector.reservation
        break
      default:
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        throw new BaseError(`Unknown reservation termination reason '${reason}'`)
    }
  }

  /**
   * Resets the charging station with optional graceful shutdown.
   * @param reason - Optional reason for the reset
   * @param graceful - Whether to perform a graceful shutdown
   */
  public async reset (reason?: StopTransactionReason, graceful = true): Promise<void> {
    try {
      await this.stop(reason, graceful ? this.stationInfo?.stopTransactionsOnStopped : false)
    } catch (error) {
      logger.error(`${this.logPrefix()} Error during reset stop phase:`, error)
      return
    }
    await sleep(this.stationInfo?.resetTime ?? 0)
    OCPPAuthServiceFactory.clearInstance(this)
    this.initialize()
    this.start()
  }

  /** Restarts the periodic heartbeat to the central server. */
  public restartHeartbeat (): void {
    // Stop heartbeat
    this.stopHeartbeat()
    // Start heartbeat
    this.startHeartbeat()
  }

  /** Restarts the WebSocket ping interval. */
  public restartWebSocketPing (): void {
    // Stop WebSocket ping
    this.stopWebSocketPing()
    // Start WebSocket ping
    this.startWebSocketPing()
  }

  /** Persists the current OCPP configuration to storage. */
  public saveOcppConfiguration (): void {
    if (this.stationInfo?.ocppPersistentConfiguration === true) {
      this.saveConfiguration()
    }
  }

  /**
   * Updates the supervision server URL in configuration or station info.
   * @param url - The new supervision server URL
   */
  public setSupervisionUrl (url: string): void {
    if (
      this.stationInfo?.supervisionUrlOcppConfiguration === true &&
      isNotEmptyString(this.stationInfo.supervisionUrlOcppKey)
    ) {
      setConfigurationKeyValue(this, this.stationInfo.supervisionUrlOcppKey, url)
    } else if (this.stationInfo != null) {
      this.stationInfo.supervisionUrls = url
      this.configuredSupervisionUrl = this.getConfiguredSupervisionUrl()
      this.saveStationInfo()
    }
  }

  /** Starts the charging station, initializes connectors, and connects to the central server. */
  public start (): void {
    if (!this.started) {
      if (!this.starting) {
        this.starting = true
        try {
          if (this.stationInfo?.enableStatistics === true) {
            this.performanceStatistics?.start()
          }
          this.openWSConnection()
          // Monitor charging station template file
          this.templateFileWatcher = watchJsonFile(
            this.templateFile,
            FileType.ChargingStationTemplate,
            this.logPrefix(),
            (event, filename): void => {
              if (isNotEmptyString(filename) && event === 'change') {
                try {
                  logger.debug(
                    `${this.logPrefix()} ${FileType.ChargingStationTemplate} ${
                      this.templateFile
                    } file have changed, reload`
                  )
                  this.sharedLRUCache.deleteChargingStationTemplate(this.templateFileHash)
                  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                  this.idTagsCache.deleteIdTags(getIdTagsFile(this.stationInfo!)!)
                  OCPPAuthServiceFactory.clearInstance(this)
                  // Initialize
                  this.initialize()
                  // Restart the ATG
                  const ATGStarted = this.automaticTransactionGenerator?.started
                  if (ATGStarted === true) {
                    this.stopAutomaticTransactionGenerator()
                  }
                  delete this.automaticTransactionGeneratorConfiguration
                  if (
                    this.getAutomaticTransactionGeneratorConfiguration()?.enable === true &&
                    ATGStarted === true
                  ) {
                    this.startAutomaticTransactionGenerator(undefined, true)
                  }
                  if (this.stationInfo?.enableStatistics === true) {
                    this.performanceStatistics?.restart()
                  } else {
                    this.performanceStatistics?.stop()
                  }
                  this.restartHeartbeat()
                  this.restartWebSocketPing()
                } catch (error) {
                  logger.error(
                    `${this.logPrefix()} ${FileType.ChargingStationTemplate} file monitoring error:`,
                    error
                  )
                }
              }
            }
          )
          this.started = true
          this.emitChargingStationEvent(ChargingStationEvents.started)
        } finally {
          this.starting = false
        }
      } else {
        logger.warn(`${this.logPrefix()} Charging station is already starting...`)
      }
    } else {
      logger.warn(`${this.logPrefix()} Charging station is already started...`)
    }
  }

  /**
   * Starts automatic transaction generation on the specified connectors.
   * @param connectorIds - Optional array of connector IDs to start ATG on
   * @param stopAbsoluteDuration - Whether to use absolute duration for stopping
   */
  public startAutomaticTransactionGenerator (
    connectorIds?: number[],
    stopAbsoluteDuration?: boolean
  ): void {
    this.automaticTransactionGenerator = AutomaticTransactionGenerator.getInstance(this)
    if (isNotEmptyArray(connectorIds)) {
      for (const connectorId of connectorIds) {
        this.automaticTransactionGenerator?.startConnector(connectorId, stopAbsoluteDuration)
      }
    } else {
      this.automaticTransactionGenerator?.start(stopAbsoluteDuration)
    }
    this.saveAutomaticTransactionGeneratorConfiguration()
    this.emitChargingStationEvent(ChargingStationEvents.updated)
  }

  /** Starts the periodic heartbeat to the central server. */
  public startHeartbeat (): void {
    const heartbeatInterval = this.getHeartbeatInterval()
    if (heartbeatInterval > 0 && this.heartbeatSetInterval == null) {
      this.heartbeatSetInterval = setInterval(() => {
        this.ocppRequestService
          .requestHandler<HeartbeatRequest, HeartbeatResponse>(this, RequestCommand.HEARTBEAT)
          .catch((error: unknown) => {
            logger.error(
              `${this.logPrefix()} Error while sending '${RequestCommand.HEARTBEAT}':`,
              error
            )
          })
      }, clampToSafeTimerValue(heartbeatInterval))
      logger.info(
        `${this.logPrefix()} Heartbeat started every ${formatDurationMilliSeconds(
          heartbeatInterval
        )}`
      )
    } else if (this.heartbeatSetInterval != null) {
      logger.info(
        `${this.logPrefix()} Heartbeat already started every ${formatDurationMilliSeconds(
          heartbeatInterval
        )}`
      )
    } else {
      logger.error(
        `${this.logPrefix()} Heartbeat interval set to ${heartbeatInterval.toString()}, not starting the heartbeat`
      )
    }
  }

  /**
   * Stops the charging station and closes the connection to the central server.
   * @param reason - Optional reason for stopping
   * @param stopTransactions - Whether to stop active transactions
   */
  public async stop (
    reason?: StopTransactionReason,
    stopTransactions = this.stationInfo?.stopTransactionsOnStopped
  ): Promise<void> {
    if (this.started) {
      if (!this.stopping) {
        this.stopping = true
        try {
          try {
            await promiseWithTimeout(
              this.stopMessageSequence(reason, stopTransactions),
              Constants.STOP_MESSAGE_SEQUENCE_TIMEOUT,
              `Timeout ${formatDurationMilliSeconds(Constants.STOP_MESSAGE_SEQUENCE_TIMEOUT)} reached at stopping message sequence`
            )
          } catch (error: unknown) {
            logger.error(`${this.logPrefix()} Error while stopping message sequence:`, error)
          }
          this.ocppIncomingRequestService.stop(this)
          this.closeWSConnection()
          if (this.stationInfo?.enableStatistics === true) {
            this.performanceStatistics?.stop()
          }
          this.templateFileWatcher?.close()
          delete this.bootNotificationResponse
          this.started = false
          this.saveConfiguration()
          this.sharedLRUCache.deleteChargingStationConfiguration(this.configurationFileHash)
          this.emitChargingStationEvent(ChargingStationEvents.stopped)
        } finally {
          this.stopping = false
        }
      } else {
        logger.warn(`${this.logPrefix()} Charging station is already stopping...`)
      }
    } else {
      logger.warn(`${this.logPrefix()} Charging station is already stopped...`)
    }
  }

  /**
   * Stops automatic transaction generation on the specified connectors.
   * @param connectorIds - Optional array of connector IDs to stop ATG on
   */
  public stopAutomaticTransactionGenerator (connectorIds?: number[]): void {
    if (isNotEmptyArray(connectorIds)) {
      for (const connectorId of connectorIds) {
        this.automaticTransactionGenerator?.stopConnector(connectorId)
      }
    } else {
      this.automaticTransactionGenerator?.stop()
    }
    this.saveAutomaticTransactionGeneratorConfiguration()
    this.emitChargingStationEvent(ChargingStationEvents.updated)
  }

  public unlockConnector (connectorId: number): void {
    if (connectorId === 0) {
      logger.warn(`${this.logPrefix()} unlockConnector: connector id 0 is not a physical connector`)
      return
    }
    if (!this.hasConnector(connectorId)) {
      logger.warn(
        `${this.logPrefix()} unlockConnector: connector id ${connectorId.toString()} does not exist`
      )
      return
    }
    const connectorStatus = this.getConnectorStatus(connectorId)
    if (connectorStatus == null) {
      logger.warn(
        `${this.logPrefix()} unlockConnector: connector id ${connectorId.toString()} status is null`
      )
      return
    }
    if (connectorStatus.locked !== false) {
      connectorStatus.locked = false
      this.emitChargingStationEvent(ChargingStationEvents.connectorStatusChanged, {
        connectorId,
        ...connectorStatus,
      })
    }
  }

  private add (): void {
    this.emitChargingStationEvent(ChargingStationEvents.added)
  }

  private clearIntervalFlushMessageBuffer (): void {
    if (this.flushMessageBufferSetInterval != null) {
      clearInterval(this.flushMessageBufferSetInterval)
      delete this.flushMessageBufferSetInterval
    }
  }

  private flushMessageBuffer (): void {
    if (!this.flushingMessageBuffer && this.messageQueue.length > 0) {
      this.flushingMessageBuffer = true
      this.sendMessageBuffer(() => {
        this.flushingMessageBuffer = false
      })
    }
  }

  private getAmperageLimitation (): number | undefined {
    if (
      isNotEmptyString(this.stationInfo?.amperageLimitationOcppKey) &&
      getConfigurationKey(this, this.stationInfo.amperageLimitationOcppKey) != null
    ) {
      return (
        convertToInt(getConfigurationKey(this, this.stationInfo.amperageLimitationOcppKey)?.value) /
        getAmperageLimitationUnitDivider(this.stationInfo)
      )
    }
  }

  private getCachedRequest (
    messageType: MessageType | undefined,
    messageId: string
  ): CachedRequest | undefined {
    const cachedRequest = this.requests.get(messageId)
    if (Array.isArray(cachedRequest)) {
      return cachedRequest
    }
    throw new OCPPError(
      ErrorType.PROTOCOL_ERROR,
      `Cached request for message id '${messageId}' ${getMessageTypeString(
        messageType
      )} is not an array`,
      undefined,
      cachedRequest
    )
  }

  private getConfigurationFromFile (): ChargingStationConfiguration | undefined {
    let configuration: ChargingStationConfiguration | undefined
    if (isNotEmptyString(this.configurationFile) && existsSync(this.configurationFile)) {
      try {
        if (
          isNotEmptyString(this.configurationFileHash) &&
          this.sharedLRUCache.hasChargingStationConfiguration(this.configurationFileHash)
        ) {
          configuration = this.sharedLRUCache.getChargingStationConfiguration(
            this.configurationFileHash
          )
        } else {
          const measureId = `${FileType.ChargingStationConfiguration} read`
          const beginId = PerformanceStatistics.beginMeasure(measureId)
          configuration = JSON.parse(
            readFileSync(this.configurationFile, 'utf8')
          ) as ChargingStationConfiguration
          PerformanceStatistics.endMeasure(measureId, beginId)
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (configuration == null || isEmpty(configuration)) {
            logger.error(
              `${this.logPrefix()} Invalid charging station configuration file ${
                this.configurationFile
              }`
            )
            return undefined
          }
          if (!isNotEmptyString(configuration.configurationHash)) {
            logger.error(
              `${this.logPrefix()} Missing charging station configuration hash in file ${
                this.configurationFile
              }`
            )
            return undefined
          }
          this.configurationFileHash = configuration.configurationHash
          this.sharedLRUCache.setChargingStationConfiguration(configuration)
        }
      } catch (error) {
        handleFileException(
          this.configurationFile,
          FileType.ChargingStationConfiguration,
          ensureError(error),
          this.logPrefix()
        )
        if (
          isNotEmptyString(this.configurationFileHash) &&
          this.sharedLRUCache.hasChargingStationConfiguration(this.configurationFileHash)
        ) {
          logger.warn(
            `${this.logPrefix()} Using cached charging station configuration due to file read error`
          )
          return this.sharedLRUCache.getChargingStationConfiguration(this.configurationFileHash)
        }
      }
    }
    return configuration
  }

  private getConfiguredSupervisionUrl (): URL {
    let configuredSupervisionUrl: string | undefined
    const supervisionUrls = this.stationInfo?.supervisionUrls ?? Configuration.getSupervisionUrls()
    if (isNotEmptyArray(supervisionUrls)) {
      let configuredSupervisionUrlIndex: number
      switch (Configuration.getSupervisionUrlDistribution()) {
        case SupervisionUrlDistribution.RANDOM:
          configuredSupervisionUrlIndex = Math.floor(secureRandom() * supervisionUrls.length)
          break
        case SupervisionUrlDistribution.CHARGING_STATION_AFFINITY:
        case SupervisionUrlDistribution.ROUND_ROBIN:
        default:
          !Object.values(SupervisionUrlDistribution).includes(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            Configuration.getSupervisionUrlDistribution()!
          ) &&
            logger.warn(
              // eslint-disable-next-line @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-base-to-string
              `${this.logPrefix()} Unknown supervision url distribution '${Configuration.getSupervisionUrlDistribution()}' in configuration from values '${SupervisionUrlDistribution.toString()}', defaulting to '${
                SupervisionUrlDistribution.CHARGING_STATION_AFFINITY
              }'`
            )
          configuredSupervisionUrlIndex = (this.index - 1) % supervisionUrls.length
          break
      }
      configuredSupervisionUrl = supervisionUrls[configuredSupervisionUrlIndex]
    } else if (typeof supervisionUrls === 'string') {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      configuredSupervisionUrl = supervisionUrls!
    }
    if (isNotEmptyString(configuredSupervisionUrl)) {
      return new URL(configuredSupervisionUrl)
    }
    const errorMsg = 'No supervision url(s) configured'
    logger.error(`${this.logPrefix()} ${errorMsg}`)
    throw new BaseError(errorMsg)
  }

  private getCurrentOutType (stationInfo?: ChargingStationInfo): CurrentType {
    return (
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      (stationInfo ?? this.stationInfo!).currentOutType ??
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      Constants.DEFAULT_STATION_INFO.currentOutType!
    )
  }

  private getEnergyActiveImportRegister (
    connectorStatus: ConnectorStatus | undefined,
    rounded = false
  ): number {
    if (this.stationInfo?.meteringPerTransaction === true) {
      return (
        (rounded
          ? connectorStatus?.transactionEnergyActiveImportRegisterValue != null
            ? Math.round(connectorStatus.transactionEnergyActiveImportRegisterValue)
            : undefined
          : connectorStatus?.transactionEnergyActiveImportRegisterValue) ?? 0
      )
    }
    return (
      (rounded
        ? connectorStatus?.energyActiveImportRegisterValue != null
          ? Math.round(connectorStatus.energyActiveImportRegisterValue)
          : undefined
        : connectorStatus?.energyActiveImportRegisterValue) ?? 0
    )
  }

  private getMaximumAmperage (stationInfo?: ChargingStationInfo): number | undefined {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const maximumPower = (stationInfo ?? this.stationInfo!).maximumPower!
    switch (this.getCurrentOutType(stationInfo)) {
      case CurrentType.AC:
        return ACElectricUtils.amperagePerPhaseFromPower(
          this.getNumberOfPhases(stationInfo),
          maximumPower / (this.hasEvses ? this.getNumberOfEvses() : this.getNumberOfConnectors()),
          this.getVoltageOut(stationInfo)
        )
      case CurrentType.DC:
        return DCElectricUtils.amperage(maximumPower, this.getVoltageOut(stationInfo))
    }
  }

  private getNumberOfReservableConnectors (): number {
    let numberOfReservableConnectors = 0
    if (this.hasEvses) {
      for (const evseStatus of this.evses.values()) {
        numberOfReservableConnectors += getNumberOfReservableConnectors(evseStatus.connectors)
      }
    } else {
      numberOfReservableConnectors = getNumberOfReservableConnectors(this.connectors)
    }
    return numberOfReservableConnectors - this.getNumberOfReservationsOnConnectorZero()
  }

  private getNumberOfReservationsOnConnectorZero (): number {
    if (
      (this.hasEvses && this.evses.get(0)?.connectors.get(0)?.reservation != null) ||
      (!this.hasEvses && this.connectors.get(0)?.reservation != null)
    ) {
      return 1
    }
    return 0
  }

  private getOcppConfiguration (
    ocppPersistentConfiguration: boolean | undefined = this.stationInfo?.ocppPersistentConfiguration
  ): ChargingStationOcppConfiguration | undefined {
    let ocppConfiguration: ChargingStationOcppConfiguration | undefined =
      this.getOcppConfigurationFromFile(ocppPersistentConfiguration)
    ocppConfiguration ??= this.getOcppConfigurationFromTemplate()
    return ocppConfiguration
  }

  private getOcppConfigurationFromFile (
    ocppPersistentConfiguration?: boolean
  ): ChargingStationOcppConfiguration | undefined {
    const configurationKey = this.getConfigurationFromFile()?.configurationKey
    if (ocppPersistentConfiguration && Array.isArray(configurationKey)) {
      return { configurationKey }
    }
    return undefined
  }

  private getOcppConfigurationFromTemplate (): ChargingStationOcppConfiguration | undefined {
    return this.getTemplateFromFile()?.Configuration
  }

  private getPowerDivider (): number {
    let powerDivider = this.hasEvses ? this.getNumberOfEvses() : this.getNumberOfConnectors()
    if (this.stationInfo?.powerSharedByConnectors === true) {
      powerDivider = this.getNumberOfRunningTransactions()
    }
    return powerDivider
  }

  private getStationInfo (options?: ChargingStationOptions): ChargingStationInfo {
    const stationInfoFromTemplate = this.getStationInfoFromTemplate()
    options?.persistentConfiguration != null &&
      (stationInfoFromTemplate.stationInfoPersistentConfiguration = options.persistentConfiguration)
    const stationInfoFromFile = this.getStationInfoFromFile(
      stationInfoFromTemplate.stationInfoPersistentConfiguration
    )
    let stationInfo: ChargingStationInfo
    // Priority:
    // 1. charging station info from template
    // 2. charging station info from configuration file
    if (
      stationInfoFromFile != null &&
      stationInfoFromFile.templateHash === stationInfoFromTemplate.templateHash
    ) {
      stationInfo = stationInfoFromFile
    } else {
      stationInfo = stationInfoFromTemplate
      stationInfoFromFile != null &&
        propagateSerialNumber(this.getTemplateFromFile(), stationInfoFromFile, stationInfo)
    }
    return setChargingStationOptions(
      mergeDeepRight<ChargingStationInfo, ChargingStationInfo>(
        Constants.DEFAULT_STATION_INFO as ChargingStationInfo,
        stationInfo
      ),
      options
    )
  }

  private getStationInfoFromFile (
    stationInfoPersistentConfiguration: boolean | undefined = Constants.DEFAULT_STATION_INFO
      .stationInfoPersistentConfiguration
  ): ChargingStationInfo | undefined {
    let stationInfo: ChargingStationInfo | undefined
    if (stationInfoPersistentConfiguration) {
      stationInfo = this.getConfigurationFromFile()?.stationInfo
      if (stationInfo != null) {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        delete stationInfo.infoHash
        delete (stationInfo as ChargingStationTemplate).numberOfConnectors
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        stationInfo.templateIndex ??= this.index
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        stationInfo.templateName ??= buildTemplateName(this.templateFile)
      }
    }
    return stationInfo
  }

  private getStationInfoFromTemplate (): ChargingStationInfo {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const stationTemplate = this.getTemplateFromFile()!
    checkTemplate(stationTemplate, this.logPrefix(), this.templateFile)
    const warnTemplateKeysDeprecationOnce = once(warnTemplateKeysDeprecation)
    warnTemplateKeysDeprecationOnce(stationTemplate, this.logPrefix(), this.templateFile)
    if (stationTemplate.Connectors != null) {
      checkConnectorsConfiguration(stationTemplate, this.logPrefix(), this.templateFile)
    }
    if (stationTemplate.Evses != null) {
      checkEvsesConfiguration(stationTemplate, this.logPrefix(), this.templateFile)
    }
    const stationInfo = stationTemplateToStationInfo(stationTemplate)
    stationInfo.hashId = getHashId(this.index, stationTemplate)
    stationInfo.templateIndex = this.index
    stationInfo.templateName = buildTemplateName(this.templateFile)
    stationInfo.chargingStationId = getChargingStationId(this.index, stationTemplate)
    createSerialNumber(stationTemplate, stationInfo)
    stationInfo.voltageOut = this.getVoltageOut(stationInfo)
    if (isNotEmptyArray<number>(stationTemplate.power)) {
      const powerArrayRandomIndex = Math.floor(secureRandom() * stationTemplate.power.length)
      stationInfo.maximumPower =
        stationTemplate.powerUnit === PowerUnits.KILO_WATT
          ? stationTemplate.power[powerArrayRandomIndex] * 1000
          : stationTemplate.power[powerArrayRandomIndex]
    } else if (typeof stationTemplate.power === 'number') {
      stationInfo.maximumPower =
        stationTemplate.powerUnit === PowerUnits.KILO_WATT
          ? stationTemplate.power * 1000
          : stationTemplate.power
    }
    stationInfo.maximumAmperage = this.getMaximumAmperage(stationInfo)
    if (
      isNotEmptyString(stationInfo.firmwareVersionPattern) &&
      isNotEmptyString(stationInfo.firmwareVersion) &&
      !new RegExp(stationInfo.firmwareVersionPattern).test(stationInfo.firmwareVersion)
    ) {
      logger.warn(
        `${this.logPrefix()} Firmware version '${stationInfo.firmwareVersion}' in template file ${
          this.templateFile
        } does not match firmware version pattern '${stationInfo.firmwareVersionPattern}'`
      )
    }
    if (stationTemplate.resetTime != null) {
      stationInfo.resetTime = secondsToMilliseconds(stationTemplate.resetTime)
    }
    return stationInfo
  }

  private getTemplateFromFile (): ChargingStationTemplate | undefined {
    let template: ChargingStationTemplate | undefined
    try {
      if (this.sharedLRUCache.hasChargingStationTemplate(this.templateFileHash)) {
        template = this.sharedLRUCache.getChargingStationTemplate(this.templateFileHash)
      } else {
        const measureId = `${FileType.ChargingStationTemplate} read`
        const beginId = PerformanceStatistics.beginMeasure(measureId)
        template = JSON.parse(readFileSync(this.templateFile, 'utf8')) as ChargingStationTemplate
        PerformanceStatistics.endMeasure(measureId, beginId)
        template.templateHash = hash(
          Constants.DEFAULT_HASH_ALGORITHM,
          JSON.stringify(template),
          'hex'
        )
        this.sharedLRUCache.setChargingStationTemplate(template)
        this.templateFileHash = template.templateHash
      }
    } catch (error) {
      handleFileException(
        this.templateFile,
        FileType.ChargingStationTemplate,
        ensureError(error),
        this.logPrefix()
      )
    }
    return template
  }

  private getUseConnectorId0 (stationTemplate?: ChargingStationTemplate): boolean {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return stationTemplate?.useConnectorId0 ?? Constants.DEFAULT_STATION_INFO.useConnectorId0!
  }

  private handleErrorMessage (errorResponse: ErrorResponse): void {
    const [messageType, messageId, errorType, errorMessage, errorDetails] = errorResponse
    if (!this.requests.has(messageId)) {
      // Error
      throw new OCPPError(
        ErrorType.INTERNAL_ERROR,
        `Error response for unknown message id '${messageId}'`,
        undefined,
        { errorDetails, errorMessage, errorType }
      )
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const [, errorCallback, requestCommandName] = this.getCachedRequest(messageType, messageId)!
    logger.debug(
      `${this.logPrefix()} << Command '${requestCommandName}' received error response payload: ${JSON.stringify(
        errorResponse
      )}`
    )
    errorCallback(new OCPPError(errorType, errorMessage, requestCommandName, errorDetails))
  }

  private async handleIncomingMessage (request: IncomingRequest): Promise<void> {
    const [messageType, messageId, commandName, commandPayload] = request
    if (this.requests.has(messageId)) {
      throw new OCPPError(
        ErrorType.SECURITY_ERROR,
        `Received message with duplicate message id '${messageId}'`,
        commandName,
        commandPayload
      )
    }
    if (this.stationInfo?.enableStatistics === true) {
      this.performanceStatistics?.addRequestStatistic(commandName, messageType)
    }
    logger.debug(
      `${this.logPrefix()} << Command '${commandName}' received request payload: ${JSON.stringify(
        request
      )}`
    )
    // Process the message
    await this.ocppIncomingRequestService.incomingRequestHandler(
      this,
      messageId,
      commandName,
      commandPayload
    )
    this.emitChargingStationEvent(ChargingStationEvents.updated)
  }

  private handleResponseMessage (response: Response): void {
    const [messageType, messageId, commandPayload] = response
    if (!this.requests.has(messageId)) {
      // Error
      throw new OCPPError(
        ErrorType.INTERNAL_ERROR,
        `Response for unknown message id '${messageId}'`,
        undefined,
        commandPayload
      )
    }
    // Respond
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const [responseCallback, , requestCommandName, requestPayload] = this.getCachedRequest(
      messageType,
      messageId
    )!
    logger.debug(
      `${this.logPrefix()} << Command '${requestCommandName}' received response payload: ${JSON.stringify(
        response
      )}`
    )
    responseCallback(commandPayload, requestPayload)
  }

  private handleUnsupportedVersion (version: OCPPVersion | undefined): void {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    const errorMsg = `Unsupported protocol version '${version}' configured in template file ${this.templateFile}`
    logger.error(`${this.logPrefix()} ${errorMsg}`)
    throw new BaseError(errorMsg)
  }

  private initialize (options?: ChargingStationOptions): void {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const stationTemplate = this.getTemplateFromFile()!
    checkTemplate(stationTemplate, this.logPrefix(), this.templateFile)
    this.configurationFile = join(
      dirname(this.templateFile.replace('station-templates', 'configurations')),
      `${getHashId(this.index, stationTemplate)}.json`
    )
    const stationConfiguration = this.getConfigurationFromFile()
    if (
      stationConfiguration?.stationInfo?.templateHash === stationTemplate.templateHash &&
      (stationConfiguration?.connectorsStatus != null || stationConfiguration?.evsesStatus != null)
    ) {
      checkConfiguration(stationConfiguration, this.logPrefix(), this.configurationFile)
      this.initializeConnectorsOrEvsesFromFile(stationConfiguration)
    } else {
      this.initializeConnectorsOrEvsesFromTemplate(stationTemplate)
    }
    this.stationInfo = this.getStationInfo(options)
    validateStationInfo(this)
    if (
      this.stationInfo.firmwareStatus === FirmwareStatus.Installing &&
      isNotEmptyString(this.stationInfo.firmwareVersionPattern) &&
      isNotEmptyString(this.stationInfo.firmwareVersion)
    ) {
      const patternGroup =
        this.stationInfo.firmwareUpgrade?.versionUpgrade?.patternGroup ??
        this.stationInfo.firmwareVersion.split('.').length
      const match = new RegExp(this.stationInfo.firmwareVersionPattern)
        .exec(this.stationInfo.firmwareVersion)
        ?.slice(1, patternGroup + 1)
      if (match != null) {
        const patchLevelIndex = match.length - 1
        match[patchLevelIndex] = (
          convertToInt(match[patchLevelIndex]) +
          (this.stationInfo.firmwareUpgrade?.versionUpgrade?.step ?? 1)
        ).toString()
        this.stationInfo.firmwareVersion = match.join('.')
      }
    }
    this.saveStationInfo()
    this.configuredSupervisionUrl = this.getConfiguredSupervisionUrl()
    if (this.stationInfo.enableStatistics === true) {
      this.performanceStatistics = PerformanceStatistics.getInstance(
        this.stationInfo.hashId,
        this.stationInfo.chargingStationId,
        this.configuredSupervisionUrl
      )
    }
    const bootNotificationRequest = createBootNotificationRequest(this.stationInfo)
    if (bootNotificationRequest == null) {
      const errorMsg = 'Error while creating boot notification request'
      logger.error(`${this.logPrefix()} ${errorMsg}`)
      throw new BaseError(errorMsg)
    }
    this.bootNotificationRequest = bootNotificationRequest
    this.powerDivider = this.getPowerDivider()
    // OCPP configuration
    this.ocppConfiguration = this.getOcppConfiguration(options?.persistentConfiguration)
    this.initializeOcppConfiguration()
    this.initializeOcppServices()
    if (this.stationInfo.autoRegister === true) {
      this.bootNotificationResponse = {
        currentTime: new Date(),
        interval: millisecondsToSeconds(this.getHeartbeatInterval()),
        status: RegistrationStatusEnumType.ACCEPTED,
      }
    }
  }

  private initializeConnectorsFromTemplate (stationTemplate: ChargingStationTemplate): void {
    if (stationTemplate.Connectors == null && isEmpty(this.connectors)) {
      const errorMsg = `No already defined connectors and charging station information from template ${this.templateFile} with no connectors configuration defined`
      logger.error(`${this.logPrefix()} ${errorMsg}`)
      throw new BaseError(errorMsg)
    }
    if (stationTemplate.Connectors?.[0] == null) {
      logger.warn(
        `${this.logPrefix()} Charging station information from template ${
          this.templateFile
        } with no connector id 0 configuration`
      )
    }
    if (stationTemplate.Connectors != null) {
      const { configuredMaxConnectors, templateMaxAvailableConnectors, templateMaxConnectors } =
        checkConnectorsConfiguration(stationTemplate, this.logPrefix(), this.templateFile)
      const connectorsConfigHash = hash(
        Constants.DEFAULT_HASH_ALGORITHM,
        `${JSON.stringify(stationTemplate.Connectors)}${configuredMaxConnectors.toString()}`,
        'hex'
      )
      const connectorsConfigChanged =
        this.connectors.size !== 0 && this.connectorsConfigurationHash !== connectorsConfigHash
      if (isEmpty(this.connectors) || connectorsConfigChanged) {
        connectorsConfigChanged && this.connectors.clear()
        this.connectorsConfigurationHash = connectorsConfigHash
        if (templateMaxConnectors > 0) {
          for (let connectorId = 0; connectorId <= configuredMaxConnectors; connectorId++) {
            if (
              connectorId === 0 &&
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
              (stationTemplate.Connectors[connectorId] == null ||
                !this.getUseConnectorId0(stationTemplate))
            ) {
              continue
            }
            const templateConnectorId =
              connectorId > 0 && stationTemplate.randomConnectors === true
                ? randomInt(1, templateMaxAvailableConnectors + 1)
                : connectorId
            const connectorStatus = stationTemplate.Connectors[templateConnectorId]
            checkStationInfoConnectorStatus(
              templateConnectorId,
              connectorStatus,
              this.logPrefix(),
              this.templateFile
            )
            this.connectors.set(connectorId, clone<ConnectorStatus>(connectorStatus))
          }
          initializeConnectorsMapStatus(this.connectors, this.logPrefix())
          this.saveConnectorsStatus()
        } else {
          logger.warn(
            `${this.logPrefix()} Charging station information from template ${
              this.templateFile
            } with no connectors configuration defined, cannot create connectors`
          )
        }
      }
    } else {
      logger.warn(
        `${this.logPrefix()} Charging station information from template ${
          this.templateFile
        } with no connectors configuration defined, using already defined connectors`
      )
    }
  }

  private initializeConnectorsOrEvsesFromFile (configuration: ChargingStationConfiguration): void {
    if (configuration.connectorsStatus != null && configuration.evsesStatus == null) {
      const isTupleFormat =
        configuration.connectorsStatus.length > 0 &&
        Array.isArray(configuration.connectorsStatus[0])
      const entries: [number, ConnectorStatus][] = isTupleFormat
        ? (configuration.connectorsStatus as [number, ConnectorStatus][])
        : (configuration.connectorsStatus as ConnectorStatus[]).map((status, index) => [
            index,
            status,
          ])
      for (const [connectorId, connectorStatus] of entries) {
        this.connectors.set(
          connectorId,
          prepareConnectorStatus(clone<ConnectorStatus>(connectorStatus))
        )
      }
    } else if (configuration.evsesStatus != null && configuration.connectorsStatus == null) {
      const isTupleFormat =
        configuration.evsesStatus.length > 0 && Array.isArray(configuration.evsesStatus[0])
      const evseEntries: [number, EvseStatusConfiguration][] = isTupleFormat
        ? (configuration.evsesStatus as [number, EvseStatusConfiguration][])
        : (configuration.evsesStatus as EvseStatusConfiguration[]).map((status, index) => [
            index,
            status,
          ])
      for (const [evseId, evseStatusConfiguration] of evseEntries) {
        const evseStatus = clone<EvseStatusConfiguration>(evseStatusConfiguration)
        delete evseStatus.connectorsStatus
        const connIsTupleFormat =
          evseStatusConfiguration.connectorsStatus != null &&
          evseStatusConfiguration.connectorsStatus.length > 0 &&
          Array.isArray(evseStatusConfiguration.connectorsStatus[0])
        const connEntries: [number, ConnectorStatus][] = connIsTupleFormat
          ? (evseStatusConfiguration.connectorsStatus as [number, ConnectorStatus][])
          : ((evseStatusConfiguration.connectorsStatus ?? []) as ConnectorStatus[]).map(
              (status, index) => [index, status]
            )
        this.evses.set(evseId, {
          ...(evseStatus as EvseStatus),
          connectors: new Map<number, ConnectorStatus>(
            connEntries.map(([connectorId, connectorStatus]) => [
              connectorId,
              prepareConnectorStatus(connectorStatus),
            ])
          ),
        })
      }
    } else if (configuration.evsesStatus != null && configuration.connectorsStatus != null) {
      const errorMsg = `Connectors and evses defined at the same time in configuration file ${this.configurationFile}`
      logger.error(`${this.logPrefix()} ${errorMsg}`)
      throw new BaseError(errorMsg)
    } else {
      const errorMsg = `No connectors or evses defined in configuration file ${this.configurationFile}`
      logger.error(`${this.logPrefix()} ${errorMsg}`)
      throw new BaseError(errorMsg)
    }
  }

  private initializeConnectorsOrEvsesFromTemplate (stationTemplate: ChargingStationTemplate): void {
    if (stationTemplate.Connectors != null && stationTemplate.Evses == null) {
      this.initializeConnectorsFromTemplate(stationTemplate)
    } else if (stationTemplate.Evses != null && stationTemplate.Connectors == null) {
      this.initializeEvsesFromTemplate(stationTemplate)
    } else if (stationTemplate.Evses != null && stationTemplate.Connectors != null) {
      const errorMsg = `Connectors and evses defined at the same time in template file ${this.templateFile}`
      logger.error(`${this.logPrefix()} ${errorMsg}`)
      throw new BaseError(errorMsg)
    } else {
      const errorMsg = `No connectors or evses defined in template file ${this.templateFile}`
      logger.error(`${this.logPrefix()} ${errorMsg}`)
      throw new BaseError(errorMsg)
    }
  }

  private initializeEvsesFromTemplate (stationTemplate: ChargingStationTemplate): void {
    if (stationTemplate.Evses == null && isEmpty(this.evses)) {
      const errorMsg = `No already defined evses and charging station information from template ${this.templateFile} with no evses configuration defined`
      logger.error(`${this.logPrefix()} ${errorMsg}`)
      throw new BaseError(errorMsg)
    }
    if (stationTemplate.Evses?.[0] == null) {
      logger.warn(
        `${this.logPrefix()} Charging station information from template ${
          this.templateFile
        } with no evse id 0 configuration`
      )
    }
    if (stationTemplate.Evses?.[0]?.Connectors[0] == null) {
      logger.warn(
        `${this.logPrefix()} Charging station information from template ${
          this.templateFile
        } with evse id 0 with no connector id 0 configuration`
      )
    }
    if (Object.keys(stationTemplate.Evses?.[0]?.Connectors as object).length > 1) {
      logger.warn(
        `${this.logPrefix()} Charging station information from template ${
          this.templateFile
        } with evse id 0 with more than one connector configuration, only connector id 0 configuration will be used`
      )
    }
    if (stationTemplate.Evses != null) {
      const evsesConfigHash = hash(
        Constants.DEFAULT_HASH_ALGORITHM,
        JSON.stringify(stationTemplate.Evses),
        'hex'
      )
      const evsesConfigChanged =
        this.evses.size !== 0 && this.evsesConfigurationHash !== evsesConfigHash
      if (isEmpty(this.evses) || evsesConfigChanged) {
        evsesConfigChanged && this.evses.clear()
        this.evsesConfigurationHash = evsesConfigHash
        const templateMaxEvses = getMaxNumberOfEvses(stationTemplate.Evses)
        if (templateMaxEvses > 0) {
          for (const evseKey in stationTemplate.Evses) {
            const evseId = convertToInt(evseKey)
            const evseStatus: EvseStatus = {
              availability: AvailabilityType.Operative,
              connectors: buildConnectorsMap(
                stationTemplate.Evses[evseKey].Connectors,
                this.logPrefix(),
                this.templateFile
              ),
            }
            this.evses.set(evseId, evseStatus)
            initializeConnectorsMapStatus(evseStatus.connectors, this.logPrefix())
          }
          this.saveEvsesStatus()
        } else {
          logger.warn(
            `${this.logPrefix()} Charging station information from template ${
              this.templateFile
            } with no evses configuration defined, cannot create evses`
          )
        }
      }
    } else {
      logger.warn(
        `${this.logPrefix()} Charging station information from template ${
          this.templateFile
        } with no evses configuration defined, using already defined evses`
      )
    }
  }

  private initializeOcppConfiguration (): void {
    if (getConfigurationKey(this, StandardParametersKey.HeartbeatInterval) == null) {
      addConfigurationKey(this, StandardParametersKey.HeartbeatInterval, '0')
    }
    if (getConfigurationKey(this, StandardParametersKey.HeartBeatInterval) == null) {
      addConfigurationKey(this, StandardParametersKey.HeartBeatInterval, '0', {
        visible: false,
      })
    }
    if (
      this.stationInfo?.supervisionUrlOcppConfiguration === true &&
      isNotEmptyString(this.stationInfo.supervisionUrlOcppKey) &&
      getConfigurationKey(this, this.stationInfo.supervisionUrlOcppKey) == null
    ) {
      addConfigurationKey(
        this,
        this.stationInfo.supervisionUrlOcppKey,
        this.configuredSupervisionUrl.href,
        { reboot: true }
      )
    } else if (
      this.stationInfo?.supervisionUrlOcppConfiguration === false &&
      isNotEmptyString(this.stationInfo.supervisionUrlOcppKey) &&
      getConfigurationKey(this, this.stationInfo.supervisionUrlOcppKey) != null
    ) {
      deleteConfigurationKey(this, this.stationInfo.supervisionUrlOcppKey, {
        save: false,
      })
    }
    if (
      isNotEmptyString(this.stationInfo?.amperageLimitationOcppKey) &&
      getConfigurationKey(this, this.stationInfo.amperageLimitationOcppKey) == null
    ) {
      addConfigurationKey(
        this,
        this.stationInfo.amperageLimitationOcppKey,
        // prettier-ignore
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        (this.stationInfo.maximumAmperage! * getAmperageLimitationUnitDivider(this.stationInfo)).toString()
      )
    }
    if (getConfigurationKey(this, StandardParametersKey.SupportedFeatureProfiles) == null) {
      addConfigurationKey(
        this,
        StandardParametersKey.SupportedFeatureProfiles,
        `${SupportedFeatureProfiles.Core},${SupportedFeatureProfiles.FirmwareManagement},${SupportedFeatureProfiles.LocalAuthListManagement},${SupportedFeatureProfiles.SmartCharging},${SupportedFeatureProfiles.RemoteTrigger}`
      )
    }
    addConfigurationKey(
      this,
      StandardParametersKey.NumberOfConnectors,
      this.getNumberOfConnectors().toString(),
      { readonly: true },
      { overwrite: true }
    )
    if (getConfigurationKey(this, StandardParametersKey.MeterValuesSampledData) == null) {
      addConfigurationKey(
        this,
        StandardParametersKey.MeterValuesSampledData,
        MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      )
    }
    if (getConfigurationKey(this, StandardParametersKey.ConnectorPhaseRotation) == null) {
      const connectorsPhaseRotation: string[] = []
      if (this.hasEvses) {
        for (const evseStatus of this.evses.values()) {
          for (const connectorId of evseStatus.connectors.keys()) {
            connectorsPhaseRotation.push(
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              getPhaseRotationValue(connectorId, this.getNumberOfPhases())!
            )
          }
        }
      } else {
        for (const connectorId of this.connectors.keys()) {
          connectorsPhaseRotation.push(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            getPhaseRotationValue(connectorId, this.getNumberOfPhases())!
          )
        }
      }
      addConfigurationKey(
        this,
        StandardParametersKey.ConnectorPhaseRotation,
        connectorsPhaseRotation.toString()
      )
    }
    if (getConfigurationKey(this, StandardParametersKey.AuthorizeRemoteTxRequests) == null) {
      addConfigurationKey(this, StandardParametersKey.AuthorizeRemoteTxRequests, 'true')
    }
    if (
      getConfigurationKey(this, StandardParametersKey.LocalAuthListEnabled) == null &&
      hasFeatureProfile(this, SupportedFeatureProfiles.LocalAuthListManagement)
    ) {
      addConfigurationKey(this, StandardParametersKey.LocalAuthListEnabled, 'false')
    }
    if (getConfigurationKey(this, StandardParametersKey.ConnectionTimeOut) == null) {
      addConfigurationKey(
        this,
        StandardParametersKey.ConnectionTimeOut,
        Constants.DEFAULT_CONNECTION_TIMEOUT.toString()
      )
    }
    this.saveOcppConfiguration()
  }

  private initializeOcppServices (): void {
    const ocppVersion = this.stationInfo?.ocppVersion
    switch (ocppVersion) {
      case OCPPVersion.VERSION_16:
        this.ocppIncomingRequestService =
          OCPP16IncomingRequestService.getInstance<OCPP16IncomingRequestService>()
        this.ocppRequestService = OCPP16RequestService.getInstance<OCPP16RequestService>(
          OCPP16ResponseService.getInstance<OCPP16ResponseService>()
        )
        break
      case OCPPVersion.VERSION_20:
      case OCPPVersion.VERSION_201:
        this.ocppIncomingRequestService =
          OCPP20IncomingRequestService.getInstance<OCPP20IncomingRequestService>()
        this.ocppRequestService = OCPP20RequestService.getInstance<OCPP20RequestService>(
          OCPP20ResponseService.getInstance<OCPP20ResponseService>()
        )
        break
      default:
        this.handleUnsupportedVersion(ocppVersion)
        break
    }
  }

  private internalStopMessageSequence (): void {
    // Stop WebSocket ping
    this.stopWebSocketPing()
    // Stop heartbeat
    this.stopHeartbeat()
    // Stop the ATG
    if (this.automaticTransactionGenerator?.started === true) {
      this.stopAutomaticTransactionGenerator()
    }
  }

  private onClose (code: WebSocketCloseEventStatusCode, reason: Buffer): void {
    this.emitChargingStationEvent(ChargingStationEvents.disconnected)
    this.emitChargingStationEvent(ChargingStationEvents.updated)
    switch (code) {
      // Normal close
      case WebSocketCloseEventStatusCode.CLOSE_NO_STATUS:
      case WebSocketCloseEventStatusCode.CLOSE_NORMAL:
        logger.info(
          `${this.logPrefix()} WebSocket normally closed with status '${getWebSocketCloseEventStatusString(
            code
          )}' and reason '${reason.toString()}'`
        )
        this.wsConnectionRetryCount = 0
        break
      // Abnormal close
      default:
        logger.error(
          `${this.logPrefix()} WebSocket abnormally closed with status '${getWebSocketCloseEventStatusString(
            code
          )}' and reason '${reason.toString()}'`
        )
        this.started &&
          this.reconnect()
            .then(() => {
              this.emitChargingStationEvent(ChargingStationEvents.updated)
              return undefined
            })
            .catch((error: unknown) =>
              logger.error(`${this.logPrefix()} Error while reconnecting:`, error)
            )
        break
    }
  }

  private onError (error: WSError): void {
    this.closeWSConnection()
    logger.error(`${this.logPrefix()} WebSocket error:`, error)
  }

  private async onMessage (data: RawData): Promise<void> {
    let request: ErrorResponse | IncomingRequest | Response | undefined
    let messageType: MessageType | undefined
    let errorMsg: string
    try {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      request = JSON.parse(data.toString()) as ErrorResponse | IncomingRequest | Response
      if (Array.isArray(request)) {
        ;[messageType] = request
        // Check the type of message
        switch (messageType) {
          // Error Message
          case MessageType.CALL_ERROR_MESSAGE:
            this.handleErrorMessage(request as ErrorResponse)
            break
          // Incoming Message
          case MessageType.CALL_MESSAGE:
            await this.handleIncomingMessage(request as IncomingRequest)
            break
          // Response Message
          case MessageType.CALL_RESULT_MESSAGE:
            this.handleResponseMessage(request as Response)
            break
          // Unknown Message
          default:
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            errorMsg = `Wrong message type ${messageType}`
            logger.error(`${this.logPrefix()} ${errorMsg}`)
            throw new OCPPError(ErrorType.PROTOCOL_ERROR, errorMsg)
        }
      } else {
        throw new OCPPError(
          ErrorType.PROTOCOL_ERROR,
          'Incoming message is not an array',
          undefined,
          {
            request,
          }
        )
      }
    } catch (error) {
      if (!Array.isArray(request)) {
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        logger.error(`${this.logPrefix()} Incoming message '${request}' parsing error:`, error)
        return
      }
      let commandName: IncomingRequestCommand | undefined
      let requestCommandName: IncomingRequestCommand | RequestCommand | undefined
      let errorCallback: ErrorCallback
      const [, messageId] = request
      const ocppError =
        error instanceof OCPPError
          ? error
          : new OCPPError(ErrorType.INTERNAL_ERROR, getErrorMessage(error))
      switch (messageType) {
        case MessageType.CALL_ERROR_MESSAGE:
        case MessageType.CALL_RESULT_MESSAGE:
          if (this.requests.has(messageId)) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            ;[, errorCallback, requestCommandName] = this.getCachedRequest(messageType, messageId)!
            // Reject the deferred promise in case of error at response handling (rejecting an already fulfilled promise is a no-op)
            errorCallback(ocppError, false)
          } else {
            // Remove the request from the cache in case of error at response handling
            this.requests.delete(messageId)
          }
          break
        case MessageType.CALL_MESSAGE:
          ;[, , commandName] = request as IncomingRequest
          // Send error
          await this.ocppRequestService.sendError(this, messageId, ocppError, commandName)
          break
      }
      if (!(error instanceof OCPPError)) {
        logger.warn(
          `${this.logPrefix()} Error thrown at incoming OCPP command ${
            commandName ?? requestCommandName ?? Constants.UNKNOWN_OCPP_COMMAND
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
          } message '${data.toString()}' handling is not an OCPPError:`,
          error
        )
      }
      logger.error(
        `${this.logPrefix()} Incoming OCPP command '${
          commandName ?? requestCommandName ?? Constants.UNKNOWN_OCPP_COMMAND
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
        }' message '${data.toString()}'${
          this.requests.has(messageId)
            ? ` matching cached request '${JSON.stringify(
                this.getCachedRequest(messageType, messageId)
              )}'`
            : ''
        } processing error:`,
        error
      )
    }
  }

  private async onOpen (): Promise<void> {
    if (this.isWebSocketConnectionOpened()) {
      this.emitChargingStationEvent(ChargingStationEvents.connected)
      this.emitChargingStationEvent(ChargingStationEvents.updated)
      logger.info(
        `${this.logPrefix()} Connection to OCPP server through ${
          this.wsConnectionUrl.href
        } succeeded`
      )
      let registrationRetryCount = 0
      if (!this.inAcceptedState()) {
        // Send BootNotification
        do {
          await this.ocppRequestService.requestHandler<
            BootNotificationRequest,
            BootNotificationResponse
          >(this, RequestCommand.BOOT_NOTIFICATION, this.bootNotificationRequest, {
            skipBufferingOnError: true,
          })
          if (this.bootNotificationResponse != null) {
            this.bootNotificationResponse.currentTime =
              convertToDate(this.bootNotificationResponse.currentTime) ?? new Date()
          }
          if (!this.inAcceptedState()) {
            ++registrationRetryCount
            await sleep(
              exponentialDelay(
                registrationRetryCount,
                this.bootNotificationResponse?.interval != null
                  ? secondsToMilliseconds(this.bootNotificationResponse.interval)
                  : Constants.DEFAULT_BOOT_NOTIFICATION_INTERVAL
              )
            )
          }
        } while (
          !this.inAcceptedState() &&
          (this.stationInfo?.registrationMaxRetries === -1 ||
            registrationRetryCount <= (this.stationInfo?.registrationMaxRetries ?? 0))
        )
      }
      if (!this.inAcceptedState()) {
        logger.error(
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `${this.logPrefix()} Registration failure: maximum retries reached (${registrationRetryCount.toString()}) or retry disabled (${this.stationInfo?.registrationMaxRetries?.toString()})`
        )
      } else {
        await flushQueuedTransactionMessages(this)
      }
      this.emitChargingStationEvent(ChargingStationEvents.updated)
    } else {
      logger.warn(
        `${this.logPrefix()} Connection to OCPP server through ${this.wsConnectionUrl.href} failed`
      )
    }
  }

  private onPing (): void {
    logger.debug(`${this.logPrefix()} Received a WS ping (rfc6455) from the server`)
  }

  private onPong (): void {
    logger.debug(`${this.logPrefix()} Received a WS pong (rfc6455) from the server`)
  }

  private async reconnect (): Promise<void> {
    if (
      this.stationInfo?.autoReconnectMaxRetries === -1 ||
      this.wsConnectionRetryCount < (this.stationInfo?.autoReconnectMaxRetries ?? 0)
    ) {
      ++this.wsConnectionRetryCount
      const reconnectDelay =
        this.stationInfo?.reconnectExponentialDelay === true
          ? exponentialDelay(this.wsConnectionRetryCount)
          : secondsToMilliseconds(this.getConnectionTimeout())
      const reconnectDelayWithdraw = 1000
      const reconnectTimeout =
        reconnectDelay - reconnectDelayWithdraw > 0 ? reconnectDelay - reconnectDelayWithdraw : 0
      logger.error(
        `${this.logPrefix()} WebSocket connection retry in ${roundTo(
          reconnectDelay,
          2
        ).toString()}ms, timeout ${reconnectTimeout.toString()}ms`
      )
      await sleep(reconnectDelay)
      logger.error(
        `${this.logPrefix()} WebSocket connection retry #${this.wsConnectionRetryCount.toString()}`
      )
      this.openWSConnection(
        {
          handshakeTimeout: reconnectTimeout,
        },
        { closeOpened: true }
      )
    } else if (this.stationInfo?.autoReconnectMaxRetries !== -1) {
      logger.error(
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `${this.logPrefix()} WebSocket connection retries failure: maximum retries reached (${this.wsConnectionRetryCount.toString()}) or retries disabled (${this.stationInfo?.autoReconnectMaxRetries?.toString()})`
      )
    }
  }

  private saveAutomaticTransactionGeneratorConfiguration (): void {
    if (this.stationInfo?.automaticTransactionGeneratorPersistentConfiguration === true) {
      this.saveConfiguration()
    }
  }

  private saveConfiguration (): void {
    if (isNotEmptyString(this.configurationFile)) {
      try {
        if (!existsSync(dirname(this.configurationFile))) {
          mkdirSync(dirname(this.configurationFile), { recursive: true })
        }
        const configurationFromFile = this.getConfigurationFromFile()
        let configurationData: ChargingStationConfiguration =
          configurationFromFile != null
            ? clone<ChargingStationConfiguration>(configurationFromFile)
            : {}
        if (this.stationInfo?.stationInfoPersistentConfiguration === true) {
          configurationData.stationInfo = this.stationInfo
        } else {
          delete configurationData.stationInfo
        }
        if (
          this.stationInfo?.ocppPersistentConfiguration === true &&
          Array.isArray(this.ocppConfiguration?.configurationKey)
        ) {
          configurationData.configurationKey = this.ocppConfiguration.configurationKey
        } else {
          delete configurationData.configurationKey
        }
        configurationData = mergeDeepRight<
          ChargingStationConfiguration,
          Partial<ChargingStationConfiguration>
        >(
          configurationData,
          buildChargingStationAutomaticTransactionGeneratorConfiguration(
            this
          ) as Partial<ChargingStationConfiguration>
        )
        if (this.stationInfo?.automaticTransactionGeneratorPersistentConfiguration !== true) {
          delete configurationData.automaticTransactionGenerator
        }
        if (this.connectors.size > 0) {
          configurationData.connectorsStatus = buildConnectorsStatus(this)
        } else {
          delete configurationData.connectorsStatus
        }
        if (this.evses.size > 0) {
          configurationData.evsesStatus = buildEvsesStatus(this)
        } else {
          delete configurationData.evsesStatus
        }
        delete configurationData.configurationHash
        const configurationHash = hash(
          Constants.DEFAULT_HASH_ALGORITHM,
          JSON.stringify({
            automaticTransactionGenerator: configurationData.automaticTransactionGenerator,
            configurationKey: configurationData.configurationKey,
            stationInfo: configurationData.stationInfo,
            ...(this.connectors.size > 0 && {
              connectorsStatus: configurationData.connectorsStatus,
            }),
            ...(this.evses.size > 0 && {
              evsesStatus: configurationData.evsesStatus,
            }),
          } satisfies ChargingStationConfiguration),
          'hex'
        )
        if (this.configurationFileHash !== configurationHash) {
          AsyncLock.runExclusive(AsyncLockType.configuration, () => {
            configurationData.configurationHash = configurationHash
            const measureId = `${FileType.ChargingStationConfiguration} write`
            const beginId = PerformanceStatistics.beginMeasure(measureId)
            writeFileSync(
              this.configurationFile,
              JSON.stringify(configurationData, undefined, 2),
              'utf8'
            )
            PerformanceStatistics.endMeasure(measureId, beginId)
            this.sharedLRUCache.deleteChargingStationConfiguration(this.configurationFileHash)
            this.sharedLRUCache.setChargingStationConfiguration(configurationData)
            this.configurationFileHash = configurationHash
          }).catch((error: unknown) => {
            handleFileException(
              this.configurationFile,
              FileType.ChargingStationConfiguration,
              ensureError(error),
              this.logPrefix()
            )
          })
        } else {
          logger.debug(
            `${this.logPrefix()} Not saving unchanged charging station configuration file ${
              this.configurationFile
            }`
          )
        }
      } catch (error) {
        handleFileException(
          this.configurationFile,
          FileType.ChargingStationConfiguration,
          ensureError(error),
          this.logPrefix()
        )
      }
    } else {
      logger.error(
        `${this.logPrefix()} Trying to save charging station configuration to undefined configuration file`
      )
    }
  }

  private saveConnectorsStatus (): void {
    this.saveConfiguration()
  }

  private saveEvsesStatus (): void {
    this.saveConfiguration()
  }

  private saveStationInfo (): void {
    if (this.stationInfo?.stationInfoPersistentConfiguration === true) {
      this.saveConfiguration()
    }
  }

  private readonly sendMessageBuffer = (
    onCompleteCallback: () => void,
    messageIdx?: number
  ): void => {
    if (this.messageQueue.length > 0) {
      const message = this.messageQueue[0]
      let beginId: string | undefined
      let commandName: RequestCommand | undefined
      let parsedMessage: ErrorResponse | OutgoingRequest | Response
      messageIdx ??= 0
      try {
        parsedMessage = JSON.parse(message) as ErrorResponse | OutgoingRequest | Response
      } catch (error) {
        logger.error(
          `${this.logPrefix()} Error while parsing buffered OCPP message '${message}' to JSON:`,
          error
        )
        this.messageQueue.shift()
        this.sendMessageBuffer(onCompleteCallback, messageIdx)
        return
      }
      const [messageType] = parsedMessage
      const isRequest = messageType === MessageType.CALL_MESSAGE
      if (isRequest) {
        ;[, , commandName] = parsedMessage as OutgoingRequest
        beginId = PerformanceStatistics.beginMeasure(commandName)
      }
      this.wsConnection?.send(message, (error?: Error) => {
        if (isRequest && commandName != null && beginId != null) {
          PerformanceStatistics.endMeasure(commandName, beginId)
        }
        if (error == null) {
          logger.debug(
            `${this.logPrefix()} >> Buffered ${getMessageTypeString(messageType)} OCPP message sent '${message}'`
          )
          this.messageQueue.shift()
        } else {
          logger.error(
            `${this.logPrefix()} Error while sending buffered ${getMessageTypeString(messageType)} OCPP message '${message}':`,
            error
          )
        }
        // eslint-disable-next-line promise/no-promise-in-callback
        sleep(exponentialDelay(messageIdx))
          .then(() => {
            if (messageIdx != null) {
              ++messageIdx
            }
            this.sendMessageBuffer(onCompleteCallback, messageIdx)
            return undefined
          })
          .catch((error: unknown) => {
            throw error
          })
      })
    } else {
      onCompleteCallback()
    }
  }

  private setIntervalFlushMessageBuffer (): void {
    this.flushMessageBufferSetInterval ??= setInterval(() => {
      if (this.isWebSocketConnectionOpened() && this.inAcceptedState()) {
        this.flushMessageBuffer()
      }
      if (!this.isWebSocketConnectionOpened() || isEmpty(this.messageQueue)) {
        this.clearIntervalFlushMessageBuffer()
      }
    }, Constants.DEFAULT_MESSAGE_BUFFER_FLUSH_INTERVAL)
  }

  private async startMessageSequence (ATGStopAbsoluteDuration?: boolean): Promise<void> {
    if (this.stationInfo?.autoRegister === true) {
      await this.ocppRequestService.requestHandler<
        BootNotificationRequest,
        BootNotificationResponse
      >(this, RequestCommand.BOOT_NOTIFICATION, this.bootNotificationRequest, {
        skipBufferingOnError: true,
      })
    }
    // Start WebSocket ping
    if (this.wsPingSetInterval == null) {
      this.startWebSocketPing()
    }
    // Start heartbeat
    if (this.heartbeatSetInterval == null) {
      this.startHeartbeat()
    }
    // Initialize connectors status
    if (this.hasEvses) {
      for (const [evseId, evseStatus] of this.evses) {
        if (evseId > 0) {
          for (const [connectorId, connectorStatus] of evseStatus.connectors) {
            await sendAndSetConnectorStatus(this, {
              connectorId,
              evseId,
              status: getBootConnectorStatus(this, connectorId, connectorStatus),
            } as unknown as StatusNotificationRequest)
          }
        }
      }
    } else {
      for (const connectorId of this.connectors.keys()) {
        if (connectorId > 0) {
          const connectorStatus = this.getConnectorStatus(connectorId)
          if (connectorStatus == null) {
            logger.error(
              `${this.logPrefix()} No connector ${connectorId.toString()} status found during message sequence start`
            )
            continue
          }
          await sendAndSetConnectorStatus(this, {
            connectorId,
            status: getBootConnectorStatus(this, connectorId, connectorStatus),
          } as unknown as StatusNotificationRequest)
        }
      }
    }
    if (this.stationInfo?.firmwareStatus === FirmwareStatus.Installing) {
      await this.ocppRequestService.requestHandler<
        FirmwareStatusNotificationRequest,
        FirmwareStatusNotificationResponse
      >(this, RequestCommand.FIRMWARE_STATUS_NOTIFICATION, {
        status: FirmwareStatus.Installed,
      })
      this.stationInfo.firmwareStatus = FirmwareStatus.Installed
    }

    // Start the ATG
    if (this.getAutomaticTransactionGeneratorConfiguration()?.enable === true) {
      this.startAutomaticTransactionGenerator(undefined, ATGStopAbsoluteDuration)
    }
    this.flushMessageBuffer()
  }

  private startWebSocketPing (): void {
    const webSocketPingInterval = this.getWebSocketPingInterval()
    if (webSocketPingInterval > 0 && this.wsPingSetInterval == null) {
      this.wsPingSetInterval = setInterval(
        () => {
          if (this.isWebSocketConnectionOpened()) {
            this.wsConnection?.ping()
          }
        },
        clampToSafeTimerValue(secondsToMilliseconds(webSocketPingInterval))
      )
      logger.info(
        `${this.logPrefix()} WebSocket ping started every ${formatDurationSeconds(
          webSocketPingInterval
        )}`
      )
    } else if (this.wsPingSetInterval != null) {
      logger.info(
        `${this.logPrefix()} WebSocket ping already started every ${formatDurationSeconds(
          webSocketPingInterval
        )}`
      )
    } else {
      logger.error(
        `${this.logPrefix()} WebSocket ping interval set to ${webSocketPingInterval.toString()}, not starting the WebSocket ping`
      )
    }
  }

  private stopHeartbeat (): void {
    if (this.heartbeatSetInterval != null) {
      clearInterval(this.heartbeatSetInterval)
      delete this.heartbeatSetInterval
    }
  }

  private async stopMessageSequence (
    reason?: StopTransactionReason,
    stopTransactions?: boolean
  ): Promise<void> {
    this.internalStopMessageSequence()
    // Stop ongoing transactions
    stopTransactions && (await stopRunningTransactions(this, reason))
    if (this.hasEvses) {
      for (const [evseId, evseStatus] of this.evses) {
        if (evseId > 0) {
          for (const [connectorId, connectorStatus] of evseStatus.connectors) {
            await sendAndSetConnectorStatus(this, {
              connectorId,
              evseId,
              status: ConnectorStatusEnum.Unavailable,
            } as unknown as StatusNotificationRequest)
            delete connectorStatus.status
          }
        }
      }
    } else {
      for (const connectorId of this.connectors.keys()) {
        if (connectorId > 0) {
          await sendAndSetConnectorStatus(this, {
            connectorId,
            status: ConnectorStatusEnum.Unavailable,
          } as unknown as StatusNotificationRequest)
          delete this.getConnectorStatus(connectorId)?.status
        }
      }
    }
  }

  private stopWebSocketPing (): void {
    if (this.wsPingSetInterval != null) {
      clearInterval(this.wsPingSetInterval)
      delete this.wsPingSetInterval
    }
  }

  private terminateWSConnection (): void {
    if (this.isWebSocketConnectionOpened()) {
      this.wsConnection?.terminate()
      this.wsConnection = null
    }
  }
}
