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
  type ConnectorEntry,
  type ConnectorStatus,
  ConnectorStatusEnum,
  CurrentType,
  type ErrorCallback,
  type ErrorResponse,
  ErrorType,
  type EvseEntry,
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
  PublicKeyWithSignedMeterValueEnumType,
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
  VendorParametersKey,
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
  computeExponentialBackOffDelay,
  Configuration,
  Constants,
  convertToBoolean,
  convertToDate,
  convertToInt,
  DCElectricUtils,
  ensureError,
  formatDurationMilliSeconds,
  formatDurationSeconds,
  getErrorMessage,
  getMessageTypeString,
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
  warnOnOCPP16TemplateKeys,
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
  buildBootNotificationRequest,
  createOCPPServices,
  flushQueuedTransactionMessages,
  OCPP20ServiceUtils,
  OCPPAuthServiceFactory,
  OCPPConstants,
  type OCPPIncomingRequestService,
  type OCPPRequestService,
  sendAndSetConnectorStatus,
  stopRunningTransactions,
} from './ocpp/index.js'
import { SharedLRUCache } from './SharedLRUCache.js'

const moduleName = 'ChargingStation'

export class ChargingStation extends EventEmitter {
  public automaticTransactionGenerator?: AutomaticTransactionGenerator
  public bootNotificationRequest?: BootNotificationRequest
  public bootNotificationResponse?: BootNotificationResponse
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
    return isEmpty(this.connectors) && !isEmpty(this.evses)
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
  private readonly connectors: Map<number, ConnectorStatus>
  private connectorsConfigurationHash!: string
  private readonly evses: Map<number, EvseStatus>
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
    this.on(ChargingStationEvents.connectorStatusChanged, () => {
      parentPort?.postMessage(buildUpdatedMessage(this))
    })
    this.on(ChargingStationEvents.accepted, () => {
      this.startMessageSequence(
        this.wsConnectionRetryCount > 0
          ? true
          : this.getAutomaticTransactionGeneratorConfiguration()?.stopAbsoluteDuration
      ).catch((error: unknown) => {
        logger.error(
          `${this.logPrefix()} ${moduleName}.onAccepted: Error while starting the message sequence:`,
          error
        )
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
        const e = ensureError(error)
        logger.error(
          `${this.logPrefix()} ${moduleName}.onDisconnected: Error while stopping the internal message sequence:`,
          e
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
        `${this.logPrefix()} ${moduleName}.addReservation: No connector ${reservation.connectorId.toString()} found during reservation ${reservation.reservationId.toString()} addition`
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
        const e = ensureError(error)
        logger.error(
          `${this.logPrefix()} ${moduleName}.delete: Error stopping station during delete:`,
          e
        )
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
        logger.warn(
          `${this.logPrefix()} ${moduleName}.delete: No ID tags file found during deletion`
        )
      }
    } else {
      logger.warn(
        `${this.logPrefix()} ${moduleName}.delete: No station info available during deletion`
      )
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
        const e = ensureError(error)
        logger.error(
          `${this.logPrefix()} ${moduleName}.delete: Failed to delete configuration file ${this.configurationFile}:`,
          e
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
          Constants.DEFAULT_EV_CONNECTION_TIMEOUT_SECONDS
      )
    }
    return Constants.DEFAULT_EV_CONNECTION_TIMEOUT_SECONDS
  }

  /**
   * Resolves the first connector ID for a given EVSE ID.
   * @param evseId - The EVSE ID
   * @returns The connector ID or undefined if not found
   */
  public getConnectorIdByEvseId (evseId: number): number | undefined {
    return this.iterateConnectors().find(({ evseId: id }) => id === evseId)?.connectorId
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
    }
    return this.iterateConnectors().find(
      ({ connectorStatus }) => connectorStatus.transactionId === transactionId
    )?.connectorId
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
    const maximumPower = this.stationInfo?.maximumPower
    if (maximumPower == null || maximumPower <= 0) {
      logger.error(
        `${this.logPrefix()} ${moduleName}.getConnectorMaximumAvailablePower: maximumPower is ${
          maximumPower?.toString() ?? 'undefined'
        }, cannot compute connector maximum power`
      )
      return Number.POSITIVE_INFINITY
    }
    const connectorMaximumPower = maximumPower / (this.powerDivider ?? 1)
    const chargingStationChargingProfilesLimit =
      (getChargingStationChargingProfilesLimit(this) ?? Number.POSITIVE_INFINITY) /
      (this.powerDivider ?? 1)
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
    return this.iterateConnectors().find(({ connectorId: id }) => id === connectorId)
      ?.connectorStatus
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
    const connectorId = this.getConnectorIdByTransactionId(transactionId)
    return this.getEnergyActiveImportRegister(
      connectorId != null ? this.getConnectorStatus(connectorId) : undefined,
      rounded
    )
  }

  /**
   * Resolves the EVSE ID for a given connector ID.
   * @param connectorId - The connector ID
   * @returns The EVSE ID or undefined if not found
   */
  public getEvseIdByConnectorId (connectorId: number): number | undefined {
    return this.iterateConnectors().find(({ connectorId: id }) => id === connectorId)?.evseId
  }

  /**
   * Resolves the EVSE ID for a given transaction ID.
   * @param transactionId - The transaction ID
   * @returns The EVSE ID or undefined if not found
   */
  public getEvseIdByTransactionId (transactionId: number | string | undefined): number | undefined {
    if (transactionId == null) {
      return undefined
    }
    return this.iterateConnectors().find(
      ({ connectorStatus }) => connectorStatus.transactionId === transactionId
    )?.evseId
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
        `${this.logPrefix()} ${moduleName}.getHeartbeatInterval: Heartbeat interval configuration key not set, using default value: ${Constants.DEFAULT_HEARTBEAT_INTERVAL_MS.toString()}`
      )
    return Constants.DEFAULT_HEARTBEAT_INTERVAL_MS
  }

  public getLocalAuthListEnabled (): boolean {
    const localAuthListEnabled = getConfigurationKey(
      this,
      StandardParametersKey.LocalAuthListEnabled
    )
    return localAuthListEnabled != null ? convertToBoolean(localAuthListEnabled.value) : false
  }

  public getNumberOfConnectors (): number {
    return this.iterateConnectors(true).reduce(count => count + 1, 0)
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
    const localStationInfo = stationInfo ?? this.stationInfo
    switch (this.getCurrentOutType(stationInfo)) {
      case CurrentType.AC:
        return localStationInfo?.numberOfPhases ?? 3
      case CurrentType.DC:
        return 0
    }
  }

  /**
   * Counts currently active transactions across all connectors.
   * @returns The number of running transactions
   */
  public getNumberOfRunningTransactions (): number {
    return this.iterateConnectors(true).reduce(
      (count, { connectorStatus }) =>
        connectorStatus.transactionStarted === true ? count + 1 : count,
      0
    )
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
    return this.iterateConnectors().find(
      ({ connectorStatus }) => connectorStatus.reservation?.[filterKey] === value
    )?.connectorStatus.reservation
  }

  public getReserveConnectorZeroSupported (): boolean {
    return convertToBoolean(
      getConfigurationKey(this, StandardParametersKey.ReserveConnectorZeroSupported)?.value
    )
  }

  /**
   * Gets the ID tag used for a given transaction.
   * @param transactionId - The transaction ID
   * @returns The ID tag or undefined if not found
   */
  public getTransactionIdTag (transactionId: number): string | undefined {
    return this.iterateConnectors().find(
      ({ connectorStatus }) => connectorStatus.transactionId === transactionId
    )?.connectorStatus.transactionIdTag
  }

  public getVoltageOut (stationInfo?: ChargingStationInfo): Voltage {
    return (
      (stationInfo ?? this.stationInfo)?.voltageOut ??
      getDefaultVoltageOut(this.getCurrentOutType(stationInfo), this.logPrefix(), this.templateFile)
    )
  }

  public getWebSocketPingInterval (): number {
    return getConfigurationKey(this, StandardParametersKey.WebSocketPingInterval) != null
      ? convertToInt(getConfigurationKey(this, StandardParametersKey.WebSocketPingInterval)?.value)
      : Constants.DEFAULT_WS_PING_INTERVAL_SECONDS
  }

  public hasConnector (connectorId: number): boolean {
    return this.iterateConnectors().some(({ connectorId: id }) => id === connectorId)
  }

  public hasEvse (evseId: number): boolean {
    return this.evses.has(evseId)
  }

  public hasIdTags (): boolean {
    const idTagsFile = this.stationInfo != null ? getIdTagsFile(this.stationInfo) : undefined
    return idTagsFile != null && isNotEmptyArray(this.idTagsCache.getIdTags(idTagsFile))
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

  public * iterateConnectors (skipZero = false): Generator<ConnectorEntry> {
    if (this.hasEvses) {
      for (const [evseId, evseStatus] of this.evses) {
        if (skipZero && evseId === 0) continue
        for (const [connectorId, connectorStatus] of evseStatus.connectors) {
          if (skipZero && connectorId === 0) continue
          yield { connectorId, connectorStatus, evseId }
        }
      }
    } else {
      for (const [connectorId, connectorStatus] of this.connectors) {
        if (skipZero && connectorId === 0) continue
        yield { connectorId, connectorStatus, evseId: undefined }
      }
    }
  }

  public * iterateEvses (skipZero = false): Generator<EvseEntry> {
    for (const [evseId, evseStatus] of this.evses) {
      if (skipZero && evseId === 0) continue
      yield { evseId, evseStatus }
    }
  }

  public lockConnector (connectorId: number): void {
    if (connectorId === 0) {
      logger.warn(
        `${this.logPrefix()} ${moduleName}.lockConnector: connector id 0 is not a physical connector`
      )
      return
    }
    if (!this.hasConnector(connectorId)) {
      logger.warn(
        `${this.logPrefix()} ${moduleName}.lockConnector: connector id ${connectorId.toString()} does not exist`
      )
      return
    }
    const connectorStatus = this.getConnectorStatus(connectorId)
    if (connectorStatus == null) {
      logger.warn(
        `${this.logPrefix()} ${moduleName}.lockConnector: connector id ${connectorId.toString()} status is null`
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
      handshakeTimeout: secondsToMilliseconds(Constants.DEFAULT_WS_HANDSHAKE_TIMEOUT_SECONDS),
      ...this.stationInfo?.wsOptions,
      ...options,
    }
    params = { ...{ closeOpened: false, terminateOpened: false }, ...params }
    if (!checkChargingStationState(this, this.logPrefix())) {
      return
    }
    if (this.stationInfo?.supervisionUser != null && this.stationInfo.supervisionPassword != null) {
      if (this.stationInfo.supervisionUser.includes(':')) {
        logger.warn(
          `${this.logPrefix()} ${moduleName}.openWSConnection: Supervision user contains ':' which is invalid in HTTP Basic Auth (RFC 7617) — skipping auth`
        )
      } else {
        options.auth = `${this.stationInfo.supervisionUser}:${this.stationInfo.supervisionPassword}`
      }
    }
    if (params.closeOpened) {
      this.closeWSConnection()
    }
    if (params.terminateOpened) {
      this.terminateWSConnection()
    }

    if (this.isWebSocketConnectionOpened()) {
      logger.warn(
        `${this.logPrefix()} ${moduleName}.openWSConnection: OCPP connection to URL ${this.wsConnectionUrl.href} is already opened`
      )
      return
    }

    logger.info(
      `${this.logPrefix()} ${moduleName}.openWSConnection: Open OCPP connection to URL ${this.wsConnectionUrl.href}`
    )

    this.wsConnection = new WebSocket(
      this.wsConnectionUrl,
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `ocpp${this.stationInfo?.ocppVersion}`,
      options
    )

    // Handle WebSocket message
    this.wsConnection.on('message', data => {
      this.onMessage(data).catch((error: unknown) =>
        logger.error(
          `${this.logPrefix()} ${moduleName}.openWSConnection: Error while processing WebSocket message:`,
          error
        )
      )
    })
    // Handle WebSocket error
    this.wsConnection.on('error', this.onError.bind(this))
    // Handle WebSocket close
    this.wsConnection.on('close', this.onClose.bind(this))
    // Handle WebSocket open
    this.wsConnection.on('open', () => {
      this.onOpen().catch((error: unknown) =>
        logger.error(
          `${this.logPrefix()} ${moduleName}.openWSConnection: Error while opening WebSocket connection:`,
          error
        )
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
    const connectorStatus = this.getConnectorStatus(reservation.connectorId)
    if (connectorStatus == null) {
      logger.error(
        `${this.logPrefix()} ${moduleName}.removeReservation: Trying to remove reservation on non-existent connector id ${reservation.connectorId.toString()}`
      )
      return
    }
    switch (reason) {
      case ReservationTerminationReason.CONNECTOR_STATE_CHANGED:
      case ReservationTerminationReason.TRANSACTION_STARTED:
        delete connectorStatus.reservation
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
        delete connectorStatus.reservation
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
      const e = ensureError(error)
      logger.error(`${this.logPrefix()} ${moduleName}.reset: Error during reset stop phase:`, e)
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
   * Updates the supervision server URL and optionally the CSMS basic auth credentials.
   * @param url - The new supervision server URL
   * @param supervisionUser - CSMS basic auth user (undefined preserves existing)
   * @param supervisionPassword - CSMS basic auth password (undefined preserves existing)
   */
  public setSupervisionUrl (
    url: string,
    supervisionUser?: string,
    supervisionPassword?: string
  ): void {
    if (
      this.stationInfo?.supervisionUrlOcppConfiguration === true &&
      isNotEmptyString(this.stationInfo.supervisionUrlOcppKey)
    ) {
      setConfigurationKeyValue(this, this.stationInfo.supervisionUrlOcppKey, url)
    } else if (this.stationInfo != null) {
      this.stationInfo.supervisionUrls = url
      this.configuredSupervisionUrl = this.getConfiguredSupervisionUrl()
    }
    if (this.stationInfo != null) {
      if (supervisionUser != null) {
        this.stationInfo.supervisionUser = supervisionUser
      }
      if (supervisionPassword != null) {
        this.stationInfo.supervisionPassword = supervisionPassword
      }
      this.saveStationInfo()
      this.emitChargingStationEvent(ChargingStationEvents.updated)
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
                    `${this.logPrefix()} ${moduleName}.start: ${FileType.ChargingStationTemplate} ${
                      this.templateFile
                    } file have changed, reload`
                  )
                  this.sharedLRUCache.deleteChargingStationTemplate(this.templateFileHash)
                  const idTagsFile =
                    this.stationInfo != null ? getIdTagsFile(this.stationInfo) : undefined
                  if (idTagsFile != null) {
                    this.idTagsCache.deleteIdTags(idTagsFile)
                  }
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
                  const e = ensureError(error)
                  logger.error(
                    `${this.logPrefix()} ${moduleName}.start: ${FileType.ChargingStationTemplate} file monitoring error:`,
                    e
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
        logger.warn(`${this.logPrefix()} ${moduleName}.start: Already starting`)
      }
    } else {
      logger.warn(`${this.logPrefix()} ${moduleName}.start: Already started`)
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
              `${this.logPrefix()} ${moduleName}.startHeartbeat: Error while sending '${RequestCommand.HEARTBEAT}':`,
              error
            )
          })
      }, clampToSafeTimerValue(heartbeatInterval))
      logger.info(
        `${this.logPrefix()} ${moduleName}.startHeartbeat: Heartbeat started every ${formatDurationMilliSeconds(
          heartbeatInterval
        )}`
      )
    } else if (this.heartbeatSetInterval != null) {
      logger.info(
        `${this.logPrefix()} ${moduleName}.startHeartbeat: Heartbeat already started every ${formatDurationMilliSeconds(
          heartbeatInterval
        )}`
      )
    } else {
      logger.error(
        `${this.logPrefix()} ${moduleName}.startHeartbeat: Heartbeat interval set to ${heartbeatInterval.toString()}, not starting the heartbeat`
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
              Constants.STOP_MESSAGE_SEQUENCE_TIMEOUT_MS,
              `Timeout ${formatDurationMilliSeconds(Constants.STOP_MESSAGE_SEQUENCE_TIMEOUT_MS)} reached at stopping message sequence`
            )
          } catch (error: unknown) {
            logger.error(
              `${this.logPrefix()} ${moduleName}.stop: Error while stopping message sequence:`,
              error
            )
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
        logger.warn(`${this.logPrefix()} ${moduleName}.stop: Already stopping`)
      }
    } else {
      logger.warn(`${this.logPrefix()} ${moduleName}.stop: Already stopped`)
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
      logger.warn(
        `${this.logPrefix()} ${moduleName}.unlockConnector: connector id 0 is not a physical connector`
      )
      return
    }
    if (!this.hasConnector(connectorId)) {
      logger.warn(
        `${this.logPrefix()} ${moduleName}.unlockConnector: connector id ${connectorId.toString()} does not exist`
      )
      return
    }
    const connectorStatus = this.getConnectorStatus(connectorId)
    if (connectorStatus == null) {
      logger.warn(
        `${this.logPrefix()} ${moduleName}.unlockConnector: connector id ${connectorId.toString()} status is null`
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
    if (!this.flushingMessageBuffer && isNotEmptyArray<string>(this.messageQueue)) {
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
              `${this.logPrefix()} ${moduleName}.getConfigurationFromFile: Invalid charging station configuration file ${
                this.configurationFile
              }`
            )
            return undefined
          }
          if (!isNotEmptyString(configuration.configurationHash)) {
            logger.error(
              `${this.logPrefix()} ${moduleName}.getConfigurationFromFile: Missing charging station configuration hash in file ${
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
            `${this.logPrefix()} ${moduleName}.getConfigurationFromFile: Using cached charging station configuration due to file read error`
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
        default: {
          const supervisionUrlDistribution = Configuration.getSupervisionUrlDistribution()
          if (
            supervisionUrlDistribution != null &&
            !Object.values(SupervisionUrlDistribution).includes(supervisionUrlDistribution)
          ) {
            logger.warn(
              // eslint-disable-next-line @typescript-eslint/no-base-to-string
              `${this.logPrefix()} ${moduleName}.getConfiguredSupervisionUrl: Unknown supervision url distribution '${supervisionUrlDistribution}' in configuration from values '${SupervisionUrlDistribution.toString()}', defaulting to '${
                SupervisionUrlDistribution.CHARGING_STATION_AFFINITY
              }'`
            )
          }
          configuredSupervisionUrlIndex = (this.index - 1) % supervisionUrls.length
          break
        }
      }
      configuredSupervisionUrl = supervisionUrls[configuredSupervisionUrlIndex]
    } else if (typeof supervisionUrls === 'string') {
      configuredSupervisionUrl = supervisionUrls
    }
    if (isNotEmptyString(configuredSupervisionUrl)) {
      return new URL(configuredSupervisionUrl)
    }
    const errorMsg = 'No supervision url(s) configured'
    logger.error(`${this.logPrefix()} ${moduleName}.getConfiguredSupervisionUrl: ${errorMsg}`)
    throw new BaseError(errorMsg)
  }

  private getCurrentOutType (stationInfo?: ChargingStationInfo): CurrentType {
    return (
      (stationInfo ?? this.stationInfo)?.currentOutType ??
      Constants.DEFAULT_STATION_INFO.currentOutType ??
      CurrentType.AC
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
    const localStationInfo = stationInfo ?? this.stationInfo
    const maximumPower = localStationInfo?.maximumPower
    if (maximumPower == null || maximumPower <= 0) {
      logger.error(
        `${this.logPrefix()} ${moduleName}.getMaximumAmperage: maximumPower is ${
          maximumPower?.toString() ?? 'undefined'
        }, cannot compute maximum amperage`
      )
      return undefined
    }
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
    return (
      this.iterateConnectors(true).reduce(
        (count, { connectorStatus }) =>
          connectorStatus.status === ConnectorStatusEnum.Available ? count + 1 : count,
        0
      ) - this.getNumberOfReservationsOnConnectorZero()
    )
  }

  private getNumberOfReservationsOnConnectorZero (): number {
    if (this.getConnectorStatus(0)?.reservation != null) {
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

  private getReconnectDelay (): number {
    if (
      this.stationInfo?.ocppVersion === OCPPVersion.VERSION_20 ||
      this.stationInfo?.ocppVersion === OCPPVersion.VERSION_201
    ) {
      return OCPP20ServiceUtils.computeReconnectDelay(this, this.wsConnectionRetryCount)
    }
    return this.stationInfo?.reconnectExponentialDelay === true
      ? computeExponentialBackOffDelay({
        baseDelayMs: 100,
        jitterPercent: 0.2,
        retryNumber: this.wsConnectionRetryCount,
      })
      : secondsToMilliseconds(Constants.DEFAULT_WS_RECONNECT_DELAY_SECONDS)
  }

  private getStationInfo (options?: ChargingStationOptions): ChargingStationInfo {
    const { stationInfo: stationInfoFromTemplate, stationTemplate } =
      this.getStationInfoFromTemplate()
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
        propagateSerialNumber(stationTemplate, stationInfoFromFile, stationInfo)
    }
    stationInfo = setChargingStationOptions(
      mergeDeepRight(Constants.DEFAULT_STATION_INFO as ChargingStationInfo, stationInfo),
      options
    )
    stationInfo.chargingStationId = getChargingStationId(this.index, stationInfo)
    stationInfo.hashId = getHashId(this.index, stationTemplate, stationInfo.chargingStationId)
    return stationInfo
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

  private getStationInfoFromTemplate (): {
    stationInfo: ChargingStationInfo
    stationTemplate: ChargingStationTemplate
  } {
    const stationTemplate = this.getTemplateFromFile()
    if (stationTemplate == null) {
      const errorMsg = `Failed to read charging station template file ${this.templateFile}`
      logger.error(`${this.logPrefix()} ${moduleName}.getStationInfoFromTemplate: ${errorMsg}`)
      throw new BaseError(errorMsg)
    }
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
    stationInfo.templateIndex = this.index
    stationInfo.templateName = buildTemplateName(this.templateFile)
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
        `${this.logPrefix()} ${moduleName}.getStationInfoFromTemplate: Firmware version '${stationInfo.firmwareVersion}' in template file ${
          this.templateFile
        } does not match firmware version pattern '${stationInfo.firmwareVersionPattern}'`
      )
    }
    if (stationTemplate.resetTime != null) {
      stationInfo.resetTime = secondsToMilliseconds(stationTemplate.resetTime)
    }
    return { stationInfo, stationTemplate }
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
    return (
      stationTemplate?.useConnectorId0 ?? Constants.DEFAULT_STATION_INFO.useConnectorId0 ?? true
    )
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
    const cachedRequest = this.getCachedRequest(messageType, messageId)
    if (cachedRequest == null) {
      throw new OCPPError(
        ErrorType.INTERNAL_ERROR,
        `Cached request for error message id '${messageId}' is nullish`,
        undefined,
        { errorDetails, errorMessage, errorType }
      )
    }
    const [, errorCallback, requestCommandName] = cachedRequest
    logger.debug(
      `${this.logPrefix()} ${moduleName}.handleErrorMessage: << Command '${requestCommandName}' received error response payload: ${JSON.stringify(
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
      `${this.logPrefix()} ${moduleName}.handleIncomingMessage: << Command '${commandName}' received request payload: ${JSON.stringify(
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
    const cachedRequest = this.getCachedRequest(messageType, messageId)
    if (cachedRequest == null) {
      throw new OCPPError(
        ErrorType.INTERNAL_ERROR,
        `Cached request for response message id '${messageId}' is nullish`,
        undefined,
        commandPayload
      )
    }
    const [responseCallback, , requestCommandName, requestPayload] = cachedRequest
    logger.debug(
      `${this.logPrefix()} ${moduleName}.handleResponseMessage: << Command '${requestCommandName}' received response payload: ${JSON.stringify(
        response
      )}`
    )
    responseCallback(commandPayload, requestPayload)
  }

  private handleUnsupportedVersion (version: OCPPVersion | undefined): void {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    const errorMsg = `Unsupported protocol version '${version}' configured in template file ${this.templateFile}`
    logger.error(`${this.logPrefix()} ${moduleName}.handleUnsupportedVersion: ${errorMsg}`)
    throw new BaseError(errorMsg)
  }

  private initialize (options?: ChargingStationOptions): void {
    const stationTemplate = this.getTemplateFromFile()
    if (stationTemplate == null) {
      const errorMsg = `Failed to read charging station template file ${this.templateFile}`
      logger.error(`${this.logPrefix()} ${moduleName}.initialize: ${errorMsg}`)
      throw new BaseError(errorMsg)
    }
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
    const bootNotificationRequest = buildBootNotificationRequest(this.stationInfo)
    if (bootNotificationRequest == null) {
      const errorMsg = 'Error while creating boot notification request'
      logger.error(`${this.logPrefix()} ${moduleName}.initialize: ${errorMsg}`)
      throw new BaseError(errorMsg)
    }
    this.bootNotificationRequest = bootNotificationRequest
    this.powerDivider = this.getPowerDivider()
    // OCPP configuration
    this.ocppConfiguration = this.getOcppConfiguration(options?.persistentConfiguration)
    warnOnOCPP16TemplateKeys(this)
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
      logger.error(
        `${this.logPrefix()} ${moduleName}.initializeConnectorsFromTemplate: ${errorMsg}`
      )
      throw new BaseError(errorMsg)
    }
    if (stationTemplate.Connectors?.[0] == null) {
      logger.warn(
        `${this.logPrefix()} ${moduleName}.initializeConnectorsFromTemplate: Charging station information from template ${
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
            this.connectors.set(connectorId, clone(connectorStatus))
          }
          initializeConnectorsMapStatus(this.connectors, this.logPrefix())
          this.saveConnectorsStatus()
        } else {
          logger.warn(
            `${this.logPrefix()} ${moduleName}.initializeConnectorsFromTemplate: Charging station information from template ${
              this.templateFile
            } with no connectors configuration defined, cannot create connectors`
          )
        }
      }
    } else {
      logger.warn(
        `${this.logPrefix()} ${moduleName}.initializeConnectorsFromTemplate: Charging station information from template ${
          this.templateFile
        } with no connectors configuration defined, using already defined connectors`
      )
    }
  }

  private initializeConnectorsOrEvsesFromFile (configuration: ChargingStationConfiguration): void {
    if (configuration.connectorsStatus != null && configuration.evsesStatus == null) {
      const isTupleFormat =
        isNotEmptyArray(configuration.connectorsStatus) &&
        Array.isArray(configuration.connectorsStatus[0])
      const entries: [number, ConnectorStatus][] = isTupleFormat
        ? (configuration.connectorsStatus as [number, ConnectorStatus][])
        : (configuration.connectorsStatus as ConnectorStatus[]).map((status, index) => [
            index,
            status,
          ])
      for (const [connectorId, connectorStatus] of entries) {
        this.connectors.set(connectorId, prepareConnectorStatus(clone(connectorStatus)))
      }
    } else if (configuration.evsesStatus != null && configuration.connectorsStatus == null) {
      const isTupleFormat =
        isNotEmptyArray(configuration.evsesStatus) && Array.isArray(configuration.evsesStatus[0])
      const evseEntries: [number, EvseStatusConfiguration][] = isTupleFormat
        ? (configuration.evsesStatus as [number, EvseStatusConfiguration][])
        : (configuration.evsesStatus as EvseStatusConfiguration[]).map((status, index) => [
            index,
            status,
          ])
      for (const [evseId, evseStatusConfiguration] of evseEntries) {
        const evseStatus = clone(evseStatusConfiguration)
        delete evseStatus.connectorsStatus
        const connIsTupleFormat =
          evseStatusConfiguration.connectorsStatus != null &&
          isNotEmptyArray(evseStatusConfiguration.connectorsStatus) &&
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
      logger.error(
        `${this.logPrefix()} ${moduleName}.initializeConnectorsOrEvsesFromFile: ${errorMsg}`
      )
      throw new BaseError(errorMsg)
    } else {
      const errorMsg = `No connectors or evses defined in configuration file ${this.configurationFile}`
      logger.error(
        `${this.logPrefix()} ${moduleName}.initializeConnectorsOrEvsesFromFile: ${errorMsg}`
      )
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
      logger.error(
        `${this.logPrefix()} ${moduleName}.initializeConnectorsOrEvsesFromTemplate: ${errorMsg}`
      )
      throw new BaseError(errorMsg)
    } else {
      const errorMsg = `No connectors or evses defined in template file ${this.templateFile}`
      logger.error(
        `${this.logPrefix()} ${moduleName}.initializeConnectorsOrEvsesFromTemplate: ${errorMsg}`
      )
      throw new BaseError(errorMsg)
    }
  }

  private initializeEvsesFromTemplate (stationTemplate: ChargingStationTemplate): void {
    if (stationTemplate.Evses == null && isEmpty(this.evses)) {
      const errorMsg = `No already defined evses and charging station information from template ${this.templateFile} with no evses configuration defined`
      logger.error(`${this.logPrefix()} ${moduleName}.initializeEvsesFromTemplate: ${errorMsg}`)
      throw new BaseError(errorMsg)
    }
    if (stationTemplate.Evses?.[0] == null) {
      logger.warn(
        `${this.logPrefix()} ${moduleName}.initializeEvsesFromTemplate: Charging station information from template ${
          this.templateFile
        } with no evse id 0 configuration`
      )
    }
    if (stationTemplate.Evses?.[0]?.Connectors[0] == null) {
      logger.warn(
        `${this.logPrefix()} ${moduleName}.initializeEvsesFromTemplate: Charging station information from template ${
          this.templateFile
        } with evse id 0 with no connector id 0 configuration`
      )
    }
    if (Object.keys(stationTemplate.Evses?.[0]?.Connectors as object).length > 1) {
      logger.warn(
        `${this.logPrefix()} ${moduleName}.initializeEvsesFromTemplate: Charging station information from template ${
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
            `${this.logPrefix()} ${moduleName}.initializeEvsesFromTemplate: Charging station information from template ${
              this.templateFile
            } with no evses configuration defined, cannot create evses`
          )
        }
      }
    } else {
      logger.warn(
        `${this.logPrefix()} ${moduleName}.initializeEvsesFromTemplate: Charging station information from template ${
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
    if (getConfigurationKey(this, VendorParametersKey.SampledDataSignReadings) == null) {
      addConfigurationKey(this, VendorParametersKey.SampledDataSignReadings, 'false', {
        readonly: false,
      })
    }
    if (getConfigurationKey(this, VendorParametersKey.AlignedDataSignReadings) == null) {
      addConfigurationKey(this, VendorParametersKey.AlignedDataSignReadings, 'false', {
        readonly: false,
      })
    }
    if (getConfigurationKey(this, VendorParametersKey.SampledDataSignStartedReadings) == null) {
      addConfigurationKey(this, VendorParametersKey.SampledDataSignStartedReadings, 'false', {
        readonly: false,
      })
    }
    if (getConfigurationKey(this, VendorParametersKey.SampledDataSignUpdatedReadings) == null) {
      addConfigurationKey(this, VendorParametersKey.SampledDataSignUpdatedReadings, 'false', {
        readonly: false,
      })
    }
    if (getConfigurationKey(this, VendorParametersKey.AlignedDataSignUpdatedReadings) == null) {
      addConfigurationKey(this, VendorParametersKey.AlignedDataSignUpdatedReadings, 'false', {
        readonly: false,
      })
    }
    if (getConfigurationKey(this, VendorParametersKey.PublicKeyWithSignedMeterValue) == null) {
      addConfigurationKey(
        this,
        VendorParametersKey.PublicKeyWithSignedMeterValue,
        PublicKeyWithSignedMeterValueEnumType.Never,
        {
          readonly: false,
        }
      )
    }
    if (getConfigurationKey(this, VendorParametersKey.StartTxnSampledData) == null) {
      addConfigurationKey(this, VendorParametersKey.StartTxnSampledData, '', {
        readonly: false,
      })
    }
    if (
      isNotEmptyString(this.stationInfo?.amperageLimitationOcppKey) &&
      getConfigurationKey(this, this.stationInfo.amperageLimitationOcppKey) == null
    ) {
      const maximumAmperage = this.stationInfo.maximumAmperage
      if (maximumAmperage != null && maximumAmperage > 0) {
        addConfigurationKey(
          this,
          this.stationInfo.amperageLimitationOcppKey,
          // prettier-ignore
          (maximumAmperage * getAmperageLimitationUnitDivider(this.stationInfo)).toString()
        )
      } else {
        logger.error(
          `${this.logPrefix()} ${moduleName}.initializeOcppConfiguration: maximumAmperage is ${
            maximumAmperage?.toString() ?? 'undefined'
          }, cannot set amperage limitation configuration key`
        )
      }
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
      for (const { connectorId } of this.iterateConnectors()) {
        const phaseRotation = getPhaseRotationValue(connectorId, this.getNumberOfPhases())
        if (phaseRotation != null) {
          connectorsPhaseRotation.push(phaseRotation)
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
        Constants.DEFAULT_EV_CONNECTION_TIMEOUT_SECONDS.toString()
      )
    }
    this.saveOcppConfiguration()
  }

  private initializeOcppServices (): void {
    const ocppVersion = this.stationInfo?.ocppVersion
    if (ocppVersion == null) {
      this.handleUnsupportedVersion(ocppVersion)
      return
    }
    try {
      const services = createOCPPServices(ocppVersion)
      this.ocppIncomingRequestService = services.incomingRequestService
      this.ocppRequestService = services.requestService
    } catch (error) {
      if (error instanceof OCPPError && error.code === ErrorType.INTERNAL_ERROR) {
        this.handleUnsupportedVersion(ocppVersion)
      }
      throw error
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
          `${this.logPrefix()} ${moduleName}.onClose: WebSocket normally closed with status '${getWebSocketCloseEventStatusString(
            code
          )}' and reason '${reason.toString()}'`
        )
        this.wsConnectionRetryCount = 0
        break
      // Abnormal close
      default:
        logger.error(
          `${this.logPrefix()} ${moduleName}.onClose: WebSocket abnormally closed with status '${getWebSocketCloseEventStatusString(
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
              logger.error(
                `${this.logPrefix()} ${moduleName}.onClose: Error while reconnecting:`,
                error
              )
            )
        break
    }
  }

  private onError (error: WSError): void {
    this.closeWSConnection()
    logger.error(`${this.logPrefix()} ${moduleName}.onError: WebSocket error:`, error)
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
            logger.error(`${this.logPrefix()} ${moduleName}.onMessage: ${errorMsg}`)
            throw new OCPPError(
              this.stationInfo?.ocppVersion !== OCPPVersion.VERSION_16
                ? ErrorType.MESSAGE_TYPE_NOT_SUPPORTED
                : ErrorType.PROTOCOL_ERROR,
              errorMsg
            )
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
        const e = ensureError(error)
        logger.error(
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `${this.logPrefix()} ${moduleName}.onMessage: Incoming message '${request}' parsing error:`,
          e
        )
        // OCPP 2.0.1 §4.2.3: respond with CALLERROR using messageId "-1"
        if (this.stationInfo?.ocppVersion !== OCPPVersion.VERSION_16) {
          await this.ocppRequestService
            .sendError(
              this,
              '-1',
              new OCPPError(
                ErrorType.RPC_FRAMEWORK_ERROR,
                'Incoming message is not a valid JSON or not an array',
                undefined,
                // eslint-disable-next-line @typescript-eslint/no-base-to-string
                { rawMessage: typeof data === 'string' ? data : data.toString() }
              ),
              OCPPConstants.UNKNOWN_OCPP_COMMAND
            )
            .catch((sendError: unknown) => {
              logger.error(
                `${this.logPrefix()} ${moduleName}.onMessage: Error sending RpcFrameworkError CALLERROR:`,
                sendError
              )
            })
        }
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
            const cachedRequest = this.getCachedRequest(messageType, messageId)
            if (cachedRequest != null) {
              ;[, errorCallback, requestCommandName] = cachedRequest
              // Reject the deferred promise in case of error at response handling (rejecting an already fulfilled promise is a no-op)
              errorCallback(ocppError, false)
            }
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
          `${this.logPrefix()} ${moduleName}.onMessage: Error thrown at incoming OCPP command ${
            commandName ?? requestCommandName ?? OCPPConstants.UNKNOWN_OCPP_COMMAND
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
          } message '${data.toString()}' handling is not an OCPPError:`,
          error
        )
      }
      logger.error(
        `${this.logPrefix()} ${moduleName}.onMessage: Incoming OCPP command '${
          commandName ?? requestCommandName ?? OCPPConstants.UNKNOWN_OCPP_COMMAND
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
        `${this.logPrefix()} ${moduleName}.onOpen: Connection to OCPP server through ${
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
              computeExponentialBackOffDelay({
                baseDelayMs:
                  this.bootNotificationResponse?.interval != null
                    ? secondsToMilliseconds(this.bootNotificationResponse.interval)
                    : Constants.DEFAULT_BOOT_NOTIFICATION_INTERVAL_MS,
                jitterMs: Constants.DEFAULT_WS_RECONNECT_TIMEOUT_OFFSET_MS,
                retryNumber: registrationRetryCount,
              })
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
          `${this.logPrefix()} ${moduleName}.onOpen: Registration failure: maximum retries reached (${registrationRetryCount.toString()}) or retry disabled (${this.stationInfo?.registrationMaxRetries?.toString()})`
        )
      } else {
        await flushQueuedTransactionMessages(this)
      }
      this.emitChargingStationEvent(ChargingStationEvents.updated)
    } else {
      logger.warn(
        `${this.logPrefix()} ${moduleName}.onOpen: Connection to OCPP server through ${this.wsConnectionUrl.href} failed`
      )
    }
  }

  private onPing (): void {
    logger.debug(
      `${this.logPrefix()} ${moduleName}.onPing: Received a WS ping (rfc6455) from the server`
    )
  }

  private onPong (): void {
    logger.debug(
      `${this.logPrefix()} ${moduleName}.onPong: Received a WS pong (rfc6455) from the server`
    )
  }

  private async reconnect (): Promise<void> {
    if (
      this.stationInfo?.autoReconnectMaxRetries === -1 ||
      this.wsConnectionRetryCount < (this.stationInfo?.autoReconnectMaxRetries ?? 0)
    ) {
      ++this.wsConnectionRetryCount
      const reconnectDelay = this.getReconnectDelay()
      const reconnectTimeout =
        reconnectDelay - Constants.DEFAULT_WS_RECONNECT_TIMEOUT_OFFSET_MS > 0
          ? reconnectDelay - Constants.DEFAULT_WS_RECONNECT_TIMEOUT_OFFSET_MS
          : 0
      logger.error(
        `${this.logPrefix()} ${moduleName}.reconnect: WebSocket connection retry in ${formatDurationMilliSeconds(reconnectDelay)}, timeout ${formatDurationMilliSeconds(reconnectTimeout)}`
      )
      await sleep(reconnectDelay)
      logger.error(
        `${this.logPrefix()} ${moduleName}.reconnect: WebSocket connection retry #${this.wsConnectionRetryCount.toString()}`
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
        `${this.logPrefix()} ${moduleName}.reconnect: WebSocket connection retries failure: maximum retries reached (${this.wsConnectionRetryCount.toString()}) or retries disabled (${this.stationInfo?.autoReconnectMaxRetries?.toString()})`
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
          configurationFromFile != null ? clone(configurationFromFile) : {}
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
        configurationData = mergeDeepRight(
          configurationData,
          buildChargingStationAutomaticTransactionGeneratorConfiguration(
            this
          ) as Partial<ChargingStationConfiguration>
        )
        if (this.stationInfo?.automaticTransactionGeneratorPersistentConfiguration !== true) {
          delete configurationData.automaticTransactionGenerator
        }
        if (!isEmpty(this.connectors)) {
          configurationData.connectorsStatus = buildConnectorsStatus(this)
        } else {
          delete configurationData.connectorsStatus
        }
        if (!isEmpty(this.evses)) {
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
            ...(!isEmpty(this.connectors) && {
              connectorsStatus: configurationData.connectorsStatus,
            }),
            ...(!isEmpty(this.evses) && {
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
            `${this.logPrefix()} ${moduleName}.saveConfiguration: Not saving unchanged charging station configuration file ${
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
        `${this.logPrefix()} ${moduleName}.saveConfiguration: Trying to save charging station configuration to undefined configuration file`
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
    if (isNotEmptyArray<string>(this.messageQueue)) {
      const message = this.messageQueue[0]
      let beginId: string | undefined
      let commandName: RequestCommand | undefined
      let parsedMessage: ErrorResponse | OutgoingRequest | Response
      messageIdx ??= 0
      try {
        parsedMessage = JSON.parse(message) as ErrorResponse | OutgoingRequest | Response
      } catch (error) {
        logger.error(
          `${this.logPrefix()} ${moduleName}.sendMessageBuffer: Error while parsing buffered OCPP message '${message}' to JSON:`,
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
            `${this.logPrefix()} ${moduleName}.sendMessageBuffer: >> Buffered ${getMessageTypeString(messageType)} OCPP message sent '${message}'`
          )
          this.messageQueue.shift()
        } else {
          logger.error(
            `${this.logPrefix()} ${moduleName}.sendMessageBuffer: Error while sending buffered ${getMessageTypeString(messageType)} OCPP message '${message}':`,
            error
          )
        }
        // eslint-disable-next-line promise/no-promise-in-callback
        sleep(
          computeExponentialBackOffDelay({
            baseDelayMs: 100,
            jitterPercent: 0.2,
            retryNumber: messageIdx ?? 0,
          })
        )
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
    }, Constants.DEFAULT_MESSAGE_BUFFER_FLUSH_INTERVAL_MS)
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
    for (const { connectorId, connectorStatus, evseId } of this.iterateConnectors(true)) {
      await sendAndSetConnectorStatus(this, {
        connectorId,
        ...(evseId != null && { evseId }),
        status: getBootConnectorStatus(this, connectorId, connectorStatus),
      } as unknown as StatusNotificationRequest)
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
        `${this.logPrefix()} ${moduleName}.startWebSocketPing: WebSocket ping started every ${formatDurationSeconds(
          webSocketPingInterval
        )}`
      )
    } else if (this.wsPingSetInterval != null) {
      logger.info(
        `${this.logPrefix()} ${moduleName}.startWebSocketPing: WebSocket ping already started every ${formatDurationSeconds(
          webSocketPingInterval
        )}`
      )
    } else {
      logger.error(
        `${this.logPrefix()} ${moduleName}.startWebSocketPing: WebSocket ping interval set to ${webSocketPingInterval.toString()}, not starting the WebSocket ping`
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
    for (const { connectorId, connectorStatus, evseId } of this.iterateConnectors(true)) {
      await sendAndSetConnectorStatus(this, {
        connectorId,
        ...(evseId != null && { evseId }),
        status: ConnectorStatusEnum.Unavailable,
      } as unknown as StatusNotificationRequest)
      delete connectorStatus.status
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
