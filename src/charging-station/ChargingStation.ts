// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { type FSWatcher, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { URL } from 'node:url';
import { parentPort } from 'node:worker_threads';

import { millisecondsToSeconds, secondsToMilliseconds } from 'date-fns';
import merge from 'just-merge';
import { type RawData, WebSocket } from 'ws';

import { AutomaticTransactionGenerator } from './AutomaticTransactionGenerator';
import { ChargingStationWorkerBroadcastChannel } from './broadcast-channel/ChargingStationWorkerBroadcastChannel';
import {
  addConfigurationKey,
  deleteConfigurationKey,
  getConfigurationKey,
  setConfigurationKeyValue,
} from './ConfigurationKeyUtils';
import {
  buildConnectorsMap,
  checkChargingStation,
  checkConnectorsConfiguration,
  checkStationInfoConnectorStatus,
  checkTemplate,
  createBootNotificationRequest,
  createSerialNumber,
  getAmperageLimitationUnitDivider,
  getBootConnectorStatus,
  getChargingStationConnectorChargingProfilesPowerLimit,
  getChargingStationId,
  getDefaultVoltageOut,
  getHashId,
  getIdTagsFile,
  getMaxNumberOfEvses,
  getNumberOfReservableConnectors,
  getPhaseRotationValue,
  hasReservationExpired,
  initializeConnectorsMapStatus,
  propagateSerialNumber,
  stationTemplateToStationInfo,
  warnTemplateKeysDeprecation,
} from './Helpers';
import { IdTagsCache } from './IdTagsCache';
import {
  OCPP16IncomingRequestService,
  OCPP16RequestService,
  OCPP16ResponseService,
  OCPP16ServiceUtils,
  OCPP20IncomingRequestService,
  OCPP20RequestService,
  OCPP20ResponseService,
  type OCPPIncomingRequestService,
  type OCPPRequestService,
  OCPPServiceUtils,
} from './ocpp';
import { SharedLRUCache } from './SharedLRUCache';
import { BaseError, OCPPError } from '../exception';
import { PerformanceStatistics } from '../performance';
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
  type FirmwareUpgrade,
  type HeartbeatRequest,
  type HeartbeatResponse,
  type IncomingRequest,
  type IncomingRequestCommand,
  type JsonType,
  MessageType,
  type MeterValue,
  MeterValueMeasurand,
  type MeterValuesRequest,
  type MeterValuesResponse,
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
  type StatusNotificationResponse,
  StopTransactionReason,
  type StopTransactionRequest,
  type StopTransactionResponse,
  SupervisionUrlDistribution,
  SupportedFeatureProfiles,
  VendorParametersKey,
  Voltage,
  type WSError,
  WebSocketCloseEventStatusCode,
  type WsOptions,
} from '../types';
import {
  ACElectricUtils,
  AsyncLock,
  AsyncLockType,
  Configuration,
  Constants,
  DCElectricUtils,
  buildChargingStationAutomaticTransactionGeneratorConfiguration,
  buildConnectorsStatus,
  buildEvsesStatus,
  buildStartedMessage,
  buildStoppedMessage,
  buildUpdatedMessage,
  cloneObject,
  convertToBoolean,
  convertToInt,
  exponentialDelay,
  formatDurationMilliSeconds,
  formatDurationSeconds,
  getRandomInteger,
  getWebSocketCloseEventStatusString,
  handleFileException,
  isNotEmptyArray,
  isNotEmptyString,
  isNullOrUndefined,
  isUndefined,
  logPrefix,
  logger,
  min,
  once,
  roundTo,
  secureRandom,
  sleep,
  watchJsonFile,
} from '../utils';

export class ChargingStation extends EventEmitter {
  public readonly index: number;
  public readonly templateFile: string;
  public stationInfo!: ChargingStationInfo;
  public started: boolean;
  public starting: boolean;
  public idTagsCache: IdTagsCache;
  public automaticTransactionGenerator!: AutomaticTransactionGenerator | undefined;
  public ocppConfiguration!: ChargingStationOcppConfiguration | undefined;
  public wsConnection: WebSocket | null;
  public readonly connectors: Map<number, ConnectorStatus>;
  public readonly evses: Map<number, EvseStatus>;
  public readonly requests: Map<string, CachedRequest>;
  public performanceStatistics!: PerformanceStatistics | undefined;
  public heartbeatSetInterval?: NodeJS.Timeout;
  public ocppRequestService!: OCPPRequestService;
  public bootNotificationRequest!: BootNotificationRequest;
  public bootNotificationResponse!: BootNotificationResponse | undefined;
  public powerDivider!: number;
  private stopping: boolean;
  private configurationFile!: string;
  private configurationFileHash!: string;
  private connectorsConfigurationHash!: string;
  private evsesConfigurationHash!: string;
  private automaticTransactionGeneratorConfiguration?: AutomaticTransactionGeneratorConfiguration;
  private ocppIncomingRequestService!: OCPPIncomingRequestService;
  private readonly messageBuffer: Set<string>;
  private configuredSupervisionUrl!: URL;
  private autoReconnectRetryCount: number;
  private templateFileWatcher!: FSWatcher | undefined;
  private templateFileHash!: string;
  private readonly sharedLRUCache: SharedLRUCache;
  private webSocketPingSetInterval?: NodeJS.Timeout;
  private readonly chargingStationWorkerBroadcastChannel: ChargingStationWorkerBroadcastChannel;
  private flushMessageBufferSetInterval?: NodeJS.Timeout;

  constructor(index: number, templateFile: string) {
    super();
    this.started = false;
    this.starting = false;
    this.stopping = false;
    this.wsConnection = null;
    this.autoReconnectRetryCount = 0;
    this.index = index;
    this.templateFile = templateFile;
    this.connectors = new Map<number, ConnectorStatus>();
    this.evses = new Map<number, EvseStatus>();
    this.requests = new Map<string, CachedRequest>();
    this.messageBuffer = new Set<string>();
    this.sharedLRUCache = SharedLRUCache.getInstance();
    this.idTagsCache = IdTagsCache.getInstance();
    this.chargingStationWorkerBroadcastChannel = new ChargingStationWorkerBroadcastChannel(this);

    this.on(ChargingStationEvents.started, () => {
      parentPort?.postMessage(buildStartedMessage(this));
    });
    this.on(ChargingStationEvents.stopped, () => {
      parentPort?.postMessage(buildStoppedMessage(this));
    });
    this.on(ChargingStationEvents.updated, () => {
      parentPort?.postMessage(buildUpdatedMessage(this));
    });

    this.initialize();
  }

  public get hasEvses(): boolean {
    return this.connectors.size === 0 && this.evses.size > 0;
  }

  private get wsConnectionUrl(): URL {
    return new URL(
      `${
        this.stationInfo?.supervisionUrlOcppConfiguration === true &&
        isNotEmptyString(this.stationInfo?.supervisionUrlOcppKey) &&
        isNotEmptyString(getConfigurationKey(this, this.stationInfo.supervisionUrlOcppKey!)?.value)
          ? getConfigurationKey(this, this.stationInfo.supervisionUrlOcppKey!)!.value
          : this.configuredSupervisionUrl.href
      }/${this.stationInfo.chargingStationId}`,
    );
  }

  public logPrefix = (): string => {
    if (isNotEmptyString(this?.stationInfo?.chargingStationId)) {
      return logPrefix(` ${this?.stationInfo?.chargingStationId} |`);
    }
    let stationTemplate: ChargingStationTemplate | undefined;
    try {
      stationTemplate = JSON.parse(
        readFileSync(this.templateFile, 'utf8'),
      ) as ChargingStationTemplate;
    } catch {
      stationTemplate = undefined;
    }
    return logPrefix(` ${getChargingStationId(this.index, stationTemplate)} |`);
  };

  public hasIdTags(): boolean {
    return isNotEmptyArray(this.idTagsCache.getIdTags(getIdTagsFile(this.stationInfo)!));
  }

  public getNumberOfPhases(stationInfo?: ChargingStationInfo): number {
    const localStationInfo: ChargingStationInfo = stationInfo ?? this.stationInfo;
    switch (this.getCurrentOutType(stationInfo)) {
      case CurrentType.AC:
        return localStationInfo.numberOfPhases ?? 3;
      case CurrentType.DC:
        return 0;
    }
  }

  public isWebSocketConnectionOpened(): boolean {
    return this?.wsConnection?.readyState === WebSocket.OPEN;
  }

  public inUnknownState(): boolean {
    return isNullOrUndefined(this?.bootNotificationResponse?.status);
  }

  public inPendingState(): boolean {
    return this?.bootNotificationResponse?.status === RegistrationStatusEnumType.PENDING;
  }

  public inAcceptedState(): boolean {
    return this?.bootNotificationResponse?.status === RegistrationStatusEnumType.ACCEPTED;
  }

  public inRejectedState(): boolean {
    return this?.bootNotificationResponse?.status === RegistrationStatusEnumType.REJECTED;
  }

  public isRegistered(): boolean {
    return (
      this.inUnknownState() === false &&
      (this.inAcceptedState() === true || this.inPendingState() === true)
    );
  }

  public isChargingStationAvailable(): boolean {
    return this.getConnectorStatus(0)?.availability === AvailabilityType.Operative;
  }

  public hasConnector(connectorId: number): boolean {
    if (this.hasEvses) {
      for (const evseStatus of this.evses.values()) {
        if (evseStatus.connectors.has(connectorId)) {
          return true;
        }
      }
      return false;
    }
    return this.connectors.has(connectorId);
  }

  public isConnectorAvailable(connectorId: number): boolean {
    return (
      connectorId > 0 &&
      this.getConnectorStatus(connectorId)?.availability === AvailabilityType.Operative
    );
  }

  public getNumberOfConnectors(): number {
    if (this.hasEvses) {
      let numberOfConnectors = 0;
      for (const [evseId, evseStatus] of this.evses) {
        if (evseId > 0) {
          numberOfConnectors += evseStatus.connectors.size;
        }
      }
      return numberOfConnectors;
    }
    return this.connectors.has(0) ? this.connectors.size - 1 : this.connectors.size;
  }

  public getNumberOfEvses(): number {
    return this.evses.has(0) ? this.evses.size - 1 : this.evses.size;
  }

  public getConnectorStatus(connectorId: number): ConnectorStatus | undefined {
    if (this.hasEvses) {
      for (const evseStatus of this.evses.values()) {
        if (evseStatus.connectors.has(connectorId)) {
          return evseStatus.connectors.get(connectorId);
        }
      }
      return undefined;
    }
    return this.connectors.get(connectorId);
  }

  public getConnectorMaximumAvailablePower(connectorId: number): number {
    let connectorAmperageLimitationPowerLimit: number | undefined;
    if (
      !isNullOrUndefined(this.getAmperageLimitation()) &&
      this.getAmperageLimitation()! < this.stationInfo.maximumAmperage!
    ) {
      connectorAmperageLimitationPowerLimit =
        (this.stationInfo?.currentOutType === CurrentType.AC
          ? ACElectricUtils.powerTotal(
              this.getNumberOfPhases(),
              this.stationInfo.voltageOut!,
              this.getAmperageLimitation()! *
                (this.hasEvses ? this.getNumberOfEvses() : this.getNumberOfConnectors()),
            )
          : DCElectricUtils.power(this.stationInfo.voltageOut!, this.getAmperageLimitation()!)) /
        this.powerDivider;
    }
    const connectorMaximumPower = this.stationInfo.maximumPower! / this.powerDivider;
    const connectorChargingProfilesPowerLimit =
      getChargingStationConnectorChargingProfilesPowerLimit(this, connectorId);
    return min(
      isNaN(connectorMaximumPower) ? Infinity : connectorMaximumPower,
      isNaN(connectorAmperageLimitationPowerLimit!)
        ? Infinity
        : connectorAmperageLimitationPowerLimit!,
      isNaN(connectorChargingProfilesPowerLimit!) ? Infinity : connectorChargingProfilesPowerLimit!,
    );
  }

  public getTransactionIdTag(transactionId: number): string | undefined {
    if (this.hasEvses) {
      for (const evseStatus of this.evses.values()) {
        for (const connectorStatus of evseStatus.connectors.values()) {
          if (connectorStatus.transactionId === transactionId) {
            return connectorStatus.transactionIdTag;
          }
        }
      }
    } else {
      for (const connectorId of this.connectors.keys()) {
        if (this.getConnectorStatus(connectorId)?.transactionId === transactionId) {
          return this.getConnectorStatus(connectorId)?.transactionIdTag;
        }
      }
    }
  }

  public getNumberOfRunningTransactions(): number {
    let numberOfRunningTransactions = 0;
    if (this.hasEvses) {
      for (const [evseId, evseStatus] of this.evses) {
        if (evseId === 0) {
          continue;
        }
        for (const connectorStatus of evseStatus.connectors.values()) {
          if (connectorStatus.transactionStarted === true) {
            ++numberOfRunningTransactions;
          }
        }
      }
    } else {
      for (const connectorId of this.connectors.keys()) {
        if (connectorId > 0 && this.getConnectorStatus(connectorId)?.transactionStarted === true) {
          ++numberOfRunningTransactions;
        }
      }
    }
    return numberOfRunningTransactions;
  }

  public getConnectorIdByTransactionId(transactionId: number): number | undefined {
    if (this.hasEvses) {
      for (const evseStatus of this.evses.values()) {
        for (const [connectorId, connectorStatus] of evseStatus.connectors) {
          if (connectorStatus.transactionId === transactionId) {
            return connectorId;
          }
        }
      }
    } else {
      for (const connectorId of this.connectors.keys()) {
        if (this.getConnectorStatus(connectorId)?.transactionId === transactionId) {
          return connectorId;
        }
      }
    }
  }

  public getEnergyActiveImportRegisterByTransactionId(
    transactionId: number,
    rounded = false,
  ): number {
    return this.getEnergyActiveImportRegister(
      this.getConnectorStatus(this.getConnectorIdByTransactionId(transactionId)!)!,
      rounded,
    );
  }

  public getEnergyActiveImportRegisterByConnectorId(connectorId: number, rounded = false): number {
    return this.getEnergyActiveImportRegister(this.getConnectorStatus(connectorId)!, rounded);
  }

  public getAuthorizeRemoteTxRequests(): boolean {
    const authorizeRemoteTxRequests = getConfigurationKey(
      this,
      StandardParametersKey.AuthorizeRemoteTxRequests,
    );
    return authorizeRemoteTxRequests !== undefined
      ? convertToBoolean(authorizeRemoteTxRequests.value)
      : false;
  }

  public getLocalAuthListEnabled(): boolean {
    const localAuthListEnabled = getConfigurationKey(
      this,
      StandardParametersKey.LocalAuthListEnabled,
    );
    return localAuthListEnabled !== undefined
      ? convertToBoolean(localAuthListEnabled.value)
      : false;
  }

  public getHeartbeatInterval(): number {
    const HeartbeatInterval = getConfigurationKey(this, StandardParametersKey.HeartbeatInterval);
    if (HeartbeatInterval !== undefined) {
      return secondsToMilliseconds(convertToInt(HeartbeatInterval.value));
    }
    const HeartBeatInterval = getConfigurationKey(this, StandardParametersKey.HeartBeatInterval);
    if (HeartBeatInterval !== undefined) {
      return secondsToMilliseconds(convertToInt(HeartBeatInterval.value));
    }
    this.stationInfo?.autoRegister === false &&
      logger.warn(
        `${this.logPrefix()} Heartbeat interval configuration key not set, using default value: ${
          Constants.DEFAULT_HEARTBEAT_INTERVAL
        }`,
      );
    return Constants.DEFAULT_HEARTBEAT_INTERVAL;
  }

  public setSupervisionUrl(url: string): void {
    if (
      this.stationInfo?.supervisionUrlOcppConfiguration === true &&
      isNotEmptyString(this.stationInfo?.supervisionUrlOcppKey)
    ) {
      setConfigurationKeyValue(this, this.stationInfo.supervisionUrlOcppKey!, url);
    } else {
      this.stationInfo.supervisionUrls = url;
      this.saveStationInfo();
      this.configuredSupervisionUrl = this.getConfiguredSupervisionUrl();
    }
  }

  public startHeartbeat(): void {
    if (this.getHeartbeatInterval() > 0 && !this.heartbeatSetInterval) {
      this.heartbeatSetInterval = setInterval(() => {
        this.ocppRequestService
          .requestHandler<HeartbeatRequest, HeartbeatResponse>(this, RequestCommand.HEARTBEAT)
          .catch((error) => {
            logger.error(
              `${this.logPrefix()} Error while sending '${RequestCommand.HEARTBEAT}':`,
              error,
            );
          });
      }, this.getHeartbeatInterval());
      logger.info(
        `${this.logPrefix()} Heartbeat started every ${formatDurationMilliSeconds(
          this.getHeartbeatInterval(),
        )}`,
      );
    } else if (this.heartbeatSetInterval) {
      logger.info(
        `${this.logPrefix()} Heartbeat already started every ${formatDurationMilliSeconds(
          this.getHeartbeatInterval(),
        )}`,
      );
    } else {
      logger.error(
        `${this.logPrefix()} Heartbeat interval set to ${this.getHeartbeatInterval()}, not starting the heartbeat`,
      );
    }
  }

  public restartHeartbeat(): void {
    // Stop heartbeat
    this.stopHeartbeat();
    // Start heartbeat
    this.startHeartbeat();
  }

  public restartWebSocketPing(): void {
    // Stop WebSocket ping
    this.stopWebSocketPing();
    // Start WebSocket ping
    this.startWebSocketPing();
  }

  public startMeterValues(connectorId: number, interval: number): void {
    if (connectorId === 0) {
      logger.error(
        `${this.logPrefix()} Trying to start MeterValues on connector id ${connectorId}`,
      );
      return;
    }
    if (!this.getConnectorStatus(connectorId)) {
      logger.error(
        `${this.logPrefix()} Trying to start MeterValues on non existing connector id
          ${connectorId}`,
      );
      return;
    }
    if (this.getConnectorStatus(connectorId)?.transactionStarted === false) {
      logger.error(
        `${this.logPrefix()} Trying to start MeterValues on connector id ${connectorId} with no transaction started`,
      );
      return;
    } else if (
      this.getConnectorStatus(connectorId)?.transactionStarted === true &&
      isNullOrUndefined(this.getConnectorStatus(connectorId)?.transactionId)
    ) {
      logger.error(
        `${this.logPrefix()} Trying to start MeterValues on connector id ${connectorId} with no transaction id`,
      );
      return;
    }
    if (interval > 0) {
      this.getConnectorStatus(connectorId)!.transactionSetInterval = setInterval(() => {
        // FIXME: Implement OCPP version agnostic helpers
        const meterValue: MeterValue = OCPP16ServiceUtils.buildMeterValue(
          this,
          connectorId,
          this.getConnectorStatus(connectorId)!.transactionId!,
          interval,
        );
        this.ocppRequestService
          .requestHandler<MeterValuesRequest, MeterValuesResponse>(
            this,
            RequestCommand.METER_VALUES,
            {
              connectorId,
              transactionId: this.getConnectorStatus(connectorId)?.transactionId,
              meterValue: [meterValue],
            },
          )
          .catch((error) => {
            logger.error(
              `${this.logPrefix()} Error while sending '${RequestCommand.METER_VALUES}':`,
              error,
            );
          });
      }, interval);
    } else {
      logger.error(
        `${this.logPrefix()} Charging station ${
          StandardParametersKey.MeterValueSampleInterval
        } configuration set to ${interval}, not sending MeterValues`,
      );
    }
  }

  public stopMeterValues(connectorId: number) {
    if (this.getConnectorStatus(connectorId)?.transactionSetInterval) {
      clearInterval(this.getConnectorStatus(connectorId)?.transactionSetInterval);
    }
  }

  public start(): void {
    if (this.started === false) {
      if (this.starting === false) {
        this.starting = true;
        if (this.stationInfo?.enableStatistics === true) {
          this.performanceStatistics?.start();
        }
        this.openWSConnection();
        // Monitor charging station template file
        this.templateFileWatcher = watchJsonFile(
          this.templateFile,
          FileType.ChargingStationTemplate,
          this.logPrefix(),
          undefined,
          (event, filename): void => {
            if (isNotEmptyString(filename) && event === 'change') {
              try {
                logger.debug(
                  `${this.logPrefix()} ${FileType.ChargingStationTemplate} ${
                    this.templateFile
                  } file have changed, reload`,
                );
                this.sharedLRUCache.deleteChargingStationTemplate(this.templateFileHash);
                // Initialize
                this.initialize();
                this.idTagsCache.deleteIdTags(getIdTagsFile(this.stationInfo)!);
                // Restart the ATG
                this.stopAutomaticTransactionGenerator();
                delete this.automaticTransactionGeneratorConfiguration;
                if (this.getAutomaticTransactionGeneratorConfiguration().enable === true) {
                  this.startAutomaticTransactionGenerator();
                }
                if (this.stationInfo?.enableStatistics === true) {
                  this.performanceStatistics?.restart();
                } else {
                  this.performanceStatistics?.stop();
                }
                // FIXME?: restart heartbeat and WebSocket ping when their interval values have changed
              } catch (error) {
                logger.error(
                  `${this.logPrefix()} ${FileType.ChargingStationTemplate} file monitoring error:`,
                  error,
                );
              }
            }
          },
        );
        this.started = true;
        this.emit(ChargingStationEvents.started);
        this.starting = false;
      } else {
        logger.warn(`${this.logPrefix()} Charging station is already starting...`);
      }
    } else {
      logger.warn(`${this.logPrefix()} Charging station is already started...`);
    }
  }

  public async stop(reason?: StopTransactionReason, stopTransactions?: boolean): Promise<void> {
    if (this.started === true) {
      if (this.stopping === false) {
        this.stopping = true;
        await this.stopMessageSequence(reason, stopTransactions);
        this.closeWSConnection();
        if (this.stationInfo?.enableStatistics === true) {
          this.performanceStatistics?.stop();
        }
        this.sharedLRUCache.deleteChargingStationConfiguration(this.configurationFileHash);
        this.templateFileWatcher?.close();
        this.sharedLRUCache.deleteChargingStationTemplate(this.templateFileHash);
        delete this.bootNotificationResponse;
        this.started = false;
        this.saveConfiguration();
        this.emit(ChargingStationEvents.stopped);
        this.stopping = false;
      } else {
        logger.warn(`${this.logPrefix()} Charging station is already stopping...`);
      }
    } else {
      logger.warn(`${this.logPrefix()} Charging station is already stopped...`);
    }
  }

  public async reset(reason?: StopTransactionReason): Promise<void> {
    await this.stop(reason);
    await sleep(this.stationInfo.resetTime!);
    this.initialize();
    this.start();
  }

  public saveOcppConfiguration(): void {
    if (this.stationInfo?.ocppPersistentConfiguration === true) {
      this.saveConfiguration();
    }
  }

  public bufferMessage(message: string): void {
    this.messageBuffer.add(message);
    if (this.flushMessageBufferSetInterval === undefined) {
      this.flushMessageBufferSetInterval = setInterval(() => {
        if (this.isWebSocketConnectionOpened() === true && this.inAcceptedState() === true) {
          this.flushMessageBuffer();
        }
        if (this.flushMessageBufferSetInterval !== undefined && this.messageBuffer.size === 0) {
          clearInterval(this.flushMessageBufferSetInterval);
          delete this.flushMessageBufferSetInterval;
        }
      }, Constants.DEFAULT_MESSAGE_BUFFER_FLUSH_INTERVAL);
    }
  }

  public openWSConnection(
    options?: WsOptions,
    params?: { closeOpened?: boolean; terminateOpened?: boolean },
  ): void {
    options = {
      handshakeTimeout: secondsToMilliseconds(this.getConnectionTimeout()),
      ...this.stationInfo?.wsOptions,
      ...options,
    };
    params = { ...{ closeOpened: false, terminateOpened: false }, ...params };
    if (!checkChargingStation(this, this.logPrefix())) {
      return;
    }
    if (
      !isNullOrUndefined(this.stationInfo.supervisionUser) &&
      !isNullOrUndefined(this.stationInfo.supervisionPassword)
    ) {
      options.auth = `${this.stationInfo.supervisionUser}:${this.stationInfo.supervisionPassword}`;
    }
    if (params?.closeOpened) {
      this.closeWSConnection();
    }
    if (params?.terminateOpened) {
      this.terminateWSConnection();
    }

    if (this.isWebSocketConnectionOpened() === true) {
      logger.warn(
        `${this.logPrefix()} OCPP connection to URL ${this.wsConnectionUrl.toString()} is already opened`,
      );
      return;
    }

    logger.info(
      `${this.logPrefix()} Open OCPP connection to URL ${this.wsConnectionUrl.toString()}`,
    );

    this.wsConnection = new WebSocket(
      this.wsConnectionUrl,
      `ocpp${this.stationInfo?.ocppVersion}`,
      options,
    );

    // Handle WebSocket message
    this.wsConnection.on(
      'message',
      this.onMessage.bind(this) as (this: WebSocket, data: RawData, isBinary: boolean) => void,
    );
    // Handle WebSocket error
    this.wsConnection.on(
      'error',
      this.onError.bind(this) as (this: WebSocket, error: Error) => void,
    );
    // Handle WebSocket close
    this.wsConnection.on(
      'close',
      this.onClose.bind(this) as (this: WebSocket, code: number, reason: Buffer) => void,
    );
    // Handle WebSocket open
    this.wsConnection.on('open', this.onOpen.bind(this) as (this: WebSocket) => void);
    // Handle WebSocket ping
    this.wsConnection.on('ping', this.onPing.bind(this) as (this: WebSocket, data: Buffer) => void);
    // Handle WebSocket pong
    this.wsConnection.on('pong', this.onPong.bind(this) as (this: WebSocket, data: Buffer) => void);
  }

  public closeWSConnection(): void {
    if (this.isWebSocketConnectionOpened() === true) {
      this.wsConnection?.close();
      this.wsConnection = null;
    }
  }

  public getAutomaticTransactionGeneratorConfiguration(): AutomaticTransactionGeneratorConfiguration {
    if (isNullOrUndefined(this.automaticTransactionGeneratorConfiguration)) {
      let automaticTransactionGeneratorConfiguration:
        | AutomaticTransactionGeneratorConfiguration
        | undefined;
      const stationTemplate = this.getTemplateFromFile();
      const stationConfiguration = this.getConfigurationFromFile();
      if (
        this.stationInfo?.automaticTransactionGeneratorPersistentConfiguration === true &&
        stationConfiguration?.stationInfo?.templateHash === stationTemplate?.templateHash &&
        stationConfiguration?.automaticTransactionGenerator
      ) {
        automaticTransactionGeneratorConfiguration =
          stationConfiguration?.automaticTransactionGenerator;
      } else {
        automaticTransactionGeneratorConfiguration = stationTemplate?.AutomaticTransactionGenerator;
      }
      this.automaticTransactionGeneratorConfiguration = {
        ...Constants.DEFAULT_ATG_CONFIGURATION,
        ...automaticTransactionGeneratorConfiguration,
      };
    }
    return this.automaticTransactionGeneratorConfiguration!;
  }

  public getAutomaticTransactionGeneratorStatuses(): Status[] | undefined {
    return this.getConfigurationFromFile()?.automaticTransactionGeneratorStatuses;
  }

  public startAutomaticTransactionGenerator(connectorIds?: number[]): void {
    this.automaticTransactionGenerator = AutomaticTransactionGenerator.getInstance(this);
    if (isNotEmptyArray(connectorIds)) {
      for (const connectorId of connectorIds!) {
        this.automaticTransactionGenerator?.startConnector(connectorId);
      }
    } else {
      this.automaticTransactionGenerator?.start();
    }
    this.saveAutomaticTransactionGeneratorConfiguration();
    this.emit(ChargingStationEvents.updated);
  }

  public stopAutomaticTransactionGenerator(connectorIds?: number[]): void {
    if (isNotEmptyArray(connectorIds)) {
      for (const connectorId of connectorIds!) {
        this.automaticTransactionGenerator?.stopConnector(connectorId);
      }
    } else {
      this.automaticTransactionGenerator?.stop();
    }
    this.saveAutomaticTransactionGeneratorConfiguration();
    this.emit(ChargingStationEvents.updated);
  }

  public async stopTransactionOnConnector(
    connectorId: number,
    reason?: StopTransactionReason,
  ): Promise<StopTransactionResponse> {
    const transactionId = this.getConnectorStatus(connectorId)?.transactionId;
    if (
      this.stationInfo?.beginEndMeterValues === true &&
      this.stationInfo?.ocppStrictCompliance === true &&
      this.stationInfo?.outOfOrderEndMeterValues === false
    ) {
      // FIXME: Implement OCPP version agnostic helpers
      const transactionEndMeterValue = OCPP16ServiceUtils.buildTransactionEndMeterValue(
        this,
        connectorId,
        this.getEnergyActiveImportRegisterByTransactionId(transactionId!),
      );
      await this.ocppRequestService.requestHandler<MeterValuesRequest, MeterValuesResponse>(
        this,
        RequestCommand.METER_VALUES,
        {
          connectorId,
          transactionId,
          meterValue: [transactionEndMeterValue],
        },
      );
    }
    return this.ocppRequestService.requestHandler<StopTransactionRequest, StopTransactionResponse>(
      this,
      RequestCommand.STOP_TRANSACTION,
      {
        transactionId,
        meterStop: this.getEnergyActiveImportRegisterByTransactionId(transactionId!, true),
        ...(isNullOrUndefined(reason) && { reason }),
      },
    );
  }

  public getReserveConnectorZeroSupported(): boolean {
    return convertToBoolean(
      getConfigurationKey(this, StandardParametersKey.ReserveConnectorZeroSupported)!.value,
    );
  }

  public async addReservation(reservation: Reservation): Promise<void> {
    const reservationFound = this.getReservationBy('reservationId', reservation.reservationId);
    if (reservationFound !== undefined) {
      await this.removeReservation(reservationFound, ReservationTerminationReason.REPLACE_EXISTING);
    }
    this.getConnectorStatus(reservation.connectorId)!.reservation = reservation;
    await OCPPServiceUtils.sendAndSetConnectorStatus(
      this,
      reservation.connectorId,
      ConnectorStatusEnum.Reserved,
      undefined,
      { send: reservation.connectorId !== 0 },
    );
  }

  public async removeReservation(
    reservation: Reservation,
    reason: ReservationTerminationReason,
  ): Promise<void> {
    const connector = this.getConnectorStatus(reservation.connectorId)!;
    switch (reason) {
      case ReservationTerminationReason.CONNECTOR_STATE_CHANGED:
      case ReservationTerminationReason.TRANSACTION_STARTED:
        delete connector.reservation;
        break;
      case ReservationTerminationReason.RESERVATION_CANCELED:
      case ReservationTerminationReason.REPLACE_EXISTING:
      case ReservationTerminationReason.EXPIRED:
        await OCPPServiceUtils.sendAndSetConnectorStatus(
          this,
          reservation.connectorId,
          ConnectorStatusEnum.Available,
          undefined,
          { send: reservation.connectorId !== 0 },
        );
        delete connector.reservation;
        break;
      default:
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        throw new BaseError(`Unknown reservation termination reason '${reason}'`);
    }
  }

  public getReservationBy(
    filterKey: ReservationKey,
    value: number | string,
  ): Reservation | undefined {
    if (this.hasEvses) {
      for (const evseStatus of this.evses.values()) {
        for (const connectorStatus of evseStatus.connectors.values()) {
          if (connectorStatus?.reservation?.[filterKey] === value) {
            return connectorStatus.reservation;
          }
        }
      }
    } else {
      for (const connectorStatus of this.connectors.values()) {
        if (connectorStatus?.reservation?.[filterKey] === value) {
          return connectorStatus.reservation;
        }
      }
    }
  }

  public isConnectorReservable(
    reservationId: number,
    idTag?: string,
    connectorId?: number,
  ): boolean {
    const reservation = this.getReservationBy('reservationId', reservationId);
    const reservationExists = !isUndefined(reservation) && !hasReservationExpired(reservation!);
    if (arguments.length === 1) {
      return !reservationExists;
    } else if (arguments.length > 1) {
      const userReservation = !isUndefined(idTag)
        ? this.getReservationBy('idTag', idTag!)
        : undefined;
      const userReservationExists =
        !isUndefined(userReservation) && !hasReservationExpired(userReservation!);
      const notConnectorZero = isUndefined(connectorId) ? true : connectorId! > 0;
      const freeConnectorsAvailable = this.getNumberOfReservableConnectors() > 0;
      return (
        !reservationExists && !userReservationExists && notConnectorZero && freeConnectorsAvailable
      );
    }
    return false;
  }

  private getNumberOfReservableConnectors(): number {
    let numberOfReservableConnectors = 0;
    if (this.hasEvses) {
      for (const evseStatus of this.evses.values()) {
        numberOfReservableConnectors += getNumberOfReservableConnectors(evseStatus.connectors);
      }
    } else {
      numberOfReservableConnectors = getNumberOfReservableConnectors(this.connectors);
    }
    return numberOfReservableConnectors - this.getNumberOfReservationsOnConnectorZero();
  }

  private getNumberOfReservationsOnConnectorZero(): number {
    if (
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      (this.hasEvses && this.evses.get(0)?.connectors.get(0)?.reservation) ||
      (!this.hasEvses && this.connectors.get(0)?.reservation)
    ) {
      return 1;
    }
    return 0;
  }

  private flushMessageBuffer(): void {
    if (this.messageBuffer.size > 0) {
      for (const message of this.messageBuffer.values()) {
        let beginId: string | undefined;
        let commandName: RequestCommand | undefined;
        const [messageType] = JSON.parse(message) as OutgoingRequest | Response | ErrorResponse;
        const isRequest = messageType === MessageType.CALL_MESSAGE;
        if (isRequest) {
          [, , commandName] = JSON.parse(message) as OutgoingRequest;
          beginId = PerformanceStatistics.beginMeasure(commandName);
        }
        this.wsConnection?.send(message, (error?: Error) => {
          isRequest && PerformanceStatistics.endMeasure(commandName!, beginId!);
          if (isNullOrUndefined(error)) {
            logger.debug(
              `${this.logPrefix()} >> Buffered ${OCPPServiceUtils.getMessageTypeString(
                messageType,
              )} payload sent: ${message}`,
            );
            this.messageBuffer.delete(message);
          }
        });
      }
    }
  }

  private getTemplateFromFile(): ChargingStationTemplate | undefined {
    let template: ChargingStationTemplate | undefined;
    try {
      if (this.sharedLRUCache.hasChargingStationTemplate(this.templateFileHash)) {
        template = this.sharedLRUCache.getChargingStationTemplate(this.templateFileHash);
      } else {
        const measureId = `${FileType.ChargingStationTemplate} read`;
        const beginId = PerformanceStatistics.beginMeasure(measureId);
        template = JSON.parse(readFileSync(this.templateFile, 'utf8')) as ChargingStationTemplate;
        PerformanceStatistics.endMeasure(measureId, beginId);
        template.templateHash = createHash(Constants.DEFAULT_HASH_ALGORITHM)
          .update(JSON.stringify(template))
          .digest('hex');
        this.sharedLRUCache.setChargingStationTemplate(template);
        this.templateFileHash = template.templateHash;
      }
    } catch (error) {
      handleFileException(
        this.templateFile,
        FileType.ChargingStationTemplate,
        error as NodeJS.ErrnoException,
        this.logPrefix(),
      );
    }
    return template;
  }

  private getStationInfoFromTemplate(): ChargingStationInfo {
    const stationTemplate: ChargingStationTemplate = this.getTemplateFromFile()!;
    checkTemplate(stationTemplate, this.logPrefix(), this.templateFile);
    const warnTemplateKeysDeprecationOnce = once(warnTemplateKeysDeprecation, this);
    warnTemplateKeysDeprecationOnce(stationTemplate, this.logPrefix(), this.templateFile);
    if (stationTemplate?.Connectors) {
      checkConnectorsConfiguration(stationTemplate, this.logPrefix(), this.templateFile);
    }
    const stationInfo: ChargingStationInfo = stationTemplateToStationInfo(stationTemplate);
    stationInfo.hashId = getHashId(this.index, stationTemplate);
    stationInfo.chargingStationId = getChargingStationId(this.index, stationTemplate);
    stationInfo.ocppVersion = stationTemplate?.ocppVersion ?? OCPPVersion.VERSION_16;
    createSerialNumber(stationTemplate, stationInfo);
    stationInfo.voltageOut = this.getVoltageOut(stationInfo);
    if (isNotEmptyArray(stationTemplate?.power)) {
      stationTemplate.power = stationTemplate.power as number[];
      const powerArrayRandomIndex = Math.floor(secureRandom() * stationTemplate.power.length);
      stationInfo.maximumPower =
        stationTemplate?.powerUnit === PowerUnits.KILO_WATT
          ? stationTemplate.power[powerArrayRandomIndex] * 1000
          : stationTemplate.power[powerArrayRandomIndex];
    } else {
      stationTemplate.power = stationTemplate?.power as number;
      stationInfo.maximumPower =
        stationTemplate?.powerUnit === PowerUnits.KILO_WATT
          ? stationTemplate.power * 1000
          : stationTemplate.power;
    }
    stationInfo.maximumAmperage = this.getMaximumAmperage(stationInfo);
    stationInfo.firmwareVersionPattern =
      stationTemplate?.firmwareVersionPattern ?? Constants.SEMVER_PATTERN;
    if (
      isNotEmptyString(stationInfo.firmwareVersion) &&
      new RegExp(stationInfo.firmwareVersionPattern).test(stationInfo.firmwareVersion!) === false
    ) {
      logger.warn(
        `${this.logPrefix()} Firmware version '${stationInfo.firmwareVersion}' in template file ${
          this.templateFile
        } does not match firmware version pattern '${stationInfo.firmwareVersionPattern}'`,
      );
    }
    stationInfo.firmwareUpgrade = merge<FirmwareUpgrade>(
      {
        versionUpgrade: {
          step: 1,
        },
        reset: true,
      },
      stationTemplate?.firmwareUpgrade ?? {},
    );
    stationInfo.resetTime = !isNullOrUndefined(stationTemplate?.resetTime)
      ? secondsToMilliseconds(stationTemplate.resetTime!)
      : Constants.CHARGING_STATION_DEFAULT_RESET_TIME;
    return stationInfo;
  }

  private getStationInfoFromFile(
    stationInfoPersistentConfiguration = true,
  ): ChargingStationInfo | undefined {
    let stationInfo: ChargingStationInfo | undefined;
    if (stationInfoPersistentConfiguration === true) {
      stationInfo = this.getConfigurationFromFile()?.stationInfo;
      if (stationInfo) {
        delete stationInfo?.infoHash;
      }
    }
    return stationInfo;
  }

  private getStationInfo(): ChargingStationInfo {
    const defaultStationInfo: Partial<ChargingStationInfo> = {
      enableStatistics: false,
      remoteAuthorization: true,
      currentOutType: CurrentType.AC,
      mainVoltageMeterValues: true,
      phaseLineToLineVoltageMeterValues: false,
      customValueLimitationMeterValues: true,
      ocppStrictCompliance: true,
      outOfOrderEndMeterValues: false,
      beginEndMeterValues: false,
      meteringPerTransaction: true,
      transactionDataMeterValues: false,
      supervisionUrlOcppConfiguration: false,
      supervisionUrlOcppKey: VendorParametersKey.ConnectionUrl,
      ocppVersion: OCPPVersion.VERSION_16,
      ocppPersistentConfiguration: true,
      stationInfoPersistentConfiguration: true,
      automaticTransactionGeneratorPersistentConfiguration: true,
      autoReconnectMaxRetries: -1,
      registrationMaxRetries: -1,
      reconnectExponentialDelay: false,
      stopTransactionsOnStopped: true,
    };
    const stationInfoFromTemplate: ChargingStationInfo = this.getStationInfoFromTemplate();
    const stationInfoFromFile: ChargingStationInfo | undefined = this.getStationInfoFromFile(
      stationInfoFromTemplate?.stationInfoPersistentConfiguration,
    );
    // Priority:
    // 1. charging station info from template
    // 2. charging station info from configuration file
    if (stationInfoFromFile?.templateHash === stationInfoFromTemplate.templateHash) {
      return { ...defaultStationInfo, ...stationInfoFromFile! };
    }
    stationInfoFromFile &&
      propagateSerialNumber(
        this.getTemplateFromFile()!,
        stationInfoFromFile,
        stationInfoFromTemplate,
      );
    return { ...defaultStationInfo, ...stationInfoFromTemplate };
  }

  private saveStationInfo(): void {
    if (this.stationInfo?.stationInfoPersistentConfiguration === true) {
      this.saveConfiguration();
    }
  }

  private handleUnsupportedVersion(version: OCPPVersion | undefined) {
    const errorMsg = `Unsupported protocol version '${version}' configured in template file ${this.templateFile}`;
    logger.error(`${this.logPrefix()} ${errorMsg}`);
    throw new BaseError(errorMsg);
  }

  private initialize(): void {
    const stationTemplate = this.getTemplateFromFile()!;
    checkTemplate(stationTemplate, this.logPrefix(), this.templateFile);
    this.configurationFile = join(
      dirname(this.templateFile.replace('station-templates', 'configurations')),
      `${getHashId(this.index, stationTemplate)}.json`,
    );
    const stationConfiguration = this.getConfigurationFromFile();
    if (
      stationConfiguration?.stationInfo?.templateHash === stationTemplate?.templateHash &&
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      (stationConfiguration?.connectorsStatus || stationConfiguration?.evsesStatus)
    ) {
      this.initializeConnectorsOrEvsesFromFile(stationConfiguration);
    } else {
      this.initializeConnectorsOrEvsesFromTemplate(stationTemplate);
    }
    this.stationInfo = this.getStationInfo();
    if (
      this.stationInfo.firmwareStatus === FirmwareStatus.Installing &&
      isNotEmptyString(this.stationInfo.firmwareVersion) &&
      isNotEmptyString(this.stationInfo.firmwareVersionPattern)
    ) {
      const patternGroup: number | undefined =
        this.stationInfo.firmwareUpgrade?.versionUpgrade?.patternGroup ??
        this.stationInfo.firmwareVersion?.split('.').length;
      const match = this.stationInfo
        .firmwareVersion!.match(new RegExp(this.stationInfo.firmwareVersionPattern!))!
        .slice(1, patternGroup! + 1);
      const patchLevelIndex = match.length - 1;
      match[patchLevelIndex] = (
        convertToInt(match[patchLevelIndex]) +
        this.stationInfo.firmwareUpgrade!.versionUpgrade!.step!
      ).toString();
      this.stationInfo.firmwareVersion = match?.join('.');
    }
    this.saveStationInfo();
    this.configuredSupervisionUrl = this.getConfiguredSupervisionUrl();
    if (this.stationInfo?.enableStatistics === true) {
      this.performanceStatistics = PerformanceStatistics.getInstance(
        this.stationInfo.hashId,
        this.stationInfo.chargingStationId!,
        this.configuredSupervisionUrl,
      );
    }
    this.bootNotificationRequest = createBootNotificationRequest(this.stationInfo);
    this.powerDivider = this.getPowerDivider();
    // OCPP configuration
    this.ocppConfiguration = this.getOcppConfiguration();
    this.initializeOcppConfiguration();
    this.initializeOcppServices();
    this.once(ChargingStationEvents.accepted, () => {
      this.startMessageSequence().catch((error) => {
        logger.error(`${this.logPrefix()} Error while starting the message sequence:`, error);
      });
    });
    if (this.stationInfo?.autoRegister === true) {
      this.bootNotificationResponse = {
        currentTime: new Date(),
        interval: millisecondsToSeconds(this.getHeartbeatInterval()),
        status: RegistrationStatusEnumType.ACCEPTED,
      };
    }
  }

  private initializeOcppServices(): void {
    const ocppVersion = this.stationInfo?.ocppVersion;
    switch (ocppVersion) {
      case OCPPVersion.VERSION_16:
        this.ocppIncomingRequestService =
          OCPP16IncomingRequestService.getInstance<OCPP16IncomingRequestService>();
        this.ocppRequestService = OCPP16RequestService.getInstance<OCPP16RequestService>(
          OCPP16ResponseService.getInstance<OCPP16ResponseService>(),
        );
        break;
      case OCPPVersion.VERSION_20:
      case OCPPVersion.VERSION_201:
        this.ocppIncomingRequestService =
          OCPP20IncomingRequestService.getInstance<OCPP20IncomingRequestService>();
        this.ocppRequestService = OCPP20RequestService.getInstance<OCPP20RequestService>(
          OCPP20ResponseService.getInstance<OCPP20ResponseService>(),
        );
        break;
      default:
        this.handleUnsupportedVersion(ocppVersion);
        break;
    }
  }

  private initializeOcppConfiguration(): void {
    if (isNullOrUndefined(getConfigurationKey(this, StandardParametersKey.HeartbeatInterval))) {
      addConfigurationKey(this, StandardParametersKey.HeartbeatInterval, '0');
    }
    if (isNullOrUndefined(getConfigurationKey(this, StandardParametersKey.HeartBeatInterval))) {
      addConfigurationKey(this, StandardParametersKey.HeartBeatInterval, '0', { visible: false });
    }
    if (
      this.stationInfo?.supervisionUrlOcppConfiguration === true &&
      isNotEmptyString(this.stationInfo?.supervisionUrlOcppKey) &&
      isNullOrUndefined(getConfigurationKey(this, this.stationInfo.supervisionUrlOcppKey!))
    ) {
      addConfigurationKey(
        this,
        this.stationInfo.supervisionUrlOcppKey!,
        this.configuredSupervisionUrl.href,
        { reboot: true },
      );
    } else if (
      this.stationInfo?.supervisionUrlOcppConfiguration === false &&
      isNotEmptyString(this.stationInfo?.supervisionUrlOcppKey) &&
      !isNullOrUndefined(getConfigurationKey(this, this.stationInfo.supervisionUrlOcppKey!))
    ) {
      deleteConfigurationKey(this, this.stationInfo.supervisionUrlOcppKey!, { save: false });
    }
    if (
      isNotEmptyString(this.stationInfo?.amperageLimitationOcppKey) &&
      isNullOrUndefined(getConfigurationKey(this, this.stationInfo.amperageLimitationOcppKey!))
    ) {
      addConfigurationKey(
        this,
        this.stationInfo.amperageLimitationOcppKey!,
        (
          this.stationInfo.maximumAmperage! * getAmperageLimitationUnitDivider(this.stationInfo)
        ).toString(),
      );
    }
    if (
      isNullOrUndefined(getConfigurationKey(this, StandardParametersKey.SupportedFeatureProfiles))
    ) {
      addConfigurationKey(
        this,
        StandardParametersKey.SupportedFeatureProfiles,
        `${SupportedFeatureProfiles.Core},${SupportedFeatureProfiles.FirmwareManagement},${SupportedFeatureProfiles.LocalAuthListManagement},${SupportedFeatureProfiles.SmartCharging},${SupportedFeatureProfiles.RemoteTrigger}`,
      );
    }
    addConfigurationKey(
      this,
      StandardParametersKey.NumberOfConnectors,
      this.getNumberOfConnectors().toString(),
      { readonly: true },
      { overwrite: true },
    );
    if (
      isNullOrUndefined(getConfigurationKey(this, StandardParametersKey.MeterValuesSampledData))
    ) {
      addConfigurationKey(
        this,
        StandardParametersKey.MeterValuesSampledData,
        MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
      );
    }
    if (
      isNullOrUndefined(getConfigurationKey(this, StandardParametersKey.ConnectorPhaseRotation))
    ) {
      const connectorsPhaseRotation: string[] = [];
      if (this.hasEvses) {
        for (const evseStatus of this.evses.values()) {
          for (const connectorId of evseStatus.connectors.keys()) {
            connectorsPhaseRotation.push(
              getPhaseRotationValue(connectorId, this.getNumberOfPhases())!,
            );
          }
        }
      } else {
        for (const connectorId of this.connectors.keys()) {
          connectorsPhaseRotation.push(
            getPhaseRotationValue(connectorId, this.getNumberOfPhases())!,
          );
        }
      }
      addConfigurationKey(
        this,
        StandardParametersKey.ConnectorPhaseRotation,
        connectorsPhaseRotation.toString(),
      );
    }
    if (
      isNullOrUndefined(getConfigurationKey(this, StandardParametersKey.AuthorizeRemoteTxRequests))
    ) {
      addConfigurationKey(this, StandardParametersKey.AuthorizeRemoteTxRequests, 'true');
    }
    if (
      isNullOrUndefined(getConfigurationKey(this, StandardParametersKey.LocalAuthListEnabled)) &&
      getConfigurationKey(this, StandardParametersKey.SupportedFeatureProfiles)?.value?.includes(
        SupportedFeatureProfiles.LocalAuthListManagement,
      )
    ) {
      addConfigurationKey(this, StandardParametersKey.LocalAuthListEnabled, 'false');
    }
    if (isNullOrUndefined(getConfigurationKey(this, StandardParametersKey.ConnectionTimeOut))) {
      addConfigurationKey(
        this,
        StandardParametersKey.ConnectionTimeOut,
        Constants.DEFAULT_CONNECTION_TIMEOUT.toString(),
      );
    }
    this.saveOcppConfiguration();
  }

  private initializeConnectorsOrEvsesFromFile(configuration: ChargingStationConfiguration): void {
    if (configuration?.connectorsStatus && !configuration?.evsesStatus) {
      for (const [connectorId, connectorStatus] of configuration.connectorsStatus.entries()) {
        this.connectors.set(connectorId, cloneObject<ConnectorStatus>(connectorStatus));
      }
    } else if (configuration?.evsesStatus && !configuration?.connectorsStatus) {
      for (const [evseId, evseStatusConfiguration] of configuration.evsesStatus.entries()) {
        const evseStatus = cloneObject<EvseStatusConfiguration>(evseStatusConfiguration);
        delete evseStatus.connectorsStatus;
        this.evses.set(evseId, {
          ...(evseStatus as EvseStatus),
          connectors: new Map<number, ConnectorStatus>(
            evseStatusConfiguration.connectorsStatus!.map((connectorStatus, connectorId) => [
              connectorId,
              connectorStatus,
            ]),
          ),
        });
      }
    } else if (configuration?.evsesStatus && configuration?.connectorsStatus) {
      const errorMsg = `Connectors and evses defined at the same time in configuration file ${this.configurationFile}`;
      logger.error(`${this.logPrefix()} ${errorMsg}`);
      throw new BaseError(errorMsg);
    } else {
      const errorMsg = `No connectors or evses defined in configuration file ${this.configurationFile}`;
      logger.error(`${this.logPrefix()} ${errorMsg}`);
      throw new BaseError(errorMsg);
    }
  }

  private initializeConnectorsOrEvsesFromTemplate(stationTemplate: ChargingStationTemplate) {
    if (stationTemplate?.Connectors && !stationTemplate?.Evses) {
      this.initializeConnectorsFromTemplate(stationTemplate);
    } else if (stationTemplate?.Evses && !stationTemplate?.Connectors) {
      this.initializeEvsesFromTemplate(stationTemplate);
    } else if (stationTemplate?.Evses && stationTemplate?.Connectors) {
      const errorMsg = `Connectors and evses defined at the same time in template file ${this.templateFile}`;
      logger.error(`${this.logPrefix()} ${errorMsg}`);
      throw new BaseError(errorMsg);
    } else {
      const errorMsg = `No connectors or evses defined in template file ${this.templateFile}`;
      logger.error(`${this.logPrefix()} ${errorMsg}`);
      throw new BaseError(errorMsg);
    }
  }

  private initializeConnectorsFromTemplate(stationTemplate: ChargingStationTemplate): void {
    if (!stationTemplate?.Connectors && this.connectors.size === 0) {
      const errorMsg = `No already defined connectors and charging station information from template ${this.templateFile} with no connectors configuration defined`;
      logger.error(`${this.logPrefix()} ${errorMsg}`);
      throw new BaseError(errorMsg);
    }
    if (!stationTemplate?.Connectors?.[0]) {
      logger.warn(
        `${this.logPrefix()} Charging station information from template ${
          this.templateFile
        } with no connector id 0 configuration`,
      );
    }
    if (stationTemplate?.Connectors) {
      const { configuredMaxConnectors, templateMaxConnectors, templateMaxAvailableConnectors } =
        checkConnectorsConfiguration(stationTemplate, this.logPrefix(), this.templateFile);
      const connectorsConfigHash = createHash(Constants.DEFAULT_HASH_ALGORITHM)
        .update(
          `${JSON.stringify(stationTemplate?.Connectors)}${configuredMaxConnectors.toString()}`,
        )
        .digest('hex');
      const connectorsConfigChanged =
        this.connectors?.size !== 0 && this.connectorsConfigurationHash !== connectorsConfigHash;
      if (this.connectors?.size === 0 || connectorsConfigChanged) {
        connectorsConfigChanged && this.connectors.clear();
        this.connectorsConfigurationHash = connectorsConfigHash;
        if (templateMaxConnectors > 0) {
          for (let connectorId = 0; connectorId <= configuredMaxConnectors; connectorId++) {
            if (
              connectorId === 0 &&
              (!stationTemplate?.Connectors?.[connectorId] ||
                this.getUseConnectorId0(stationTemplate) === false)
            ) {
              continue;
            }
            const templateConnectorId =
              connectorId > 0 && stationTemplate?.randomConnectors
                ? getRandomInteger(templateMaxAvailableConnectors, 1)
                : connectorId;
            const connectorStatus = stationTemplate?.Connectors[templateConnectorId];
            checkStationInfoConnectorStatus(
              templateConnectorId,
              connectorStatus,
              this.logPrefix(),
              this.templateFile,
            );
            this.connectors.set(connectorId, cloneObject<ConnectorStatus>(connectorStatus));
          }
          initializeConnectorsMapStatus(this.connectors, this.logPrefix());
          this.saveConnectorsStatus();
        } else {
          logger.warn(
            `${this.logPrefix()} Charging station information from template ${
              this.templateFile
            } with no connectors configuration defined, cannot create connectors`,
          );
        }
      }
    } else {
      logger.warn(
        `${this.logPrefix()} Charging station information from template ${
          this.templateFile
        } with no connectors configuration defined, using already defined connectors`,
      );
    }
  }

  private initializeEvsesFromTemplate(stationTemplate: ChargingStationTemplate): void {
    if (!stationTemplate?.Evses && this.evses.size === 0) {
      const errorMsg = `No already defined evses and charging station information from template ${this.templateFile} with no evses configuration defined`;
      logger.error(`${this.logPrefix()} ${errorMsg}`);
      throw new BaseError(errorMsg);
    }
    if (!stationTemplate?.Evses?.[0]) {
      logger.warn(
        `${this.logPrefix()} Charging station information from template ${
          this.templateFile
        } with no evse id 0 configuration`,
      );
    }
    if (!stationTemplate?.Evses?.[0]?.Connectors?.[0]) {
      logger.warn(
        `${this.logPrefix()} Charging station information from template ${
          this.templateFile
        } with evse id 0 with no connector id 0 configuration`,
      );
    }
    if (Object.keys(stationTemplate?.Evses?.[0]?.Connectors as object).length > 1) {
      logger.warn(
        `${this.logPrefix()} Charging station information from template ${
          this.templateFile
        } with evse id 0 with more than one connector configuration, only connector id 0 configuration will be used`,
      );
    }
    if (stationTemplate?.Evses) {
      const evsesConfigHash = createHash(Constants.DEFAULT_HASH_ALGORITHM)
        .update(JSON.stringify(stationTemplate?.Evses))
        .digest('hex');
      const evsesConfigChanged =
        this.evses?.size !== 0 && this.evsesConfigurationHash !== evsesConfigHash;
      if (this.evses?.size === 0 || evsesConfigChanged) {
        evsesConfigChanged && this.evses.clear();
        this.evsesConfigurationHash = evsesConfigHash;
        const templateMaxEvses = getMaxNumberOfEvses(stationTemplate?.Evses);
        if (templateMaxEvses > 0) {
          for (const evseKey in stationTemplate.Evses) {
            const evseId = convertToInt(evseKey);
            this.evses.set(evseId, {
              connectors: buildConnectorsMap(
                stationTemplate?.Evses[evseKey]?.Connectors,
                this.logPrefix(),
                this.templateFile,
              ),
              availability: AvailabilityType.Operative,
            });
            initializeConnectorsMapStatus(this.evses.get(evseId)!.connectors, this.logPrefix());
          }
          this.saveEvsesStatus();
        } else {
          logger.warn(
            `${this.logPrefix()} Charging station information from template ${
              this.templateFile
            } with no evses configuration defined, cannot create evses`,
          );
        }
      }
    } else {
      logger.warn(
        `${this.logPrefix()} Charging station information from template ${
          this.templateFile
        } with no evses configuration defined, using already defined evses`,
      );
    }
  }

  private getConfigurationFromFile(): ChargingStationConfiguration | undefined {
    let configuration: ChargingStationConfiguration | undefined;
    if (isNotEmptyString(this.configurationFile) && existsSync(this.configurationFile)) {
      try {
        if (this.sharedLRUCache.hasChargingStationConfiguration(this.configurationFileHash)) {
          configuration = this.sharedLRUCache.getChargingStationConfiguration(
            this.configurationFileHash,
          );
        } else {
          const measureId = `${FileType.ChargingStationConfiguration} read`;
          const beginId = PerformanceStatistics.beginMeasure(measureId);
          configuration = JSON.parse(
            readFileSync(this.configurationFile, 'utf8'),
          ) as ChargingStationConfiguration;
          PerformanceStatistics.endMeasure(measureId, beginId);
          this.sharedLRUCache.setChargingStationConfiguration(configuration);
          this.configurationFileHash = configuration.configurationHash!;
        }
      } catch (error) {
        handleFileException(
          this.configurationFile,
          FileType.ChargingStationConfiguration,
          error as NodeJS.ErrnoException,
          this.logPrefix(),
        );
      }
    }
    return configuration;
  }

  private saveAutomaticTransactionGeneratorConfiguration(): void {
    if (this.stationInfo?.automaticTransactionGeneratorPersistentConfiguration === true) {
      this.saveConfiguration();
    }
  }

  private saveConnectorsStatus() {
    this.saveConfiguration();
  }

  private saveEvsesStatus() {
    this.saveConfiguration();
  }

  private saveConfiguration(): void {
    if (isNotEmptyString(this.configurationFile)) {
      try {
        if (!existsSync(dirname(this.configurationFile))) {
          mkdirSync(dirname(this.configurationFile), { recursive: true });
        }
        let configurationData: ChargingStationConfiguration = this.getConfigurationFromFile()
          ? cloneObject<ChargingStationConfiguration>(this.getConfigurationFromFile()!)
          : {};
        if (this.stationInfo?.stationInfoPersistentConfiguration === true && this.stationInfo) {
          configurationData.stationInfo = this.stationInfo;
        } else {
          delete configurationData.stationInfo;
        }
        if (
          this.stationInfo?.ocppPersistentConfiguration === true &&
          Array.isArray(this.ocppConfiguration?.configurationKey)
        ) {
          configurationData.configurationKey = this.ocppConfiguration?.configurationKey;
        } else {
          delete configurationData.configurationKey;
        }
        configurationData = merge<ChargingStationConfiguration>(
          configurationData,
          buildChargingStationAutomaticTransactionGeneratorConfiguration(this),
        );
        if (
          !this.stationInfo?.automaticTransactionGeneratorPersistentConfiguration ||
          !this.getAutomaticTransactionGeneratorConfiguration()
        ) {
          delete configurationData.automaticTransactionGenerator;
        }
        if (this.connectors.size > 0) {
          configurationData.connectorsStatus = buildConnectorsStatus(this);
        } else {
          delete configurationData.connectorsStatus;
        }
        if (this.evses.size > 0) {
          configurationData.evsesStatus = buildEvsesStatus(this);
        } else {
          delete configurationData.evsesStatus;
        }
        delete configurationData.configurationHash;
        const configurationHash = createHash(Constants.DEFAULT_HASH_ALGORITHM)
          .update(
            JSON.stringify({
              stationInfo: configurationData.stationInfo,
              configurationKey: configurationData.configurationKey,
              automaticTransactionGenerator: configurationData.automaticTransactionGenerator,
              ...(this.connectors.size > 0 && {
                connectorsStatus: configurationData.connectorsStatus,
              }),
              ...(this.evses.size > 0 && { evsesStatus: configurationData.evsesStatus }),
            } as ChargingStationConfiguration),
          )
          .digest('hex');
        if (this.configurationFileHash !== configurationHash) {
          AsyncLock.runExclusive(AsyncLockType.configuration, () => {
            configurationData.configurationHash = configurationHash;
            const measureId = `${FileType.ChargingStationConfiguration} write`;
            const beginId = PerformanceStatistics.beginMeasure(measureId);
            writeFileSync(
              this.configurationFile,
              JSON.stringify(configurationData, undefined, 2),
              'utf8',
            );
            PerformanceStatistics.endMeasure(measureId, beginId);
            this.sharedLRUCache.deleteChargingStationConfiguration(this.configurationFileHash);
            this.sharedLRUCache.setChargingStationConfiguration(configurationData);
            this.configurationFileHash = configurationHash;
          }).catch((error) => {
            handleFileException(
              this.configurationFile,
              FileType.ChargingStationConfiguration,
              error as NodeJS.ErrnoException,
              this.logPrefix(),
            );
          });
        } else {
          logger.debug(
            `${this.logPrefix()} Not saving unchanged charging station configuration file ${
              this.configurationFile
            }`,
          );
        }
      } catch (error) {
        handleFileException(
          this.configurationFile,
          FileType.ChargingStationConfiguration,
          error as NodeJS.ErrnoException,
          this.logPrefix(),
        );
      }
    } else {
      logger.error(
        `${this.logPrefix()} Trying to save charging station configuration to undefined configuration file`,
      );
    }
  }

  private getOcppConfigurationFromTemplate(): ChargingStationOcppConfiguration | undefined {
    return this.getTemplateFromFile()?.Configuration;
  }

  private getOcppConfigurationFromFile(): ChargingStationOcppConfiguration | undefined {
    const configurationKey = this.getConfigurationFromFile()?.configurationKey;
    if (this.stationInfo?.ocppPersistentConfiguration === true && Array.isArray(configurationKey)) {
      return { configurationKey };
    }
    return undefined;
  }

  private getOcppConfiguration(): ChargingStationOcppConfiguration | undefined {
    let ocppConfiguration: ChargingStationOcppConfiguration | undefined =
      this.getOcppConfigurationFromFile();
    if (!ocppConfiguration) {
      ocppConfiguration = this.getOcppConfigurationFromTemplate();
    }
    return ocppConfiguration;
  }

  private async onOpen(): Promise<void> {
    if (this.isWebSocketConnectionOpened() === true) {
      logger.info(
        `${this.logPrefix()} Connection to OCPP server through ${this.wsConnectionUrl.toString()} succeeded`,
      );
      let registrationRetryCount = 0;
      if (this.isRegistered() === false) {
        // Send BootNotification
        do {
          this.bootNotificationResponse = await this.ocppRequestService.requestHandler<
            BootNotificationRequest,
            BootNotificationResponse
          >(this, RequestCommand.BOOT_NOTIFICATION, this.bootNotificationRequest, {
            skipBufferingOnError: true,
          });
          if (this.isRegistered() === false) {
            this.stationInfo?.registrationMaxRetries !== -1 && ++registrationRetryCount;
            await sleep(
              this?.bootNotificationResponse?.interval
                ? secondsToMilliseconds(this.bootNotificationResponse.interval)
                : Constants.DEFAULT_BOOT_NOTIFICATION_INTERVAL,
            );
          }
        } while (
          this.isRegistered() === false &&
          (registrationRetryCount <= this.stationInfo.registrationMaxRetries! ||
            this.stationInfo?.registrationMaxRetries === -1)
        );
      }
      if (this.isRegistered() === true) {
        this.emit(ChargingStationEvents.registered);
        if (this.inAcceptedState() === true) {
          this.emit(ChargingStationEvents.accepted);
        }
      } else {
        logger.error(
          `${this.logPrefix()} Registration failure: maximum retries reached (${registrationRetryCount}) or retry disabled (${this
            .stationInfo?.registrationMaxRetries})`,
        );
      }
      this.autoReconnectRetryCount = 0;
      this.emit(ChargingStationEvents.updated);
    } else {
      logger.warn(
        `${this.logPrefix()} Connection to OCPP server through ${this.wsConnectionUrl.toString()} failed`,
      );
    }
  }

  private async onClose(code: WebSocketCloseEventStatusCode, reason: Buffer): Promise<void> {
    switch (code) {
      // Normal close
      case WebSocketCloseEventStatusCode.CLOSE_NORMAL:
      case WebSocketCloseEventStatusCode.CLOSE_NO_STATUS:
        logger.info(
          `${this.logPrefix()} WebSocket normally closed with status '${getWebSocketCloseEventStatusString(
            code,
          )}' and reason '${reason.toString()}'`,
        );
        this.autoReconnectRetryCount = 0;
        break;
      // Abnormal close
      default:
        logger.error(
          `${this.logPrefix()} WebSocket abnormally closed with status '${getWebSocketCloseEventStatusString(
            code,
          )}' and reason '${reason.toString()}'`,
        );
        this.started === true && (await this.reconnect());
        break;
    }
    this.emit(ChargingStationEvents.updated);
  }

  private getCachedRequest(messageType: MessageType, messageId: string): CachedRequest | undefined {
    const cachedRequest = this.requests.get(messageId);
    if (Array.isArray(cachedRequest) === true) {
      return cachedRequest;
    }
    throw new OCPPError(
      ErrorType.PROTOCOL_ERROR,
      `Cached request for message id ${messageId} ${OCPPServiceUtils.getMessageTypeString(
        messageType,
      )} is not an array`,
      undefined,
      cachedRequest as JsonType,
    );
  }

  private async handleIncomingMessage(request: IncomingRequest): Promise<void> {
    const [messageType, messageId, commandName, commandPayload] = request;
    if (this.stationInfo?.enableStatistics === true) {
      this.performanceStatistics?.addRequestStatistic(commandName, messageType);
    }
    logger.debug(
      `${this.logPrefix()} << Command '${commandName}' received request payload: ${JSON.stringify(
        request,
      )}`,
    );
    // Process the message
    await this.ocppIncomingRequestService.incomingRequestHandler(
      this,
      messageId,
      commandName,
      commandPayload,
    );
    this.emit(ChargingStationEvents.updated);
  }

  private handleResponseMessage(response: Response): void {
    const [messageType, messageId, commandPayload] = response;
    if (this.requests.has(messageId) === false) {
      // Error
      throw new OCPPError(
        ErrorType.INTERNAL_ERROR,
        `Response for unknown message id ${messageId}`,
        undefined,
        commandPayload,
      );
    }
    // Respond
    const [responseCallback, , requestCommandName, requestPayload] = this.getCachedRequest(
      messageType,
      messageId,
    )!;
    logger.debug(
      `${this.logPrefix()} << Command '${
        requestCommandName ?? Constants.UNKNOWN_COMMAND
      }' received response payload: ${JSON.stringify(response)}`,
    );
    responseCallback(commandPayload, requestPayload);
  }

  private handleErrorMessage(errorResponse: ErrorResponse): void {
    const [messageType, messageId, errorType, errorMessage, errorDetails] = errorResponse;
    if (this.requests.has(messageId) === false) {
      // Error
      throw new OCPPError(
        ErrorType.INTERNAL_ERROR,
        `Error response for unknown message id ${messageId}`,
        undefined,
        { errorType, errorMessage, errorDetails },
      );
    }
    const [, errorCallback, requestCommandName] = this.getCachedRequest(messageType, messageId)!;
    logger.debug(
      `${this.logPrefix()} << Command '${
        requestCommandName ?? Constants.UNKNOWN_COMMAND
      }' received error response payload: ${JSON.stringify(errorResponse)}`,
    );
    errorCallback(new OCPPError(errorType, errorMessage, requestCommandName, errorDetails));
  }

  private async onMessage(data: RawData): Promise<void> {
    let request: IncomingRequest | Response | ErrorResponse | undefined;
    let messageType: MessageType | undefined;
    let errorMsg: string;
    try {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      request = JSON.parse(data.toString()) as IncomingRequest | Response | ErrorResponse;
      if (Array.isArray(request) === true) {
        [messageType] = request;
        // Check the type of message
        switch (messageType) {
          // Incoming Message
          case MessageType.CALL_MESSAGE:
            await this.handleIncomingMessage(request as IncomingRequest);
            break;
          // Response Message
          case MessageType.CALL_RESULT_MESSAGE:
            this.handleResponseMessage(request as Response);
            break;
          // Error Message
          case MessageType.CALL_ERROR_MESSAGE:
            this.handleErrorMessage(request as ErrorResponse);
            break;
          // Unknown Message
          default:
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            errorMsg = `Wrong message type ${messageType}`;
            logger.error(`${this.logPrefix()} ${errorMsg}`);
            throw new OCPPError(ErrorType.PROTOCOL_ERROR, errorMsg);
        }
      } else {
        throw new OCPPError(
          ErrorType.PROTOCOL_ERROR,
          'Incoming message is not an array',
          undefined,
          {
            request,
          },
        );
      }
    } catch (error) {
      let commandName: IncomingRequestCommand | undefined;
      let requestCommandName: RequestCommand | IncomingRequestCommand | undefined;
      let errorCallback: ErrorCallback;
      const [, messageId] = request!;
      switch (messageType) {
        case MessageType.CALL_MESSAGE:
          [, , commandName] = request as IncomingRequest;
          // Send error
          await this.ocppRequestService.sendError(this, messageId, error as OCPPError, commandName);
          break;
        case MessageType.CALL_RESULT_MESSAGE:
        case MessageType.CALL_ERROR_MESSAGE:
          if (this.requests.has(messageId) === true) {
            [, errorCallback, requestCommandName] = this.getCachedRequest(messageType, messageId)!;
            // Reject the deferred promise in case of error at response handling (rejecting an already fulfilled promise is a no-op)
            errorCallback(error as OCPPError, false);
          } else {
            // Remove the request from the cache in case of error at response handling
            this.requests.delete(messageId);
          }
          break;
      }
      if (error instanceof OCPPError === false) {
        logger.warn(
          `${this.logPrefix()} Error thrown at incoming OCPP command '${
            commandName ?? requestCommandName ?? Constants.UNKNOWN_COMMAND
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
          }' message '${data.toString()}' handling is not an OCPPError:`,
          error,
        );
      }
      logger.error(
        `${this.logPrefix()} Incoming OCPP command '${
          commandName ?? requestCommandName ?? Constants.UNKNOWN_COMMAND
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
        }' message '${data.toString()}'${
          messageType !== MessageType.CALL_MESSAGE
            ? ` matching cached request '${JSON.stringify(this.requests.get(messageId))}'`
            : ''
        } processing error:`,
        error,
      );
    }
  }

  private onPing(): void {
    logger.debug(`${this.logPrefix()} Received a WS ping (rfc6455) from the server`);
  }

  private onPong(): void {
    logger.debug(`${this.logPrefix()} Received a WS pong (rfc6455) from the server`);
  }

  private onError(error: WSError): void {
    this.closeWSConnection();
    logger.error(`${this.logPrefix()} WebSocket error:`, error);
  }

  private getEnergyActiveImportRegister(connectorStatus: ConnectorStatus, rounded = false): number {
    if (this.stationInfo?.meteringPerTransaction === true) {
      return (
        (rounded === true
          ? Math.round(connectorStatus.transactionEnergyActiveImportRegisterValue!)
          : connectorStatus?.transactionEnergyActiveImportRegisterValue) ?? 0
      );
    }
    return (
      (rounded === true
        ? Math.round(connectorStatus.energyActiveImportRegisterValue!)
        : connectorStatus?.energyActiveImportRegisterValue) ?? 0
    );
  }

  private getUseConnectorId0(stationTemplate?: ChargingStationTemplate): boolean {
    return stationTemplate?.useConnectorId0 ?? true;
  }

  private async stopRunningTransactions(reason?: StopTransactionReason): Promise<void> {
    if (this.hasEvses) {
      for (const [evseId, evseStatus] of this.evses) {
        if (evseId === 0) {
          continue;
        }
        for (const [connectorId, connectorStatus] of evseStatus.connectors) {
          if (connectorStatus.transactionStarted === true) {
            await this.stopTransactionOnConnector(connectorId, reason);
          }
        }
      }
    } else {
      for (const connectorId of this.connectors.keys()) {
        if (connectorId > 0 && this.getConnectorStatus(connectorId)?.transactionStarted === true) {
          await this.stopTransactionOnConnector(connectorId, reason);
        }
      }
    }
  }

  // 0 for disabling
  private getConnectionTimeout(): number {
    if (getConfigurationKey(this, StandardParametersKey.ConnectionTimeOut) !== undefined) {
      return convertToInt(
        getConfigurationKey(this, StandardParametersKey.ConnectionTimeOut)!.value! ??
          Constants.DEFAULT_CONNECTION_TIMEOUT,
      );
    }
    return Constants.DEFAULT_CONNECTION_TIMEOUT;
  }

  private getPowerDivider(): number {
    let powerDivider = this.hasEvses ? this.getNumberOfEvses() : this.getNumberOfConnectors();
    if (this.stationInfo?.powerSharedByConnectors === true) {
      powerDivider = this.getNumberOfRunningTransactions();
    }
    return powerDivider;
  }

  private getMaximumAmperage(stationInfo?: ChargingStationInfo): number | undefined {
    const maximumPower = (stationInfo ?? this.stationInfo).maximumPower!;
    switch (this.getCurrentOutType(stationInfo)) {
      case CurrentType.AC:
        return ACElectricUtils.amperagePerPhaseFromPower(
          this.getNumberOfPhases(stationInfo),
          maximumPower / (this.hasEvses ? this.getNumberOfEvses() : this.getNumberOfConnectors()),
          this.getVoltageOut(stationInfo),
        );
      case CurrentType.DC:
        return DCElectricUtils.amperage(maximumPower, this.getVoltageOut(stationInfo));
    }
  }

  private getCurrentOutType(stationInfo?: ChargingStationInfo): CurrentType {
    return (stationInfo ?? this.stationInfo).currentOutType ?? CurrentType.AC;
  }

  private getVoltageOut(stationInfo?: ChargingStationInfo): Voltage {
    return (
      (stationInfo ?? this.stationInfo).voltageOut ??
      getDefaultVoltageOut(this.getCurrentOutType(stationInfo), this.logPrefix(), this.templateFile)
    );
  }

  private getAmperageLimitation(): number | undefined {
    if (
      isNotEmptyString(this.stationInfo?.amperageLimitationOcppKey) &&
      getConfigurationKey(this, this.stationInfo.amperageLimitationOcppKey!) !== undefined
    ) {
      return (
        convertToInt(
          getConfigurationKey(this, this.stationInfo.amperageLimitationOcppKey!)?.value,
        ) / getAmperageLimitationUnitDivider(this.stationInfo)
      );
    }
  }

  private async startMessageSequence(): Promise<void> {
    if (this.stationInfo?.autoRegister === true) {
      await this.ocppRequestService.requestHandler<
        BootNotificationRequest,
        BootNotificationResponse
      >(this, RequestCommand.BOOT_NOTIFICATION, this.bootNotificationRequest, {
        skipBufferingOnError: true,
      });
    }
    // Start WebSocket ping
    this.startWebSocketPing();
    // Start heartbeat
    this.startHeartbeat();
    // Initialize connectors status
    if (this.hasEvses) {
      for (const [evseId, evseStatus] of this.evses) {
        if (evseId > 0) {
          for (const [connectorId, connectorStatus] of evseStatus.connectors) {
            const connectorBootStatus = getBootConnectorStatus(this, connectorId, connectorStatus);
            await OCPPServiceUtils.sendAndSetConnectorStatus(
              this,
              connectorId,
              connectorBootStatus,
              evseId,
            );
          }
        }
      }
    } else {
      for (const connectorId of this.connectors.keys()) {
        if (connectorId > 0) {
          const connectorBootStatus = getBootConnectorStatus(
            this,
            connectorId,
            this.getConnectorStatus(connectorId)!,
          );
          await OCPPServiceUtils.sendAndSetConnectorStatus(this, connectorId, connectorBootStatus);
        }
      }
    }
    if (this.stationInfo.firmwareStatus === FirmwareStatus.Installing) {
      await this.ocppRequestService.requestHandler<
        FirmwareStatusNotificationRequest,
        FirmwareStatusNotificationResponse
      >(this, RequestCommand.FIRMWARE_STATUS_NOTIFICATION, {
        status: FirmwareStatus.Installed,
      });
      this.stationInfo.firmwareStatus = FirmwareStatus.Installed;
    }

    // Start the ATG
    if (this.getAutomaticTransactionGeneratorConfiguration().enable === true) {
      this.startAutomaticTransactionGenerator();
    }
    this.flushMessageBuffer();
  }

  private async stopMessageSequence(
    reason?: StopTransactionReason,
    stopTransactions = this.stationInfo?.stopTransactionsOnStopped,
  ): Promise<void> {
    // Stop WebSocket ping
    this.stopWebSocketPing();
    // Stop heartbeat
    this.stopHeartbeat();
    // Stop the ATG
    if (this.automaticTransactionGenerator?.started === true) {
      this.stopAutomaticTransactionGenerator();
    }
    // Stop ongoing transactions
    stopTransactions && (await this.stopRunningTransactions(reason));
    if (this.hasEvses) {
      for (const [evseId, evseStatus] of this.evses) {
        if (evseId > 0) {
          for (const [connectorId, connectorStatus] of evseStatus.connectors) {
            await this.ocppRequestService.requestHandler<
              StatusNotificationRequest,
              StatusNotificationResponse
            >(
              this,
              RequestCommand.STATUS_NOTIFICATION,
              OCPPServiceUtils.buildStatusNotificationRequest(
                this,
                connectorId,
                ConnectorStatusEnum.Unavailable,
                evseId,
              ),
            );
            delete connectorStatus?.status;
          }
        }
      }
    } else {
      for (const connectorId of this.connectors.keys()) {
        if (connectorId > 0) {
          await this.ocppRequestService.requestHandler<
            StatusNotificationRequest,
            StatusNotificationResponse
          >(
            this,
            RequestCommand.STATUS_NOTIFICATION,
            OCPPServiceUtils.buildStatusNotificationRequest(
              this,
              connectorId,
              ConnectorStatusEnum.Unavailable,
            ),
          );
          delete this.getConnectorStatus(connectorId)?.status;
        }
      }
    }
  }

  private startWebSocketPing(): void {
    const webSocketPingInterval: number =
      getConfigurationKey(this, StandardParametersKey.WebSocketPingInterval) !== undefined
        ? convertToInt(
            getConfigurationKey(this, StandardParametersKey.WebSocketPingInterval)?.value,
          )
        : 0;
    if (webSocketPingInterval > 0 && this.webSocketPingSetInterval === undefined) {
      this.webSocketPingSetInterval = setInterval(() => {
        if (this.isWebSocketConnectionOpened() === true) {
          this.wsConnection?.ping();
        }
      }, secondsToMilliseconds(webSocketPingInterval));
      logger.info(
        `${this.logPrefix()} WebSocket ping started every ${formatDurationSeconds(
          webSocketPingInterval,
        )}`,
      );
    } else if (this.webSocketPingSetInterval !== undefined) {
      logger.info(
        `${this.logPrefix()} WebSocket ping already started every ${formatDurationSeconds(
          webSocketPingInterval,
        )}`,
      );
    } else {
      logger.error(
        `${this.logPrefix()} WebSocket ping interval set to ${webSocketPingInterval}, not starting the WebSocket ping`,
      );
    }
  }

  private stopWebSocketPing(): void {
    if (this.webSocketPingSetInterval !== undefined) {
      clearInterval(this.webSocketPingSetInterval);
      delete this.webSocketPingSetInterval;
    }
  }

  private getConfiguredSupervisionUrl(): URL {
    let configuredSupervisionUrl: string;
    const supervisionUrls = this.stationInfo?.supervisionUrls ?? Configuration.getSupervisionUrls();
    if (isNotEmptyArray(supervisionUrls)) {
      let configuredSupervisionUrlIndex: number;
      switch (Configuration.getSupervisionUrlDistribution()) {
        case SupervisionUrlDistribution.RANDOM:
          configuredSupervisionUrlIndex = Math.floor(
            secureRandom() * (supervisionUrls as string[]).length,
          );
          break;
        case SupervisionUrlDistribution.ROUND_ROBIN:
        case SupervisionUrlDistribution.CHARGING_STATION_AFFINITY:
        default:
          Object.values(SupervisionUrlDistribution).includes(
            Configuration.getSupervisionUrlDistribution()!,
          ) === false &&
            logger.error(
              // eslint-disable-next-line @typescript-eslint/no-base-to-string
              `${this.logPrefix()} Unknown supervision url distribution '${Configuration.getSupervisionUrlDistribution()}' from values '${SupervisionUrlDistribution.toString()}', defaulting to ${
                SupervisionUrlDistribution.CHARGING_STATION_AFFINITY
              }`,
            );
          configuredSupervisionUrlIndex = (this.index - 1) % (supervisionUrls as string[]).length;
          break;
      }
      configuredSupervisionUrl = (supervisionUrls as string[])[configuredSupervisionUrlIndex];
    } else {
      configuredSupervisionUrl = supervisionUrls as string;
    }
    if (isNotEmptyString(configuredSupervisionUrl)) {
      return new URL(configuredSupervisionUrl);
    }
    const errorMsg = 'No supervision url(s) configured';
    logger.error(`${this.logPrefix()} ${errorMsg}`);
    throw new BaseError(`${errorMsg}`);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatSetInterval) {
      clearInterval(this.heartbeatSetInterval);
      delete this.heartbeatSetInterval;
    }
  }

  private terminateWSConnection(): void {
    if (this.isWebSocketConnectionOpened() === true) {
      this.wsConnection?.terminate();
      this.wsConnection = null;
    }
  }

  private async reconnect(): Promise<void> {
    // Stop WebSocket ping
    this.stopWebSocketPing();
    // Stop heartbeat
    this.stopHeartbeat();
    // Stop the ATG if needed
    if (this.getAutomaticTransactionGeneratorConfiguration().stopOnConnectionFailure === true) {
      this.stopAutomaticTransactionGenerator();
    }
    if (
      this.autoReconnectRetryCount < this.stationInfo.autoReconnectMaxRetries! ||
      this.stationInfo?.autoReconnectMaxRetries === -1
    ) {
      ++this.autoReconnectRetryCount;
      const reconnectDelay =
        this.stationInfo?.reconnectExponentialDelay === true
          ? exponentialDelay(this.autoReconnectRetryCount)
          : secondsToMilliseconds(this.getConnectionTimeout());
      const reconnectDelayWithdraw = 1000;
      const reconnectTimeout =
        reconnectDelay && reconnectDelay - reconnectDelayWithdraw > 0
          ? reconnectDelay - reconnectDelayWithdraw
          : 0;
      logger.error(
        `${this.logPrefix()} WebSocket connection retry in ${roundTo(
          reconnectDelay,
          2,
        )}ms, timeout ${reconnectTimeout}ms`,
      );
      await sleep(reconnectDelay);
      logger.error(
        `${this.logPrefix()} WebSocket connection retry #${this.autoReconnectRetryCount.toString()}`,
      );
      this.openWSConnection(
        {
          handshakeTimeout: reconnectTimeout,
        },
        { closeOpened: true },
      );
    } else if (this.stationInfo?.autoReconnectMaxRetries !== -1) {
      logger.error(
        `${this.logPrefix()} WebSocket connection retries failure: maximum retries reached (${
          this.autoReconnectRetryCount
        }) or retries disabled (${this.stationInfo?.autoReconnectMaxRetries})`,
      );
    }
  }
}
