// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import { parentPort } from 'node:worker_threads';

import merge from 'just-merge';
import WebSocket, { type RawData } from 'ws';

import {
  AuthorizedTagsCache,
  AutomaticTransactionGenerator,
  ChargingStationConfigurationUtils,
  ChargingStationUtils,
  ChargingStationWorkerBroadcastChannel,
  MessageChannelUtils,
  SharedLRUCache,
} from './internal';
import {
  // OCPP16IncomingRequestService,
  OCPP16RequestService,
  // OCPP16ResponseService,
  OCPP16ServiceUtils,
  OCPP20IncomingRequestService,
  OCPP20RequestService,
  // OCPP20ResponseService,
  type OCPPIncomingRequestService,
  type OCPPRequestService,
  // OCPPServiceUtils,
} from './ocpp';
import { OCPP16IncomingRequestService } from './ocpp/1.6/OCPP16IncomingRequestService';
import { OCPP16ResponseService } from './ocpp/1.6/OCPP16ResponseService';
import { OCPP20ResponseService } from './ocpp/2.0/OCPP20ResponseService';
import { OCPPServiceUtils } from './ocpp/OCPPServiceUtils';
import { BaseError, OCPPError } from '../exception';
import { PerformanceStatistics } from '../performance';
import {
  type AutomaticTransactionGeneratorConfiguration,
  AvailabilityType,
  type BootNotificationRequest,
  type BootNotificationResponse,
  type CachedRequest,
  type ChargingStationConfiguration,
  type ChargingStationInfo,
  type ChargingStationOcppConfiguration,
  type ChargingStationTemplate,
  ConnectorPhaseRotation,
  ConnectorStatus,
  ConnectorStatusEnum,
  CurrentType,
  type ErrorCallback,
  type ErrorResponse,
  ErrorType,
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
  type Response,
  type ResponseCallback,
  StandardParametersKey,
  type StatusNotificationRequest,
  type StatusNotificationResponse,
  StopTransactionReason,
  type StopTransactionRequest,
  type StopTransactionResponse,
  SupervisionUrlDistribution,
  SupportedFeatureProfiles,
  VendorParametersKey,
  type WSError,
  WebSocketCloseEventStatusCode,
  type WsOptions,
} from '../types';
import {
  ACElectricUtils,
  Configuration,
  Constants,
  DCElectricUtils,
  FileUtils,
  Utils,
  logger,
} from '../utils';

export class ChargingStation {
  public readonly index: number;
  public readonly templateFile: string;
  public stationInfo!: ChargingStationInfo;
  public started: boolean;
  public starting: boolean;
  public authorizedTagsCache: AuthorizedTagsCache;
  public automaticTransactionGenerator!: AutomaticTransactionGenerator | undefined;
  public ocppConfiguration!: ChargingStationOcppConfiguration | undefined;
  public wsConnection!: WebSocket | null;
  public readonly connectors: Map<number, ConnectorStatus>;
  public readonly requests: Map<string, CachedRequest>;
  public performanceStatistics!: PerformanceStatistics | undefined;
  public heartbeatSetInterval!: NodeJS.Timeout;
  public ocppRequestService!: OCPPRequestService;
  public bootNotificationRequest!: BootNotificationRequest;
  public bootNotificationResponse!: BootNotificationResponse | undefined;
  public powerDivider!: number;
  private stopping: boolean;
  private configurationFile!: string;
  private configurationFileHash!: string;
  private connectorsConfigurationHash!: string;
  private ocppIncomingRequestService!: OCPPIncomingRequestService;
  private readonly messageBuffer: Set<string>;
  private configuredSupervisionUrl!: URL;
  private configuredSupervisionUrlIndex!: number;
  private wsConnectionRestarted: boolean;
  private autoReconnectRetryCount: number;
  private templateFileWatcher!: fs.FSWatcher | undefined;
  private readonly sharedLRUCache: SharedLRUCache;
  private webSocketPingSetInterval!: NodeJS.Timeout;
  private readonly chargingStationWorkerBroadcastChannel: ChargingStationWorkerBroadcastChannel;

  constructor(index: number, templateFile: string) {
    this.started = false;
    this.starting = false;
    this.stopping = false;
    this.wsConnectionRestarted = false;
    this.autoReconnectRetryCount = 0;
    this.index = index;
    this.templateFile = templateFile;
    this.connectors = new Map<number, ConnectorStatus>();
    this.requests = new Map<string, CachedRequest>();
    this.messageBuffer = new Set<string>();
    this.sharedLRUCache = SharedLRUCache.getInstance();
    this.authorizedTagsCache = AuthorizedTagsCache.getInstance();
    this.chargingStationWorkerBroadcastChannel = new ChargingStationWorkerBroadcastChannel(this);

    this.initialize();
  }

  private get wsConnectionUrl(): URL {
    return new URL(
      `${
        this.getSupervisionUrlOcppConfiguration()
          ? ChargingStationConfigurationUtils.getConfigurationKey(
              this,
              this.getSupervisionUrlOcppKey()
            )?.value
          : this.configuredSupervisionUrl.href
      }/${this.stationInfo.chargingStationId}`
    );
  }

  public logPrefix = (): string => {
    return Utils.logPrefix(
      ` ${
        (Utils.isNotEmptyString(this?.stationInfo?.chargingStationId) &&
          this?.stationInfo?.chargingStationId) ??
        ChargingStationUtils.getChargingStationId(this.index, this.getTemplateFromFile()) ??
        ''
      } |`
    );
  };

  public hasAuthorizedTags(): boolean {
    return Utils.isNotEmptyArray(
      this.authorizedTagsCache.getAuthorizedTags(
        ChargingStationUtils.getAuthorizationFile(this.stationInfo)
      )
    );
  }

  public getEnableStatistics(): boolean {
    return this.stationInfo.enableStatistics ?? false;
  }

  public getMustAuthorizeAtRemoteStart(): boolean {
    return this.stationInfo.mustAuthorizeAtRemoteStart ?? true;
  }

  public getPayloadSchemaValidation(): boolean {
    return this.stationInfo.payloadSchemaValidation ?? true;
  }

  public getNumberOfPhases(stationInfo?: ChargingStationInfo): number | undefined {
    const localStationInfo: ChargingStationInfo = stationInfo ?? this.stationInfo;
    switch (this.getCurrentOutType(stationInfo)) {
      case CurrentType.AC:
        return !Utils.isUndefined(localStationInfo.numberOfPhases)
          ? localStationInfo.numberOfPhases
          : 3;
      case CurrentType.DC:
        return 0;
    }
  }

  public isWebSocketConnectionOpened(): boolean {
    return this?.wsConnection?.readyState === WebSocket.OPEN;
  }

  public getRegistrationStatus(): RegistrationStatusEnumType | undefined {
    return this?.bootNotificationResponse?.status;
  }

  public isInUnknownState(): boolean {
    return Utils.isNullOrUndefined(this?.bootNotificationResponse?.status);
  }

  public isInPendingState(): boolean {
    return this?.bootNotificationResponse?.status === RegistrationStatusEnumType.PENDING;
  }

  public isInAcceptedState(): boolean {
    return this?.bootNotificationResponse?.status === RegistrationStatusEnumType.ACCEPTED;
  }

  public isInRejectedState(): boolean {
    return this?.bootNotificationResponse?.status === RegistrationStatusEnumType.REJECTED;
  }

  public isRegistered(): boolean {
    return (
      this.isInUnknownState() === false &&
      (this.isInAcceptedState() === true || this.isInPendingState() === true)
    );
  }

  public isChargingStationAvailable(): boolean {
    return this.getConnectorStatus(0)?.availability === AvailabilityType.OPERATIVE;
  }

  public isConnectorAvailable(id: number): boolean {
    return id > 0 && this.getConnectorStatus(id)?.availability === AvailabilityType.OPERATIVE;
  }

  public getNumberOfConnectors(): number {
    return this.connectors.get(0) ? this.connectors.size - 1 : this.connectors.size;
  }

  public getConnectorStatus(id: number): ConnectorStatus | undefined {
    return this.connectors.get(id);
  }

  public getCurrentOutType(stationInfo?: ChargingStationInfo): CurrentType {
    return (stationInfo ?? this.stationInfo)?.currentOutType ?? CurrentType.AC;
  }

  public getOcppStrictCompliance(): boolean {
    return this.stationInfo?.ocppStrictCompliance ?? false;
  }

  public getVoltageOut(stationInfo?: ChargingStationInfo): number | undefined {
    const defaultVoltageOut = ChargingStationUtils.getDefaultVoltageOut(
      this.getCurrentOutType(stationInfo),
      this.templateFile,
      this.logPrefix()
    );
    const localStationInfo: ChargingStationInfo = stationInfo ?? this.stationInfo;
    return !Utils.isUndefined(localStationInfo.voltageOut)
      ? localStationInfo.voltageOut
      : defaultVoltageOut;
  }

  public getMaximumPower(stationInfo?: ChargingStationInfo): number {
    const localStationInfo = stationInfo ?? this.stationInfo;
    return (localStationInfo['maxPower'] as number) ?? localStationInfo.maximumPower;
  }

  public getConnectorMaximumAvailablePower(connectorId: number): number {
    let connectorAmperageLimitationPowerLimit: number;
    if (
      !Utils.isNullOrUndefined(this.getAmperageLimitation()) &&
      this.getAmperageLimitation() < this.stationInfo?.maximumAmperage
    ) {
      connectorAmperageLimitationPowerLimit =
        (this.getCurrentOutType() === CurrentType.AC
          ? ACElectricUtils.powerTotal(
              this.getNumberOfPhases(),
              this.getVoltageOut(),
              this.getAmperageLimitation() * this.getNumberOfConnectors()
            )
          : DCElectricUtils.power(this.getVoltageOut(), this.getAmperageLimitation())) /
        this.powerDivider;
    }
    const connectorMaximumPower = this.getMaximumPower() / this.powerDivider;
    const connectorChargingProfilesPowerLimit =
      ChargingStationUtils.getChargingStationConnectorChargingProfilesPowerLimit(this, connectorId);
    return Math.min(
      isNaN(connectorMaximumPower) ? Infinity : connectorMaximumPower,
      isNaN(connectorAmperageLimitationPowerLimit)
        ? Infinity
        : connectorAmperageLimitationPowerLimit,
      isNaN(connectorChargingProfilesPowerLimit) ? Infinity : connectorChargingProfilesPowerLimit
    );
  }

  public getTransactionIdTag(transactionId: number): string | undefined {
    for (const connectorId of this.connectors.keys()) {
      if (
        connectorId > 0 &&
        this.getConnectorStatus(connectorId)?.transactionId === transactionId
      ) {
        return this.getConnectorStatus(connectorId)?.transactionIdTag;
      }
    }
  }

  public getOutOfOrderEndMeterValues(): boolean {
    return this.stationInfo?.outOfOrderEndMeterValues ?? false;
  }

  public getBeginEndMeterValues(): boolean {
    return this.stationInfo?.beginEndMeterValues ?? false;
  }

  public getMeteringPerTransaction(): boolean {
    return this.stationInfo?.meteringPerTransaction ?? true;
  }

  public getTransactionDataMeterValues(): boolean {
    return this.stationInfo?.transactionDataMeterValues ?? false;
  }

  public getMainVoltageMeterValues(): boolean {
    return this.stationInfo?.mainVoltageMeterValues ?? true;
  }

  public getPhaseLineToLineVoltageMeterValues(): boolean {
    return this.stationInfo?.phaseLineToLineVoltageMeterValues ?? false;
  }

  public getCustomValueLimitationMeterValues(): boolean {
    return this.stationInfo?.customValueLimitationMeterValues ?? true;
  }

  public getConnectorIdByTransactionId(transactionId: number): number | undefined {
    for (const connectorId of this.connectors.keys()) {
      if (
        connectorId > 0 &&
        this.getConnectorStatus(connectorId)?.transactionId === transactionId
      ) {
        return connectorId;
      }
    }
  }

  public getEnergyActiveImportRegisterByTransactionId(
    transactionId: number,
    rounded = false
  ): number {
    return this.getEnergyActiveImportRegister(
      this.getConnectorStatus(this.getConnectorIdByTransactionId(transactionId)),
      rounded
    );
  }

  public getEnergyActiveImportRegisterByConnectorId(connectorId: number, rounded = false): number {
    return this.getEnergyActiveImportRegister(this.getConnectorStatus(connectorId), rounded);
  }

  public getAuthorizeRemoteTxRequests(): boolean {
    const authorizeRemoteTxRequests = ChargingStationConfigurationUtils.getConfigurationKey(
      this,
      StandardParametersKey.AuthorizeRemoteTxRequests
    );
    return authorizeRemoteTxRequests
      ? Utils.convertToBoolean(authorizeRemoteTxRequests.value)
      : false;
  }

  public getLocalAuthListEnabled(): boolean {
    const localAuthListEnabled = ChargingStationConfigurationUtils.getConfigurationKey(
      this,
      StandardParametersKey.LocalAuthListEnabled
    );
    return localAuthListEnabled ? Utils.convertToBoolean(localAuthListEnabled.value) : false;
  }

  public startHeartbeat(): void {
    if (
      this.getHeartbeatInterval() &&
      this.getHeartbeatInterval() > 0 &&
      !this.heartbeatSetInterval
    ) {
      this.heartbeatSetInterval = setInterval(() => {
        this.ocppRequestService
          .requestHandler<HeartbeatRequest, HeartbeatResponse>(this, RequestCommand.HEARTBEAT)
          .catch((error) => {
            logger.error(
              `${this.logPrefix()} Error while sending '${RequestCommand.HEARTBEAT}':`,
              error
            );
          });
      }, this.getHeartbeatInterval());
      logger.info(
        `${this.logPrefix()} Heartbeat started every ${Utils.formatDurationMilliSeconds(
          this.getHeartbeatInterval()
        )}`
      );
    } else if (this.heartbeatSetInterval) {
      logger.info(
        `${this.logPrefix()} Heartbeat already started every ${Utils.formatDurationMilliSeconds(
          this.getHeartbeatInterval()
        )}`
      );
    } else {
      logger.error(
        `${this.logPrefix()} Heartbeat interval set to ${
          this.getHeartbeatInterval()
            ? Utils.formatDurationMilliSeconds(this.getHeartbeatInterval())
            : this.getHeartbeatInterval()
        }, not starting the heartbeat`
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
        `${this.logPrefix()} Trying to start MeterValues on connector Id ${connectorId.toString()}`
      );
      return;
    }
    if (!this.getConnectorStatus(connectorId)) {
      logger.error(
        `${this.logPrefix()} Trying to start MeterValues on non existing connector Id ${connectorId.toString()}`
      );
      return;
    }
    if (this.getConnectorStatus(connectorId)?.transactionStarted === false) {
      logger.error(
        `${this.logPrefix()} Trying to start MeterValues on connector Id ${connectorId} with no transaction started`
      );
      return;
    } else if (
      this.getConnectorStatus(connectorId)?.transactionStarted === true &&
      Utils.isNullOrUndefined(this.getConnectorStatus(connectorId)?.transactionId)
    ) {
      logger.error(
        `${this.logPrefix()} Trying to start MeterValues on connector Id ${connectorId} with no transaction id`
      );
      return;
    }
    if (interval > 0) {
      this.getConnectorStatus(connectorId).transactionSetInterval = setInterval(() => {
        // FIXME: Implement OCPP version agnostic helpers
        const meterValue: MeterValue = OCPP16ServiceUtils.buildMeterValue(
          this,
          connectorId,
          this.getConnectorStatus(connectorId).transactionId,
          interval
        );
        this.ocppRequestService
          .requestHandler<MeterValuesRequest, MeterValuesResponse>(
            this,
            RequestCommand.METER_VALUES,
            {
              connectorId,
              transactionId: this.getConnectorStatus(connectorId)?.transactionId,
              meterValue: [meterValue],
            }
          )
          .catch((error) => {
            logger.error(
              `${this.logPrefix()} Error while sending '${RequestCommand.METER_VALUES}':`,
              error
            );
          });
      }, interval);
    } else {
      logger.error(
        `${this.logPrefix()} Charging station ${
          StandardParametersKey.MeterValueSampleInterval
        } configuration set to ${
          interval ? Utils.formatDurationMilliSeconds(interval) : interval
        }, not sending MeterValues`
      );
    }
  }

  public start(): void {
    if (this.started === false) {
      if (this.starting === false) {
        this.starting = true;
        if (this.getEnableStatistics() === true) {
          this.performanceStatistics?.start();
        }
        this.openWSConnection();
        // Monitor charging station template file
        this.templateFileWatcher = FileUtils.watchJsonFile(
          this.templateFile,
          FileType.ChargingStationTemplate,
          this.logPrefix(),
          undefined,
          (event, filename): void => {
            if (Utils.isNotEmptyString(filename) && event === 'change') {
              try {
                logger.debug(
                  `${this.logPrefix()} ${FileType.ChargingStationTemplate} ${
                    this.templateFile
                  } file have changed, reload`
                );
                this.sharedLRUCache.deleteChargingStationTemplate(this.stationInfo?.templateHash);
                // Initialize
                this.initialize();
                // Restart the ATG
                this.stopAutomaticTransactionGenerator();
                if (
                  this.getAutomaticTransactionGeneratorConfigurationFromTemplate()?.enable === true
                ) {
                  this.startAutomaticTransactionGenerator();
                }
                if (this.getEnableStatistics() === true) {
                  this.performanceStatistics?.restart();
                } else {
                  this.performanceStatistics?.stop();
                }
                // FIXME?: restart heartbeat and WebSocket ping when their interval values have changed
              } catch (error) {
                logger.error(
                  `${this.logPrefix()} ${FileType.ChargingStationTemplate} file monitoring error:`,
                  error
                );
              }
            }
          }
        );
        this.started = true;
        parentPort?.postMessage(MessageChannelUtils.buildStartedMessage(this));
        this.starting = false;
      } else {
        logger.warn(`${this.logPrefix()} Charging station is already starting...`);
      }
    } else {
      logger.warn(`${this.logPrefix()} Charging station is already started...`);
    }
  }

  public async stop(reason?: StopTransactionReason): Promise<void> {
    if (this.started === true) {
      if (this.stopping === false) {
        this.stopping = true;
        await this.stopMessageSequence(reason);
        this.closeWSConnection();
        if (this.getEnableStatistics() === true) {
          this.performanceStatistics?.stop();
        }
        this.sharedLRUCache.deleteChargingStationConfiguration(this.configurationFileHash);
        this.templateFileWatcher?.close();
        this.sharedLRUCache.deleteChargingStationTemplate(this.stationInfo?.templateHash);
        this.bootNotificationResponse = undefined;
        this.started = false;
        parentPort?.postMessage(MessageChannelUtils.buildStoppedMessage(this));
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
    await Utils.sleep(this.stationInfo.resetTime);
    this.initialize();
    this.start();
  }

  public saveOcppConfiguration(): void {
    if (this.getOcppPersistentConfiguration()) {
      this.saveConfiguration();
    }
  }

  public resetConnectorStatus(connectorId: number): void {
    this.getConnectorStatus(connectorId).idTagLocalAuthorized = false;
    this.getConnectorStatus(connectorId).idTagAuthorized = false;
    this.getConnectorStatus(connectorId).transactionRemoteStarted = false;
    this.getConnectorStatus(connectorId).transactionStarted = false;
    delete this.getConnectorStatus(connectorId)?.localAuthorizeIdTag;
    delete this.getConnectorStatus(connectorId)?.authorizeIdTag;
    delete this.getConnectorStatus(connectorId)?.transactionId;
    delete this.getConnectorStatus(connectorId)?.transactionIdTag;
    this.getConnectorStatus(connectorId).transactionEnergyActiveImportRegisterValue = 0;
    delete this.getConnectorStatus(connectorId)?.transactionBeginMeterValue;
    this.stopMeterValues(connectorId);
    parentPort?.postMessage(MessageChannelUtils.buildUpdatedMessage(this));
  }

  public hasFeatureProfile(featureProfile: SupportedFeatureProfiles): boolean | undefined {
    return ChargingStationConfigurationUtils.getConfigurationKey(
      this,
      StandardParametersKey.SupportedFeatureProfiles
    )?.value?.includes(featureProfile);
  }

  public bufferMessage(message: string): void {
    this.messageBuffer.add(message);
  }

  public openWSConnection(
    options: WsOptions = this.stationInfo?.wsOptions ?? {},
    params: { closeOpened?: boolean; terminateOpened?: boolean } = {
      closeOpened: false,
      terminateOpened: false,
    }
  ): void {
    options.handshakeTimeout = options?.handshakeTimeout ?? this.getConnectionTimeout() * 1000;
    params.closeOpened = params?.closeOpened ?? false;
    params.terminateOpened = params?.terminateOpened ?? false;
    if (this.started === false && this.starting === false) {
      logger.warn(
        `${this.logPrefix()} Cannot open OCPP connection to URL ${this.wsConnectionUrl.toString()} on stopped charging station`
      );
      return;
    }
    if (
      !Utils.isNullOrUndefined(this.stationInfo.supervisionUser) &&
      !Utils.isNullOrUndefined(this.stationInfo.supervisionPassword)
    ) {
      options.auth = `${this.stationInfo.supervisionUser}:${this.stationInfo.supervisionPassword}`;
    }
    if (params?.closeOpened) {
      this.closeWSConnection();
    }
    if (params?.terminateOpened) {
      this.terminateWSConnection();
    }
    const ocppVersion = this.stationInfo.ocppVersion ?? OCPPVersion.VERSION_16;
    let protocol: string;
    switch (ocppVersion) {
      case OCPPVersion.VERSION_16:
      case OCPPVersion.VERSION_20:
      case OCPPVersion.VERSION_201:
        protocol = `ocpp${ocppVersion}`;
        break;
      default:
        this.handleUnsupportedVersion(ocppVersion);
        break;
    }

    if (this.isWebSocketConnectionOpened() === true) {
      logger.warn(
        `${this.logPrefix()} OCPP connection to URL ${this.wsConnectionUrl.toString()} is already opened`
      );
      return;
    }

    logger.info(
      `${this.logPrefix()} Open OCPP connection to URL ${this.wsConnectionUrl.toString()}`
    );

    this.wsConnection = new WebSocket(this.wsConnectionUrl, protocol, options);

    // Handle WebSocket message
    this.wsConnection.on(
      'message',
      this.onMessage.bind(this) as (this: WebSocket, data: RawData, isBinary: boolean) => void
    );
    // Handle WebSocket error
    this.wsConnection.on(
      'error',
      this.onError.bind(this) as (this: WebSocket, error: Error) => void
    );
    // Handle WebSocket close
    this.wsConnection.on(
      'close',
      this.onClose.bind(this) as (this: WebSocket, code: number, reason: Buffer) => void
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

  public startAutomaticTransactionGenerator(
    connectorIds?: number[],
    automaticTransactionGeneratorConfiguration?: AutomaticTransactionGeneratorConfiguration
  ): void {
    this.automaticTransactionGenerator = AutomaticTransactionGenerator.getInstance(
      automaticTransactionGeneratorConfiguration ??
        this.getAutomaticTransactionGeneratorConfigurationFromTemplate(),
      this
    );
    if (Utils.isNotEmptyArray(connectorIds)) {
      for (const connectorId of connectorIds) {
        this.automaticTransactionGenerator?.startConnector(connectorId);
      }
    } else {
      this.automaticTransactionGenerator?.start();
    }
    parentPort?.postMessage(MessageChannelUtils.buildUpdatedMessage(this));
  }

  public stopAutomaticTransactionGenerator(connectorIds?: number[]): void {
    if (Utils.isNotEmptyArray(connectorIds)) {
      for (const connectorId of connectorIds) {
        this.automaticTransactionGenerator?.stopConnector(connectorId);
      }
    } else {
      this.automaticTransactionGenerator?.stop();
    }
    parentPort?.postMessage(MessageChannelUtils.buildUpdatedMessage(this));
  }

  public async stopTransactionOnConnector(
    connectorId: number,
    reason = StopTransactionReason.NONE
  ): Promise<StopTransactionResponse> {
    const transactionId = this.getConnectorStatus(connectorId)?.transactionId;
    if (
      this.getBeginEndMeterValues() === true &&
      this.getOcppStrictCompliance() === true &&
      this.getOutOfOrderEndMeterValues() === false
    ) {
      // FIXME: Implement OCPP version agnostic helpers
      const transactionEndMeterValue = OCPP16ServiceUtils.buildTransactionEndMeterValue(
        this,
        connectorId,
        this.getEnergyActiveImportRegisterByTransactionId(transactionId)
      );
      await this.ocppRequestService.requestHandler<MeterValuesRequest, MeterValuesResponse>(
        this,
        RequestCommand.METER_VALUES,
        {
          connectorId,
          transactionId,
          meterValue: [transactionEndMeterValue],
        }
      );
    }
    return this.ocppRequestService.requestHandler<StopTransactionRequest, StopTransactionResponse>(
      this,
      RequestCommand.STOP_TRANSACTION,
      {
        transactionId,
        meterStop: this.getEnergyActiveImportRegisterByTransactionId(transactionId, true),
        reason,
      }
    );
  }

  private flushMessageBuffer(): void {
    if (this.messageBuffer.size > 0) {
      this.messageBuffer.forEach((message) => {
        let beginId: string;
        let commandName: RequestCommand;
        const [messageType] = JSON.parse(message) as OutgoingRequest | Response | ErrorResponse;
        const isRequest = messageType === MessageType.CALL_MESSAGE;
        if (isRequest) {
          [, , commandName] = JSON.parse(message) as OutgoingRequest;
          beginId = PerformanceStatistics.beginMeasure(commandName);
        }
        this.wsConnection?.send(message);
        isRequest && PerformanceStatistics.endMeasure(commandName, beginId);
        logger.debug(
          `${this.logPrefix()} >> Buffered ${OCPPServiceUtils.getMessageTypeString(
            messageType
          )} payload sent: ${message}`
        );
        this.messageBuffer.delete(message);
      });
    }
  }

  private getSupervisionUrlOcppConfiguration(): boolean {
    return this.stationInfo.supervisionUrlOcppConfiguration ?? false;
  }

  private getSupervisionUrlOcppKey(): string {
    return this.stationInfo.supervisionUrlOcppKey ?? VendorParametersKey.ConnectionUrl;
  }

  private getTemplateFromFile(): ChargingStationTemplate | undefined {
    let template: ChargingStationTemplate;
    try {
      if (this.sharedLRUCache.hasChargingStationTemplate(this.stationInfo?.templateHash)) {
        template = this.sharedLRUCache.getChargingStationTemplate(this.stationInfo.templateHash);
      } else {
        const measureId = `${FileType.ChargingStationTemplate} read`;
        const beginId = PerformanceStatistics.beginMeasure(measureId);
        template = JSON.parse(
          fs.readFileSync(this.templateFile, 'utf8')
        ) as ChargingStationTemplate;
        PerformanceStatistics.endMeasure(measureId, beginId);
        template.templateHash = crypto
          .createHash(Constants.DEFAULT_HASH_ALGORITHM)
          .update(JSON.stringify(template))
          .digest('hex');
        this.sharedLRUCache.setChargingStationTemplate(template);
      }
    } catch (error) {
      FileUtils.handleFileException(
        this.templateFile,
        FileType.ChargingStationTemplate,
        error as NodeJS.ErrnoException,
        this.logPrefix()
      );
    }
    return template;
  }

  private getStationInfoFromTemplate(): ChargingStationInfo {
    const stationTemplate: ChargingStationTemplate | undefined = this.getTemplateFromFile();
    if (Utils.isNullOrUndefined(stationTemplate)) {
      const errorMsg = `Failed to read charging station template file ${this.templateFile}`;
      logger.error(`${this.logPrefix()} ${errorMsg}`);
      throw new BaseError(errorMsg);
    }
    if (Utils.isEmptyObject(stationTemplate)) {
      const errorMsg = `Empty charging station information from template file ${this.templateFile}`;
      logger.error(`${this.logPrefix()} ${errorMsg}`);
      throw new BaseError(errorMsg);
    }
    // Deprecation template keys section
    ChargingStationUtils.warnDeprecatedTemplateKey(
      stationTemplate,
      'supervisionUrl',
      this.templateFile,
      this.logPrefix(),
      "Use 'supervisionUrls' instead"
    );
    ChargingStationUtils.convertDeprecatedTemplateKey(
      stationTemplate,
      'supervisionUrl',
      'supervisionUrls'
    );
    const stationInfo: ChargingStationInfo =
      ChargingStationUtils.stationTemplateToStationInfo(stationTemplate);
    stationInfo.hashId = ChargingStationUtils.getHashId(this.index, stationTemplate);
    stationInfo.chargingStationId = ChargingStationUtils.getChargingStationId(
      this.index,
      stationTemplate
    );
    stationInfo.ocppVersion = stationTemplate?.ocppVersion ?? OCPPVersion.VERSION_16;
    ChargingStationUtils.createSerialNumber(stationTemplate, stationInfo);
    if (Utils.isNotEmptyArray(stationTemplate?.power)) {
      stationTemplate.power = stationTemplate.power as number[];
      const powerArrayRandomIndex = Math.floor(Utils.secureRandom() * stationTemplate.power.length);
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
    stationInfo.firmwareVersionPattern =
      stationTemplate?.firmwareVersionPattern ?? Constants.SEMVER_PATTERN;
    if (
      Utils.isNotEmptyString(stationInfo.firmwareVersion) &&
      new RegExp(stationInfo.firmwareVersionPattern).test(stationInfo.firmwareVersion) === false
    ) {
      logger.warn(
        `${this.logPrefix()} Firmware version '${stationInfo.firmwareVersion}' in template file ${
          this.templateFile
        } does not match firmware version pattern '${stationInfo.firmwareVersionPattern}'`
      );
    }
    stationInfo.firmwareUpgrade = merge<FirmwareUpgrade>(
      {
        versionUpgrade: {
          step: 1,
        },
        reset: true,
      },
      stationTemplate?.firmwareUpgrade ?? {}
    );
    stationInfo.resetTime = !Utils.isNullOrUndefined(stationTemplate?.resetTime)
      ? stationTemplate.resetTime * 1000
      : Constants.CHARGING_STATION_DEFAULT_RESET_TIME;
    const configuredMaxConnectors =
      ChargingStationUtils.getConfiguredNumberOfConnectors(stationTemplate);
    ChargingStationUtils.checkConfiguredMaxConnectors(
      configuredMaxConnectors,
      this.templateFile,
      this.logPrefix()
    );
    const templateMaxConnectors =
      ChargingStationUtils.getTemplateMaxNumberOfConnectors(stationTemplate);
    ChargingStationUtils.checkTemplateMaxConnectors(
      templateMaxConnectors,
      this.templateFile,
      this.logPrefix()
    );
    if (
      configuredMaxConnectors >
        (stationTemplate?.Connectors[0] ? templateMaxConnectors - 1 : templateMaxConnectors) &&
      !stationTemplate?.randomConnectors
    ) {
      logger.warn(
        `${this.logPrefix()} Number of connectors exceeds the number of connector configurations in template ${
          this.templateFile
        }, forcing random connector configurations affectation`
      );
      stationInfo.randomConnectors = true;
    }
    // Build connectors if needed (FIXME: should be factored out)
    this.initializeConnectors(stationInfo, configuredMaxConnectors, templateMaxConnectors);
    stationInfo.maximumAmperage = this.getMaximumAmperage(stationInfo);
    ChargingStationUtils.createStationInfoHash(stationInfo);
    return stationInfo;
  }

  private getStationInfoFromFile(): ChargingStationInfo | undefined {
    let stationInfo: ChargingStationInfo | undefined;
    this.getStationInfoPersistentConfiguration() &&
      (stationInfo = this.getConfigurationFromFile()?.stationInfo);
    stationInfo && ChargingStationUtils.createStationInfoHash(stationInfo);
    return stationInfo;
  }

  private getStationInfo(): ChargingStationInfo {
    const stationInfoFromTemplate: ChargingStationInfo = this.getStationInfoFromTemplate();
    const stationInfoFromFile: ChargingStationInfo | undefined = this.getStationInfoFromFile();
    // Priority: charging station info from template > charging station info from configuration file > charging station info attribute
    if (stationInfoFromFile?.templateHash === stationInfoFromTemplate.templateHash) {
      if (this.stationInfo?.infoHash === stationInfoFromFile?.infoHash) {
        return this.stationInfo;
      }
      return stationInfoFromFile;
    }
    stationInfoFromFile &&
      ChargingStationUtils.propagateSerialNumber(
        this.getTemplateFromFile(),
        stationInfoFromFile,
        stationInfoFromTemplate
      );
    return stationInfoFromTemplate;
  }

  private saveStationInfo(): void {
    if (this.getStationInfoPersistentConfiguration()) {
      this.saveConfiguration();
    }
  }

  private getOcppPersistentConfiguration(): boolean {
    return this.stationInfo?.ocppPersistentConfiguration ?? true;
  }

  private getStationInfoPersistentConfiguration(): boolean {
    return this.stationInfo?.stationInfoPersistentConfiguration ?? true;
  }

  private handleUnsupportedVersion(version: OCPPVersion) {
    const errMsg = `Unsupported protocol version '${version}' configured in template file ${this.templateFile}`;
    logger.error(`${this.logPrefix()} ${errMsg}`);
    throw new BaseError(errMsg);
  }

  private initialize(): void {
    this.configurationFile = path.join(
      path.dirname(this.templateFile.replace('station-templates', 'configurations')),
      `${ChargingStationUtils.getHashId(this.index, this.getTemplateFromFile())}.json`
    );
    this.stationInfo = this.getStationInfo();
    this.saveStationInfo();
    // Avoid duplication of connectors related information in RAM
    this.stationInfo?.Connectors && delete this.stationInfo.Connectors;
    this.configuredSupervisionUrl = this.getConfiguredSupervisionUrl();
    if (this.getEnableStatistics() === true) {
      this.performanceStatistics = PerformanceStatistics.getInstance(
        this.stationInfo.hashId,
        this.stationInfo.chargingStationId,
        this.configuredSupervisionUrl
      );
    }
    this.bootNotificationRequest = ChargingStationUtils.createBootNotificationRequest(
      this.stationInfo
    );
    this.powerDivider = this.getPowerDivider();
    // OCPP configuration
    this.ocppConfiguration = this.getOcppConfiguration();
    this.initializeOcppConfiguration();
    const ocppVersion = this.stationInfo.ocppVersion ?? OCPPVersion.VERSION_16;
    switch (ocppVersion) {
      case OCPPVersion.VERSION_16:
        this.ocppIncomingRequestService =
          OCPP16IncomingRequestService.getInstance<OCPP16IncomingRequestService>();
        this.ocppRequestService = OCPP16RequestService.getInstance<OCPP16RequestService>(
          OCPP16ResponseService.getInstance<OCPP16ResponseService>()
        );
        break;
      case OCPPVersion.VERSION_20:
      case OCPPVersion.VERSION_201:
        this.ocppIncomingRequestService =
          OCPP20IncomingRequestService.getInstance<OCPP20IncomingRequestService>();
        this.ocppRequestService = OCPP20RequestService.getInstance<OCPP20RequestService>(
          OCPP20ResponseService.getInstance<OCPP20ResponseService>()
        );
        break;
      default:
        this.handleUnsupportedVersion(ocppVersion);
        break;
    }
    if (this.stationInfo?.autoRegister === true) {
      this.bootNotificationResponse = {
        currentTime: new Date(),
        interval: this.getHeartbeatInterval() / 1000,
        status: RegistrationStatusEnumType.ACCEPTED,
      };
    }
    if (
      this.stationInfo.firmwareStatus === FirmwareStatus.Installing &&
      Utils.isNotEmptyString(this.stationInfo.firmwareVersion) &&
      Utils.isNotEmptyString(this.stationInfo.firmwareVersionPattern)
    ) {
      const patternGroup: number | undefined =
        this.stationInfo.firmwareUpgrade?.versionUpgrade?.patternGroup ??
        this.stationInfo.firmwareVersion?.split('.').length;
      const match = this.stationInfo?.firmwareVersion
        ?.match(new RegExp(this.stationInfo.firmwareVersionPattern))
        ?.slice(1, patternGroup + 1);
      const patchLevelIndex = match.length - 1;
      match[patchLevelIndex] = (
        Utils.convertToInt(match[patchLevelIndex]) +
        this.stationInfo.firmwareUpgrade?.versionUpgrade?.step
      ).toString();
      this.stationInfo.firmwareVersion = match?.join('.');
    }
  }

  private initializeOcppConfiguration(): void {
    if (
      !ChargingStationConfigurationUtils.getConfigurationKey(
        this,
        StandardParametersKey.HeartbeatInterval
      )
    ) {
      ChargingStationConfigurationUtils.addConfigurationKey(
        this,
        StandardParametersKey.HeartbeatInterval,
        '0'
      );
    }
    if (
      !ChargingStationConfigurationUtils.getConfigurationKey(
        this,
        StandardParametersKey.HeartBeatInterval
      )
    ) {
      ChargingStationConfigurationUtils.addConfigurationKey(
        this,
        StandardParametersKey.HeartBeatInterval,
        '0',
        { visible: false }
      );
    }
    if (
      this.getSupervisionUrlOcppConfiguration() &&
      !ChargingStationConfigurationUtils.getConfigurationKey(this, this.getSupervisionUrlOcppKey())
    ) {
      ChargingStationConfigurationUtils.addConfigurationKey(
        this,
        this.getSupervisionUrlOcppKey(),
        this.configuredSupervisionUrl.href,
        { reboot: true }
      );
    } else if (
      !this.getSupervisionUrlOcppConfiguration() &&
      ChargingStationConfigurationUtils.getConfigurationKey(this, this.getSupervisionUrlOcppKey())
    ) {
      ChargingStationConfigurationUtils.deleteConfigurationKey(
        this,
        this.getSupervisionUrlOcppKey(),
        { save: false }
      );
    }
    if (
      Utils.isNotEmptyString(this.stationInfo?.amperageLimitationOcppKey) &&
      !ChargingStationConfigurationUtils.getConfigurationKey(
        this,
        this.stationInfo.amperageLimitationOcppKey
      )
    ) {
      ChargingStationConfigurationUtils.addConfigurationKey(
        this,
        this.stationInfo.amperageLimitationOcppKey,
        (
          this.stationInfo.maximumAmperage *
          ChargingStationUtils.getAmperageLimitationUnitDivider(this.stationInfo)
        ).toString()
      );
    }
    if (
      !ChargingStationConfigurationUtils.getConfigurationKey(
        this,
        StandardParametersKey.SupportedFeatureProfiles
      )
    ) {
      ChargingStationConfigurationUtils.addConfigurationKey(
        this,
        StandardParametersKey.SupportedFeatureProfiles,
        `${SupportedFeatureProfiles.Core},${SupportedFeatureProfiles.FirmwareManagement},${SupportedFeatureProfiles.LocalAuthListManagement},${SupportedFeatureProfiles.SmartCharging},${SupportedFeatureProfiles.RemoteTrigger}`
      );
    }
    ChargingStationConfigurationUtils.addConfigurationKey(
      this,
      StandardParametersKey.NumberOfConnectors,
      this.getNumberOfConnectors().toString(),
      { readonly: true },
      { overwrite: true }
    );
    if (
      !ChargingStationConfigurationUtils.getConfigurationKey(
        this,
        StandardParametersKey.MeterValuesSampledData
      )
    ) {
      ChargingStationConfigurationUtils.addConfigurationKey(
        this,
        StandardParametersKey.MeterValuesSampledData,
        MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      );
    }
    if (
      !ChargingStationConfigurationUtils.getConfigurationKey(
        this,
        StandardParametersKey.ConnectorPhaseRotation
      )
    ) {
      const connectorPhaseRotation = [];
      for (const connectorId of this.connectors.keys()) {
        // AC/DC
        if (connectorId === 0 && this.getNumberOfPhases() === 0) {
          connectorPhaseRotation.push(`${connectorId}.${ConnectorPhaseRotation.RST}`);
        } else if (connectorId > 0 && this.getNumberOfPhases() === 0) {
          connectorPhaseRotation.push(`${connectorId}.${ConnectorPhaseRotation.NotApplicable}`);
          // AC
        } else if (connectorId > 0 && this.getNumberOfPhases() === 1) {
          connectorPhaseRotation.push(`${connectorId}.${ConnectorPhaseRotation.NotApplicable}`);
        } else if (connectorId > 0 && this.getNumberOfPhases() === 3) {
          connectorPhaseRotation.push(`${connectorId}.${ConnectorPhaseRotation.RST}`);
        }
      }
      ChargingStationConfigurationUtils.addConfigurationKey(
        this,
        StandardParametersKey.ConnectorPhaseRotation,
        connectorPhaseRotation.toString()
      );
    }
    if (
      !ChargingStationConfigurationUtils.getConfigurationKey(
        this,
        StandardParametersKey.AuthorizeRemoteTxRequests
      )
    ) {
      ChargingStationConfigurationUtils.addConfigurationKey(
        this,
        StandardParametersKey.AuthorizeRemoteTxRequests,
        'true'
      );
    }
    if (
      !ChargingStationConfigurationUtils.getConfigurationKey(
        this,
        StandardParametersKey.LocalAuthListEnabled
      ) &&
      ChargingStationConfigurationUtils.getConfigurationKey(
        this,
        StandardParametersKey.SupportedFeatureProfiles
      )?.value?.includes(SupportedFeatureProfiles.LocalAuthListManagement)
    ) {
      ChargingStationConfigurationUtils.addConfigurationKey(
        this,
        StandardParametersKey.LocalAuthListEnabled,
        'false'
      );
    }
    if (
      !ChargingStationConfigurationUtils.getConfigurationKey(
        this,
        StandardParametersKey.ConnectionTimeOut
      )
    ) {
      ChargingStationConfigurationUtils.addConfigurationKey(
        this,
        StandardParametersKey.ConnectionTimeOut,
        Constants.DEFAULT_CONNECTION_TIMEOUT.toString()
      );
    }
    this.saveOcppConfiguration();
  }

  private initializeConnectors(
    stationInfo: ChargingStationInfo,
    configuredMaxConnectors: number,
    templateMaxConnectors: number
  ): void {
    if (!stationInfo?.Connectors && this.connectors.size === 0) {
      const logMsg = `No already defined connectors and charging station information from template ${this.templateFile} with no connectors configuration defined`;
      logger.error(`${this.logPrefix()} ${logMsg}`);
      throw new BaseError(logMsg);
    }
    if (!stationInfo?.Connectors[0]) {
      logger.warn(
        `${this.logPrefix()} Charging station information from template ${
          this.templateFile
        } with no connector Id 0 configuration`
      );
    }
    if (stationInfo?.Connectors) {
      const connectorsConfigHash = crypto
        .createHash(Constants.DEFAULT_HASH_ALGORITHM)
        .update(`${JSON.stringify(stationInfo?.Connectors)}${configuredMaxConnectors.toString()}`)
        .digest('hex');
      const connectorsConfigChanged =
        this.connectors?.size !== 0 && this.connectorsConfigurationHash !== connectorsConfigHash;
      if (this.connectors?.size === 0 || connectorsConfigChanged) {
        connectorsConfigChanged && this.connectors.clear();
        this.connectorsConfigurationHash = connectorsConfigHash;
        // Add connector Id 0
        let lastConnector = '0';
        for (lastConnector in stationInfo?.Connectors) {
          const connectorStatus = stationInfo?.Connectors[lastConnector];
          const lastConnectorId = Utils.convertToInt(lastConnector);
          if (
            lastConnectorId === 0 &&
            this.getUseConnectorId0(stationInfo) === true &&
            connectorStatus
          ) {
            this.checkStationInfoConnectorStatus(lastConnectorId, connectorStatus);
            this.connectors.set(
              lastConnectorId,
              Utils.cloneObject<ConnectorStatus>(connectorStatus)
            );
            this.getConnectorStatus(lastConnectorId).availability = AvailabilityType.OPERATIVE;
            if (Utils.isUndefined(this.getConnectorStatus(lastConnectorId)?.chargingProfiles)) {
              this.getConnectorStatus(lastConnectorId).chargingProfiles = [];
            }
          }
        }
        // Generate all connectors
        if ((stationInfo?.Connectors[0] ? templateMaxConnectors - 1 : templateMaxConnectors) > 0) {
          for (let index = 1; index <= configuredMaxConnectors; index++) {
            const randConnectorId = stationInfo?.randomConnectors
              ? Utils.getRandomInteger(Utils.convertToInt(lastConnector), 1)
              : index;
            const connectorStatus = stationInfo?.Connectors[randConnectorId.toString()];
            this.checkStationInfoConnectorStatus(randConnectorId, connectorStatus);
            this.connectors.set(index, Utils.cloneObject<ConnectorStatus>(connectorStatus));
            this.getConnectorStatus(index).availability = AvailabilityType.OPERATIVE;
            if (Utils.isUndefined(this.getConnectorStatus(index)?.chargingProfiles)) {
              this.getConnectorStatus(index).chargingProfiles = [];
            }
          }
        }
      }
    } else {
      logger.warn(
        `${this.logPrefix()} Charging station information from template ${
          this.templateFile
        } with no connectors configuration defined, using already defined connectors`
      );
    }
    // Initialize transaction attributes on connectors
    for (const connectorId of this.connectors.keys()) {
      if (connectorId > 0 && this.getConnectorStatus(connectorId)?.transactionStarted === true) {
        logger.warn(
          `${this.logPrefix()} Connector ${connectorId} at initialization has a transaction started: ${
            this.getConnectorStatus(connectorId)?.transactionId
          }`
        );
      }
      if (
        connectorId > 0 &&
        (this.getConnectorStatus(connectorId)?.transactionStarted === undefined ||
          this.getConnectorStatus(connectorId)?.transactionStarted === null)
      ) {
        this.initializeConnectorStatus(connectorId);
      }
    }
  }

  private checkStationInfoConnectorStatus(
    connectorId: number,
    connectorStatus: ConnectorStatus
  ): void {
    if (!Utils.isNullOrUndefined(connectorStatus?.status)) {
      logger.warn(
        `${this.logPrefix()} Charging station information from template ${
          this.templateFile
        } with connector ${connectorId} status configuration defined, undefine it`
      );
      connectorStatus.status = undefined;
    }
  }

  private getConfigurationFromFile(): ChargingStationConfiguration | undefined {
    let configuration: ChargingStationConfiguration | undefined;
    if (this.configurationFile && fs.existsSync(this.configurationFile)) {
      try {
        if (this.sharedLRUCache.hasChargingStationConfiguration(this.configurationFileHash)) {
          configuration = this.sharedLRUCache.getChargingStationConfiguration(
            this.configurationFileHash
          );
        } else {
          const measureId = `${FileType.ChargingStationConfiguration} read`;
          const beginId = PerformanceStatistics.beginMeasure(measureId);
          configuration = JSON.parse(
            fs.readFileSync(this.configurationFile, 'utf8')
          ) as ChargingStationConfiguration;
          PerformanceStatistics.endMeasure(measureId, beginId);
          this.configurationFileHash = configuration.configurationHash;
          this.sharedLRUCache.setChargingStationConfiguration(configuration);
        }
      } catch (error) {
        FileUtils.handleFileException(
          this.configurationFile,
          FileType.ChargingStationConfiguration,
          error as NodeJS.ErrnoException,
          this.logPrefix()
        );
      }
    }
    return configuration;
  }

  private saveConfiguration(): void {
    if (this.configurationFile) {
      try {
        if (!fs.existsSync(path.dirname(this.configurationFile))) {
          fs.mkdirSync(path.dirname(this.configurationFile), { recursive: true });
        }
        const configurationData: ChargingStationConfiguration =
          Utils.cloneObject(this.getConfigurationFromFile()) ?? {};
        this.ocppConfiguration?.configurationKey &&
          (configurationData.configurationKey = this.ocppConfiguration.configurationKey);
        this.stationInfo && (configurationData.stationInfo = this.stationInfo);
        delete configurationData.configurationHash;
        const configurationHash = crypto
          .createHash(Constants.DEFAULT_HASH_ALGORITHM)
          .update(JSON.stringify(configurationData))
          .digest('hex');
        if (this.configurationFileHash !== configurationHash) {
          configurationData.configurationHash = configurationHash;
          const measureId = `${FileType.ChargingStationConfiguration} write`;
          const beginId = PerformanceStatistics.beginMeasure(measureId);
          const fileDescriptor = fs.openSync(this.configurationFile, 'w');
          fs.writeFileSync(fileDescriptor, JSON.stringify(configurationData, null, 2), 'utf8');
          fs.closeSync(fileDescriptor);
          PerformanceStatistics.endMeasure(measureId, beginId);
          this.sharedLRUCache.deleteChargingStationConfiguration(this.configurationFileHash);
          this.configurationFileHash = configurationHash;
          this.sharedLRUCache.setChargingStationConfiguration(configurationData);
        } else {
          logger.debug(
            `${this.logPrefix()} Not saving unchanged charging station configuration file ${
              this.configurationFile
            }`
          );
        }
      } catch (error) {
        FileUtils.handleFileException(
          this.configurationFile,
          FileType.ChargingStationConfiguration,
          error as NodeJS.ErrnoException,
          this.logPrefix()
        );
      }
    } else {
      logger.error(
        `${this.logPrefix()} Trying to save charging station configuration to undefined configuration file`
      );
    }
  }

  private getOcppConfigurationFromTemplate(): ChargingStationOcppConfiguration | undefined {
    return this.getTemplateFromFile()?.Configuration;
  }

  private getOcppConfigurationFromFile(): ChargingStationOcppConfiguration | undefined {
    let configuration: ChargingStationConfiguration | undefined;
    if (this.getOcppPersistentConfiguration() === true) {
      const configurationFromFile = this.getConfigurationFromFile();
      configuration = configurationFromFile?.configurationKey && configurationFromFile;
    }
    if (!Utils.isNullOrUndefined(configuration)) {
      delete configuration.stationInfo;
      delete configuration.configurationHash;
    }
    return configuration;
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
        `${this.logPrefix()} Connection to OCPP server through ${this.wsConnectionUrl.toString()} succeeded`
      );
      if (this.isRegistered() === false) {
        // Send BootNotification
        let registrationRetryCount = 0;
        do {
          this.bootNotificationResponse = await this.ocppRequestService.requestHandler<
            BootNotificationRequest,
            BootNotificationResponse
          >(this, RequestCommand.BOOT_NOTIFICATION, this.bootNotificationRequest, {
            skipBufferingOnError: true,
          });
          if (this.isRegistered() === false) {
            this.getRegistrationMaxRetries() !== -1 && registrationRetryCount++;
            await Utils.sleep(
              this?.bootNotificationResponse?.interval
                ? this.bootNotificationResponse.interval * 1000
                : Constants.OCPP_DEFAULT_BOOT_NOTIFICATION_INTERVAL
            );
          }
        } while (
          this.isRegistered() === false &&
          (registrationRetryCount <= this.getRegistrationMaxRetries() ||
            this.getRegistrationMaxRetries() === -1)
        );
      }
      if (this.isRegistered() === true) {
        if (this.isInAcceptedState() === true) {
          await this.startMessageSequence();
        }
      } else {
        logger.error(
          `${this.logPrefix()} Registration failure: max retries reached (${this.getRegistrationMaxRetries()}) or retry disabled (${this.getRegistrationMaxRetries()})`
        );
      }
      this.wsConnectionRestarted = false;
      this.autoReconnectRetryCount = 0;
      parentPort?.postMessage(MessageChannelUtils.buildUpdatedMessage(this));
    } else {
      logger.warn(
        `${this.logPrefix()} Connection to OCPP server through ${this.wsConnectionUrl.toString()} failed`
      );
    }
  }

  private async onClose(code: number, reason: Buffer): Promise<void> {
    switch (code) {
      // Normal close
      case WebSocketCloseEventStatusCode.CLOSE_NORMAL:
      case WebSocketCloseEventStatusCode.CLOSE_NO_STATUS:
        logger.info(
          `${this.logPrefix()} WebSocket normally closed with status '${Utils.getWebSocketCloseEventStatusString(
            code
          )}' and reason '${reason.toString()}'`
        );
        this.autoReconnectRetryCount = 0;
        break;
      // Abnormal close
      default:
        logger.error(
          `${this.logPrefix()} WebSocket abnormally closed with status '${Utils.getWebSocketCloseEventStatusString(
            code
          )}' and reason '${reason.toString()}'`
        );
        this.started === true && (await this.reconnect());
        break;
    }
    parentPort?.postMessage(MessageChannelUtils.buildUpdatedMessage(this));
  }

  private async onMessage(data: RawData): Promise<void> {
    let messageType: number;
    let messageId: string;
    let commandName: IncomingRequestCommand;
    let commandPayload: JsonType;
    let errorType: ErrorType;
    let errorMessage: string;
    let errorDetails: JsonType;
    let responseCallback: ResponseCallback;
    let errorCallback: ErrorCallback;
    let requestCommandName: RequestCommand | IncomingRequestCommand;
    let requestPayload: JsonType;
    let cachedRequest: CachedRequest;
    let errMsg: string;
    try {
      const request = JSON.parse(data.toString()) as IncomingRequest | Response | ErrorResponse;
      if (Array.isArray(request) === true) {
        [messageType, messageId] = request;
        // Check the type of message
        switch (messageType) {
          // Incoming Message
          case MessageType.CALL_MESSAGE:
            [, , commandName, commandPayload] = request as IncomingRequest;
            if (this.getEnableStatistics() === true) {
              this.performanceStatistics?.addRequestStatistic(commandName, messageType);
            }
            logger.debug(
              `${this.logPrefix()} << Command '${commandName}' received request payload: ${JSON.stringify(
                request
              )}`
            );
            // Process the message
            await this.ocppIncomingRequestService.incomingRequestHandler(
              this,
              messageId,
              commandName,
              commandPayload
            );
            break;
          // Outcome Message
          case MessageType.CALL_RESULT_MESSAGE:
            [, , commandPayload] = request as Response;
            if (this.requests.has(messageId) === false) {
              // Error
              throw new OCPPError(
                ErrorType.INTERNAL_ERROR,
                `Response for unknown message id ${messageId}`,
                undefined,
                commandPayload
              );
            }
            // Respond
            cachedRequest = this.requests.get(messageId);
            if (Array.isArray(cachedRequest) === true) {
              [responseCallback, errorCallback, requestCommandName, requestPayload] = cachedRequest;
            } else {
              throw new OCPPError(
                ErrorType.PROTOCOL_ERROR,
                `Cached request for message id ${messageId} response is not an array`,
                undefined,
                cachedRequest as unknown as JsonType
              );
            }
            logger.debug(
              `${this.logPrefix()} << Command '${
                requestCommandName ?? Constants.UNKNOWN_COMMAND
              }' received response payload: ${JSON.stringify(request)}`
            );
            responseCallback(commandPayload, requestPayload);
            break;
          // Error Message
          case MessageType.CALL_ERROR_MESSAGE:
            [, , errorType, errorMessage, errorDetails] = request as ErrorResponse;
            if (this.requests.has(messageId) === false) {
              // Error
              throw new OCPPError(
                ErrorType.INTERNAL_ERROR,
                `Error response for unknown message id ${messageId}`,
                undefined,
                { errorType, errorMessage, errorDetails }
              );
            }
            cachedRequest = this.requests.get(messageId);
            if (Array.isArray(cachedRequest) === true) {
              [, errorCallback, requestCommandName] = cachedRequest;
            } else {
              throw new OCPPError(
                ErrorType.PROTOCOL_ERROR,
                `Cached request for message id ${messageId} error response is not an array`,
                undefined,
                cachedRequest as unknown as JsonType
              );
            }
            logger.debug(
              `${this.logPrefix()} << Command '${
                requestCommandName ?? Constants.UNKNOWN_COMMAND
              }' received error response payload: ${JSON.stringify(request)}`
            );
            errorCallback(new OCPPError(errorType, errorMessage, requestCommandName, errorDetails));
            break;
          // Error
          default:
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            errMsg = `Wrong message type ${messageType}`;
            logger.error(`${this.logPrefix()} ${errMsg}`);
            throw new OCPPError(ErrorType.PROTOCOL_ERROR, errMsg);
        }
        parentPort?.postMessage(MessageChannelUtils.buildUpdatedMessage(this));
      } else {
        throw new OCPPError(ErrorType.PROTOCOL_ERROR, 'Incoming message is not an array', null, {
          request,
        });
      }
    } catch (error) {
      // Log
      logger.error(
        `${this.logPrefix()} Incoming OCPP command '${
          commandName ?? requestCommandName ?? Constants.UNKNOWN_COMMAND
        }' message '${data.toString()}'${
          messageType !== MessageType.CALL_MESSAGE
            ? ` matching cached request '${JSON.stringify(this.requests.get(messageId))}'`
            : ''
        } processing error:`,
        error
      );
      if (error instanceof OCPPError === false) {
        logger.warn(
          `${this.logPrefix()} Error thrown at incoming OCPP command '${
            commandName ?? requestCommandName ?? Constants.UNKNOWN_COMMAND
          }' message '${data.toString()}' handling is not an OCPPError:`,
          error
        );
      }
      switch (messageType) {
        case MessageType.CALL_MESSAGE:
          // Send error
          await this.ocppRequestService.sendError(
            this,
            messageId,
            error as OCPPError,
            commandName ?? requestCommandName ?? null
          );
          break;
        case MessageType.CALL_RESULT_MESSAGE:
        case MessageType.CALL_ERROR_MESSAGE:
          if (errorCallback) {
            // Reject the deferred promise in case of error at response handling (rejecting an already fulfilled promise is a no-op)
            errorCallback(error as OCPPError, false);
          } else {
            // Remove the request from the cache in case of error at response handling
            this.requests.delete(messageId);
          }
          break;
      }
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
    if (this.getMeteringPerTransaction() === true) {
      return (
        (rounded === true
          ? Math.round(connectorStatus?.transactionEnergyActiveImportRegisterValue)
          : connectorStatus?.transactionEnergyActiveImportRegisterValue) ?? 0
      );
    }
    return (
      (rounded === true
        ? Math.round(connectorStatus?.energyActiveImportRegisterValue)
        : connectorStatus?.energyActiveImportRegisterValue) ?? 0
    );
  }

  private getUseConnectorId0(stationInfo?: ChargingStationInfo): boolean {
    const localStationInfo = stationInfo ?? this.stationInfo;
    return localStationInfo?.useConnectorId0 ?? true;
  }

  private getNumberOfRunningTransactions(): number {
    let trxCount = 0;
    for (const connectorId of this.connectors.keys()) {
      if (connectorId > 0 && this.getConnectorStatus(connectorId)?.transactionStarted === true) {
        trxCount++;
      }
    }
    return trxCount;
  }

  private async stopRunningTransactions(reason = StopTransactionReason.NONE): Promise<void> {
    for (const connectorId of this.connectors.keys()) {
      if (connectorId > 0 && this.getConnectorStatus(connectorId)?.transactionStarted === true) {
        await this.stopTransactionOnConnector(connectorId, reason);
      }
    }
  }

  // 0 for disabling
  private getConnectionTimeout(): number {
    if (
      ChargingStationConfigurationUtils.getConfigurationKey(
        this,
        StandardParametersKey.ConnectionTimeOut
      )
    ) {
      return (
        parseInt(
          ChargingStationConfigurationUtils.getConfigurationKey(
            this,
            StandardParametersKey.ConnectionTimeOut
          ).value
        ) ?? Constants.DEFAULT_CONNECTION_TIMEOUT
      );
    }
    return Constants.DEFAULT_CONNECTION_TIMEOUT;
  }

  // -1 for unlimited, 0 for disabling
  private getAutoReconnectMaxRetries(): number | undefined {
    if (!Utils.isUndefined(this.stationInfo.autoReconnectMaxRetries)) {
      return this.stationInfo.autoReconnectMaxRetries;
    }
    if (!Utils.isUndefined(Configuration.getAutoReconnectMaxRetries())) {
      return Configuration.getAutoReconnectMaxRetries();
    }
    return -1;
  }

  // 0 for disabling
  private getRegistrationMaxRetries(): number | undefined {
    if (!Utils.isUndefined(this.stationInfo.registrationMaxRetries)) {
      return this.stationInfo.registrationMaxRetries;
    }
    return -1;
  }

  private getPowerDivider(): number {
    let powerDivider = this.getNumberOfConnectors();
    if (this.stationInfo?.powerSharedByConnectors) {
      powerDivider = this.getNumberOfRunningTransactions();
    }
    return powerDivider;
  }

  private getMaximumAmperage(stationInfo: ChargingStationInfo): number | undefined {
    const maximumPower = this.getMaximumPower(stationInfo);
    switch (this.getCurrentOutType(stationInfo)) {
      case CurrentType.AC:
        return ACElectricUtils.amperagePerPhaseFromPower(
          this.getNumberOfPhases(stationInfo),
          maximumPower / this.getNumberOfConnectors(),
          this.getVoltageOut(stationInfo)
        );
      case CurrentType.DC:
        return DCElectricUtils.amperage(maximumPower, this.getVoltageOut(stationInfo));
    }
  }

  private getAmperageLimitation(): number | undefined {
    if (
      Utils.isNotEmptyString(this.stationInfo?.amperageLimitationOcppKey) &&
      ChargingStationConfigurationUtils.getConfigurationKey(
        this,
        this.stationInfo.amperageLimitationOcppKey
      )
    ) {
      return (
        Utils.convertToInt(
          ChargingStationConfigurationUtils.getConfigurationKey(
            this,
            this.stationInfo.amperageLimitationOcppKey
          )?.value
        ) / ChargingStationUtils.getAmperageLimitationUnitDivider(this.stationInfo)
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
    for (const connectorId of this.connectors.keys()) {
      let connectorStatus: ConnectorStatusEnum | undefined;
      if (connectorId === 0) {
        continue;
      } else if (
        !this.getConnectorStatus(connectorId)?.status &&
        (this.isChargingStationAvailable() === false ||
          this.isConnectorAvailable(connectorId) === false)
      ) {
        connectorStatus = ConnectorStatusEnum.UNAVAILABLE;
      } else if (
        !this.getConnectorStatus(connectorId)?.status &&
        this.getConnectorStatus(connectorId)?.bootStatus
      ) {
        // Set boot status in template at startup
        connectorStatus = this.getConnectorStatus(connectorId)?.bootStatus;
      } else if (this.getConnectorStatus(connectorId)?.status) {
        // Set previous status at startup
        connectorStatus = this.getConnectorStatus(connectorId)?.status;
      } else {
        // Set default status
        connectorStatus = ConnectorStatusEnum.AVAILABLE;
      }
      await this.ocppRequestService.requestHandler<
        StatusNotificationRequest,
        StatusNotificationResponse
      >(
        this,
        RequestCommand.STATUS_NOTIFICATION,
        OCPPServiceUtils.buildStatusNotificationRequest(this, connectorId, connectorStatus)
      );
      this.getConnectorStatus(connectorId).status = connectorStatus;
    }
    if (this.stationInfo?.firmwareStatus === FirmwareStatus.Installing) {
      await this.ocppRequestService.requestHandler<
        FirmwareStatusNotificationRequest,
        FirmwareStatusNotificationResponse
      >(this, RequestCommand.FIRMWARE_STATUS_NOTIFICATION, {
        status: FirmwareStatus.Installed,
      });
      this.stationInfo.firmwareStatus = FirmwareStatus.Installed;
    }

    // Start the ATG
    if (this.getAutomaticTransactionGeneratorConfigurationFromTemplate()?.enable === true) {
      this.startAutomaticTransactionGenerator();
    }
    this.wsConnectionRestarted === true && this.flushMessageBuffer();
  }

  private async stopMessageSequence(
    reason: StopTransactionReason = StopTransactionReason.NONE
  ): Promise<void> {
    // Stop WebSocket ping
    this.stopWebSocketPing();
    // Stop heartbeat
    this.stopHeartbeat();
    // Stop ongoing transactions
    if (this.automaticTransactionGenerator?.started === true) {
      this.stopAutomaticTransactionGenerator();
    } else {
      await this.stopRunningTransactions(reason);
    }
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
            ConnectorStatusEnum.UNAVAILABLE
          )
        );
        this.getConnectorStatus(connectorId).status = undefined;
      }
    }
  }

  private startWebSocketPing(): void {
    const webSocketPingInterval: number = ChargingStationConfigurationUtils.getConfigurationKey(
      this,
      StandardParametersKey.WebSocketPingInterval
    )
      ? Utils.convertToInt(
          ChargingStationConfigurationUtils.getConfigurationKey(
            this,
            StandardParametersKey.WebSocketPingInterval
          )?.value
        )
      : 0;
    if (webSocketPingInterval > 0 && !this.webSocketPingSetInterval) {
      this.webSocketPingSetInterval = setInterval(() => {
        if (this.isWebSocketConnectionOpened() === true) {
          this.wsConnection?.ping();
        }
      }, webSocketPingInterval * 1000);
      logger.info(
        `${this.logPrefix()} WebSocket ping started every ${Utils.formatDurationSeconds(
          webSocketPingInterval
        )}`
      );
    } else if (this.webSocketPingSetInterval) {
      logger.info(
        `${this.logPrefix()} WebSocket ping already started every ${Utils.formatDurationSeconds(
          webSocketPingInterval
        )}`
      );
    } else {
      logger.error(
        `${this.logPrefix()} WebSocket ping interval set to ${
          webSocketPingInterval
            ? Utils.formatDurationSeconds(webSocketPingInterval)
            : webSocketPingInterval
        }, not starting the WebSocket ping`
      );
    }
  }

  private stopWebSocketPing(): void {
    if (this.webSocketPingSetInterval) {
      clearInterval(this.webSocketPingSetInterval);
    }
  }

  private getConfiguredSupervisionUrl(): URL {
    const supervisionUrls = this.stationInfo?.supervisionUrls ?? Configuration.getSupervisionUrls();
    if (Utils.isNotEmptyArray(supervisionUrls)) {
      switch (Configuration.getSupervisionUrlDistribution()) {
        case SupervisionUrlDistribution.ROUND_ROBIN:
          // FIXME
          this.configuredSupervisionUrlIndex = (this.index - 1) % supervisionUrls.length;
          break;
        case SupervisionUrlDistribution.RANDOM:
          this.configuredSupervisionUrlIndex = Math.floor(
            Utils.secureRandom() * supervisionUrls.length
          );
          break;
        case SupervisionUrlDistribution.CHARGING_STATION_AFFINITY:
          this.configuredSupervisionUrlIndex = (this.index - 1) % supervisionUrls.length;
          break;
        default:
          logger.error(
            `${this.logPrefix()} Unknown supervision url distribution '${Configuration.getSupervisionUrlDistribution()}' from values '${SupervisionUrlDistribution.toString()}', defaulting to ${
              SupervisionUrlDistribution.CHARGING_STATION_AFFINITY
            }`
          );
          this.configuredSupervisionUrlIndex = (this.index - 1) % supervisionUrls.length;
          break;
      }
      return new URL(supervisionUrls[this.configuredSupervisionUrlIndex]);
    }
    return new URL(supervisionUrls as string);
  }

  private getHeartbeatInterval(): number {
    const HeartbeatInterval = ChargingStationConfigurationUtils.getConfigurationKey(
      this,
      StandardParametersKey.HeartbeatInterval
    );
    if (HeartbeatInterval) {
      return Utils.convertToInt(HeartbeatInterval.value) * 1000;
    }
    const HeartBeatInterval = ChargingStationConfigurationUtils.getConfigurationKey(
      this,
      StandardParametersKey.HeartBeatInterval
    );
    if (HeartBeatInterval) {
      return Utils.convertToInt(HeartBeatInterval.value) * 1000;
    }
    this.stationInfo?.autoRegister === false &&
      logger.warn(
        `${this.logPrefix()} Heartbeat interval configuration key not set, using default value: ${
          Constants.DEFAULT_HEARTBEAT_INTERVAL
        }`
      );
    return Constants.DEFAULT_HEARTBEAT_INTERVAL;
  }

  private stopHeartbeat(): void {
    if (this.heartbeatSetInterval) {
      clearInterval(this.heartbeatSetInterval);
    }
  }

  private terminateWSConnection(): void {
    if (this.isWebSocketConnectionOpened() === true) {
      this.wsConnection?.terminate();
      this.wsConnection = null;
    }
  }

  private stopMeterValues(connectorId: number) {
    if (this.getConnectorStatus(connectorId)?.transactionSetInterval) {
      clearInterval(this.getConnectorStatus(connectorId)?.transactionSetInterval);
    }
  }

  private getReconnectExponentialDelay(): boolean {
    return this.stationInfo?.reconnectExponentialDelay ?? false;
  }

  private async reconnect(): Promise<void> {
    // Stop WebSocket ping
    this.stopWebSocketPing();
    // Stop heartbeat
    this.stopHeartbeat();
    // Stop the ATG if needed
    if (this.automaticTransactionGenerator?.configuration?.stopOnConnectionFailure === true) {
      this.stopAutomaticTransactionGenerator();
    }
    if (
      this.autoReconnectRetryCount < this.getAutoReconnectMaxRetries() ||
      this.getAutoReconnectMaxRetries() === -1
    ) {
      this.autoReconnectRetryCount++;
      const reconnectDelay = this.getReconnectExponentialDelay()
        ? Utils.exponentialDelay(this.autoReconnectRetryCount)
        : this.getConnectionTimeout() * 1000;
      const reconnectDelayWithdraw = 1000;
      const reconnectTimeout =
        reconnectDelay && reconnectDelay - reconnectDelayWithdraw > 0
          ? reconnectDelay - reconnectDelayWithdraw
          : 0;
      logger.error(
        `${this.logPrefix()} WebSocket connection retry in ${Utils.roundTo(
          reconnectDelay,
          2
        )}ms, timeout ${reconnectTimeout}ms`
      );
      await Utils.sleep(reconnectDelay);
      logger.error(
        `${this.logPrefix()} WebSocket connection retry #${this.autoReconnectRetryCount.toString()}`
      );
      this.openWSConnection(
        { ...(this.stationInfo?.wsOptions ?? {}), handshakeTimeout: reconnectTimeout },
        { closeOpened: true }
      );
      this.wsConnectionRestarted = true;
    } else if (this.getAutoReconnectMaxRetries() !== -1) {
      logger.error(
        `${this.logPrefix()} WebSocket connection retries failure: maximum retries reached (${
          this.autoReconnectRetryCount
        }) or retries disabled (${this.getAutoReconnectMaxRetries()})`
      );
    }
  }

  private getAutomaticTransactionGeneratorConfigurationFromTemplate():
    | AutomaticTransactionGeneratorConfiguration
    | undefined {
    return this.getTemplateFromFile()?.AutomaticTransactionGenerator;
  }

  private initializeConnectorStatus(connectorId: number): void {
    this.getConnectorStatus(connectorId).idTagLocalAuthorized = false;
    this.getConnectorStatus(connectorId).idTagAuthorized = false;
    this.getConnectorStatus(connectorId).transactionRemoteStarted = false;
    this.getConnectorStatus(connectorId).transactionStarted = false;
    this.getConnectorStatus(connectorId).energyActiveImportRegisterValue = 0;
    this.getConnectorStatus(connectorId).transactionEnergyActiveImportRegisterValue = 0;
  }
}
