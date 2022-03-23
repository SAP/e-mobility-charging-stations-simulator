// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import { ACElectricUtils, DCElectricUtils } from '../utils/ElectricUtils';
import {
  AvailabilityType,
  BootNotificationRequest,
  CachedRequest,
  IncomingRequest,
  IncomingRequestCommand,
  RequestCommand,
} from '../types/ocpp/Requests';
import {
  BootNotificationResponse,
  HeartbeatResponse,
  MeterValuesResponse,
  RegistrationStatus,
  StatusNotificationResponse,
} from '../types/ocpp/Responses';
import {
  ChargingProfile,
  ChargingRateUnitType,
  ChargingSchedulePeriod,
} from '../types/ocpp/ChargingProfile';
import ChargingStationConfiguration, { Section } from '../types/ChargingStationConfiguration';
import ChargingStationOcppConfiguration, {
  ConfigurationKey,
} from '../types/ChargingStationOcppConfiguration';
import ChargingStationTemplate, {
  AmpereUnits,
  CurrentType,
  PowerUnits,
  Voltage,
  WsOptions,
} from '../types/ChargingStationTemplate';
import {
  ConnectorPhaseRotation,
  StandardParametersKey,
  SupportedFeatureProfiles,
  VendorDefaultParametersKey,
} from '../types/ocpp/Configuration';
import { MeterValue, MeterValueMeasurand, MeterValuePhase } from '../types/ocpp/MeterValues';
import { StopTransactionReason, StopTransactionResponse } from '../types/ocpp/Transaction';
import { WSError, WebSocketCloseEventStatusCode } from '../types/WebSocket';
import WebSocket, { Data, OPEN, RawData } from 'ws';

import AutomaticTransactionGenerator from './AutomaticTransactionGenerator';
import { ChargePointErrorCode } from '../types/ocpp/ChargePointErrorCode';
import { ChargePointStatus } from '../types/ocpp/ChargePointStatus';
import ChargingStationInfo from '../types/ChargingStationInfo';
import { ChargingStationWorkerMessageEvents } from '../types/ChargingStationWorker';
import Configuration from '../utils/Configuration';
import { ConnectorStatus } from '../types/ConnectorStatus';
import Constants from '../utils/Constants';
import { ErrorType } from '../types/ocpp/ErrorType';
import { FileType } from '../types/FileType';
import FileUtils from '../utils/FileUtils';
import { JsonType } from '../types/JsonType';
import { MessageType } from '../types/ocpp/MessageType';
import OCPP16IncomingRequestService from './ocpp/1.6/OCPP16IncomingRequestService';
import OCPP16RequestService from './ocpp/1.6/OCPP16RequestService';
import OCPP16ResponseService from './ocpp/1.6/OCPP16ResponseService';
import { OCPP16ServiceUtils } from './ocpp/1.6/OCPP16ServiceUtils';
import OCPPError from '../exception/OCPPError';
import OCPPIncomingRequestService from './ocpp/OCPPIncomingRequestService';
import OCPPRequestService from './ocpp/OCPPRequestService';
import { OCPPVersion } from '../types/ocpp/OCPPVersion';
import PerformanceStatistics from '../performance/PerformanceStatistics';
import { SampledValueTemplate } from '../types/MeasurandPerPhaseSampledValueTemplates';
import { SupervisionUrlDistribution } from '../types/ConfigurationData';
import { URL } from 'url';
import Utils from '../utils/Utils';
import crypto from 'crypto';
import fs from 'fs';
import logger from '../utils/Logger';
import { parentPort } from 'worker_threads';
import path from 'path';

export default class ChargingStation {
  public hashId!: string;
  public readonly templateFile: string;
  public authorizedTags: string[];
  public stationInfo!: ChargingStationInfo;
  public readonly connectors: Map<number, ConnectorStatus>;
  public ocppConfiguration!: ChargingStationOcppConfiguration;
  public wsConnection!: WebSocket;
  public readonly requests: Map<string, CachedRequest>;
  public performanceStatistics!: PerformanceStatistics;
  public heartbeatSetInterval!: NodeJS.Timeout;
  public ocppRequestService!: OCPPRequestService;
  public bootNotificationResponse!: BootNotificationResponse | null;
  private readonly index: number;
  private configurationFile!: string;
  private bootNotificationRequest!: BootNotificationRequest;
  private connectorsConfigurationHash!: string;
  private ocppIncomingRequestService!: OCPPIncomingRequestService;
  private readonly messageBuffer: Set<string>;
  private wsConfiguredConnectionUrl!: URL;
  private wsConnectionRestarted: boolean;
  private stopped: boolean;
  private autoReconnectRetryCount: number;
  private automaticTransactionGenerator!: AutomaticTransactionGenerator;
  private webSocketPingSetInterval!: NodeJS.Timeout;

  constructor(index: number, templateFile: string) {
    this.index = index;
    this.templateFile = templateFile;
    this.stopped = false;
    this.wsConnectionRestarted = false;
    this.autoReconnectRetryCount = 0;
    this.connectors = new Map<number, ConnectorStatus>();
    this.requests = new Map<string, CachedRequest>();
    this.messageBuffer = new Set<string>();
    this.initialize();
    this.authorizedTags = this.getAuthorizedTags();
  }

  private get wsConnectionUrl(): URL {
    return this.getSupervisionUrlOcppConfiguration()
      ? new URL(
          this.getConfigurationKey(this.getSupervisionUrlOcppKey()).value +
            '/' +
            this.stationInfo.chargingStationId
        )
      : this.wsConfiguredConnectionUrl;
  }

  public logPrefix(): string {
    return Utils.logPrefix(` ${this.stationInfo.chargingStationId} |`);
  }

  public getBootNotificationRequest(): BootNotificationRequest {
    return this.bootNotificationRequest;
  }

  public getRandomIdTag(): string {
    const index = Math.floor(Utils.secureRandom() * this.authorizedTags.length);
    return this.authorizedTags[index];
  }

  public hasAuthorizedTags(): boolean {
    return !Utils.isEmptyArray(this.authorizedTags);
  }

  public getEnableStatistics(): boolean | undefined {
    return !Utils.isUndefined(this.stationInfo.enableStatistics)
      ? this.stationInfo.enableStatistics
      : true;
  }

  public getMayAuthorizeAtRemoteStart(): boolean | undefined {
    return this.stationInfo.mayAuthorizeAtRemoteStart ?? true;
  }

  public getNumberOfPhases(): number | undefined {
    switch (this.getCurrentOutType()) {
      case CurrentType.AC:
        return !Utils.isUndefined(this.stationInfo.numberOfPhases)
          ? this.stationInfo.numberOfPhases
          : 3;
      case CurrentType.DC:
        return 0;
    }
  }

  public isWebSocketConnectionOpened(): boolean {
    return this?.wsConnection?.readyState === OPEN;
  }

  public getRegistrationStatus(): RegistrationStatus {
    return this?.bootNotificationResponse?.status;
  }

  public isInUnknownState(): boolean {
    return Utils.isNullOrUndefined(this?.bootNotificationResponse?.status);
  }

  public isInPendingState(): boolean {
    return this?.bootNotificationResponse?.status === RegistrationStatus.PENDING;
  }

  public isInAcceptedState(): boolean {
    return this?.bootNotificationResponse?.status === RegistrationStatus.ACCEPTED;
  }

  public isInRejectedState(): boolean {
    return this?.bootNotificationResponse?.status === RegistrationStatus.REJECTED;
  }

  public isRegistered(): boolean {
    return !this.isInUnknownState() && (this.isInAcceptedState() || this.isInPendingState());
  }

  public isChargingStationAvailable(): boolean {
    return this.getConnectorStatus(0).availability === AvailabilityType.OPERATIVE;
  }

  public isConnectorAvailable(id: number): boolean {
    return id > 0 && this.getConnectorStatus(id).availability === AvailabilityType.OPERATIVE;
  }

  public getNumberOfConnectors(): number {
    return this.connectors.get(0) ? this.connectors.size - 1 : this.connectors.size;
  }

  public getConnectorStatus(id: number): ConnectorStatus {
    return this.connectors.get(id);
  }

  public getCurrentOutType(): CurrentType | undefined {
    return this.stationInfo.currentOutType ?? CurrentType.AC;
  }

  public getOcppStrictCompliance(): boolean {
    return this.stationInfo.ocppStrictCompliance ?? false;
  }

  public getVoltageOut(): number | undefined {
    const errMsg = `${this.logPrefix()} Unknown ${this.getCurrentOutType()} currentOutType in template file ${
      this.templateFile
    }, cannot define default voltage out`;
    let defaultVoltageOut: number;
    switch (this.getCurrentOutType()) {
      case CurrentType.AC:
        defaultVoltageOut = Voltage.VOLTAGE_230;
        break;
      case CurrentType.DC:
        defaultVoltageOut = Voltage.VOLTAGE_400;
        break;
      default:
        logger.error(errMsg);
        throw new Error(errMsg);
    }
    return !Utils.isUndefined(this.stationInfo.voltageOut)
      ? this.stationInfo.voltageOut
      : defaultVoltageOut;
  }

  public getConnectorMaximumAvailablePower(connectorId: number): number {
    let amperageLimitationPowerLimit: number;
    if (this.getAmperageLimitation() < this.stationInfo.maximumAmperage) {
      amperageLimitationPowerLimit =
        this.getCurrentOutType() === CurrentType.AC
          ? ACElectricUtils.powerTotal(
              this.getNumberOfPhases(),
              this.getVoltageOut(),
              this.getAmperageLimitation() * this.getNumberOfConnectors()
            )
          : DCElectricUtils.power(this.getVoltageOut(), this.getAmperageLimitation());
    }
    const connectorChargingProfilePowerLimit = this.getChargingProfilePowerLimit(connectorId);
    const connectorMaximumPower =
      ((this.stationInfo['maxPower'] as number) ?? this.stationInfo.maximumPower) /
      this.stationInfo.powerDivider;
    const connectorAmperageLimitationPowerLimit =
      amperageLimitationPowerLimit / this.stationInfo.powerDivider;
    return Math.min(
      isNaN(connectorMaximumPower) ? Infinity : connectorMaximumPower,
      isNaN(connectorAmperageLimitationPowerLimit)
        ? Infinity
        : connectorAmperageLimitationPowerLimit,
      isNaN(connectorChargingProfilePowerLimit) ? Infinity : connectorChargingProfilePowerLimit
    );
  }

  public getTransactionIdTag(transactionId: number): string | undefined {
    for (const connectorId of this.connectors.keys()) {
      if (connectorId > 0 && this.getConnectorStatus(connectorId).transactionId === transactionId) {
        return this.getConnectorStatus(connectorId).transactionIdTag;
      }
    }
  }

  public getOutOfOrderEndMeterValues(): boolean {
    return this.stationInfo.outOfOrderEndMeterValues ?? false;
  }

  public getBeginEndMeterValues(): boolean {
    return this.stationInfo.beginEndMeterValues ?? false;
  }

  public getMeteringPerTransaction(): boolean {
    return this.stationInfo.meteringPerTransaction ?? true;
  }

  public getTransactionDataMeterValues(): boolean {
    return this.stationInfo.transactionDataMeterValues ?? false;
  }

  public getMainVoltageMeterValues(): boolean {
    return this.stationInfo.mainVoltageMeterValues ?? true;
  }

  public getPhaseLineToLineVoltageMeterValues(): boolean {
    return this.stationInfo.phaseLineToLineVoltageMeterValues ?? false;
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

  public getEnergyActiveImportRegisterByTransactionId(transactionId: number): number | undefined {
    const transactionConnectorStatus = this.getConnectorStatus(
      this.getConnectorIdByTransactionId(transactionId)
    );
    if (this.getMeteringPerTransaction()) {
      return transactionConnectorStatus?.transactionEnergyActiveImportRegisterValue;
    }
    return transactionConnectorStatus?.energyActiveImportRegisterValue;
  }

  public getEnergyActiveImportRegisterByConnectorId(connectorId: number): number | undefined {
    const connectorStatus = this.getConnectorStatus(connectorId);
    if (this.getMeteringPerTransaction()) {
      return connectorStatus?.transactionEnergyActiveImportRegisterValue;
    }
    return connectorStatus?.energyActiveImportRegisterValue;
  }

  public getAuthorizeRemoteTxRequests(): boolean {
    const authorizeRemoteTxRequests = this.getConfigurationKey(
      StandardParametersKey.AuthorizeRemoteTxRequests
    );
    return authorizeRemoteTxRequests
      ? Utils.convertToBoolean(authorizeRemoteTxRequests.value)
      : false;
  }

  public getLocalAuthListEnabled(): boolean {
    const localAuthListEnabled = this.getConfigurationKey(
      StandardParametersKey.LocalAuthListEnabled
    );
    return localAuthListEnabled ? Utils.convertToBoolean(localAuthListEnabled.value) : false;
  }

  public restartWebSocketPing(): void {
    // Stop WebSocket ping
    this.stopWebSocketPing();
    // Start WebSocket ping
    this.startWebSocketPing();
  }

  public getSampledValueTemplate(
    connectorId: number,
    measurand: MeterValueMeasurand = MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
    phase?: MeterValuePhase
  ): SampledValueTemplate | undefined {
    const onPhaseStr = phase ? `on phase ${phase} ` : '';
    if (!Constants.SUPPORTED_MEASURANDS.includes(measurand)) {
      logger.warn(
        `${this.logPrefix()} Trying to get unsupported MeterValues measurand '${measurand}' ${onPhaseStr}in template on connectorId ${connectorId}`
      );
      return;
    }
    if (
      measurand !== MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER &&
      !this.getConfigurationKey(StandardParametersKey.MeterValuesSampledData).value.includes(
        measurand
      )
    ) {
      logger.debug(
        `${this.logPrefix()} Trying to get MeterValues measurand '${measurand}' ${onPhaseStr}in template on connectorId ${connectorId} not found in '${
          StandardParametersKey.MeterValuesSampledData
        }' OCPP parameter`
      );
      return;
    }
    const sampledValueTemplates: SampledValueTemplate[] =
      this.getConnectorStatus(connectorId).MeterValues;
    for (
      let index = 0;
      !Utils.isEmptyArray(sampledValueTemplates) && index < sampledValueTemplates.length;
      index++
    ) {
      if (
        !Constants.SUPPORTED_MEASURANDS.includes(
          sampledValueTemplates[index]?.measurand ??
            MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
        )
      ) {
        logger.warn(
          `${this.logPrefix()} Unsupported MeterValues measurand '${measurand}' ${onPhaseStr}in template on connectorId ${connectorId}`
        );
      } else if (
        phase &&
        sampledValueTemplates[index]?.phase === phase &&
        sampledValueTemplates[index]?.measurand === measurand &&
        this.getConfigurationKey(StandardParametersKey.MeterValuesSampledData).value.includes(
          measurand
        )
      ) {
        return sampledValueTemplates[index];
      } else if (
        !phase &&
        !sampledValueTemplates[index].phase &&
        sampledValueTemplates[index]?.measurand === measurand &&
        this.getConfigurationKey(StandardParametersKey.MeterValuesSampledData).value.includes(
          measurand
        )
      ) {
        return sampledValueTemplates[index];
      } else if (
        measurand === MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER &&
        (!sampledValueTemplates[index].measurand ||
          sampledValueTemplates[index].measurand === measurand)
      ) {
        return sampledValueTemplates[index];
      }
    }
    if (measurand === MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER) {
      const errorMsg = `${this.logPrefix()} Missing MeterValues for default measurand '${measurand}' in template on connectorId ${connectorId}`;
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }
    logger.debug(
      `${this.logPrefix()} No MeterValues for measurand '${measurand}' ${onPhaseStr}in template on connectorId ${connectorId}`
    );
  }

  public getAutomaticTransactionGeneratorRequireAuthorize(): boolean {
    return this.stationInfo.AutomaticTransactionGenerator.requireAuthorize ?? true;
  }

  public startHeartbeat(): void {
    if (
      this.getHeartbeatInterval() &&
      this.getHeartbeatInterval() > 0 &&
      !this.heartbeatSetInterval
    ) {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      this.heartbeatSetInterval = setInterval(async (): Promise<void> => {
        await this.ocppRequestService.sendMessageHandler<HeartbeatResponse>(
          RequestCommand.HEARTBEAT
        );
      }, this.getHeartbeatInterval());
      logger.info(
        this.logPrefix() +
          ' Heartbeat started every ' +
          Utils.formatDurationMilliSeconds(this.getHeartbeatInterval())
      );
    } else if (this.heartbeatSetInterval) {
      logger.info(
        this.logPrefix() +
          ' Heartbeat already started every ' +
          Utils.formatDurationMilliSeconds(this.getHeartbeatInterval())
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
    if (!this.getConnectorStatus(connectorId)?.transactionStarted) {
      logger.error(
        `${this.logPrefix()} Trying to start MeterValues on connector Id ${connectorId} with no transaction started`
      );
      return;
    } else if (
      this.getConnectorStatus(connectorId)?.transactionStarted &&
      !this.getConnectorStatus(connectorId)?.transactionId
    ) {
      logger.error(
        `${this.logPrefix()} Trying to start MeterValues on connector Id ${connectorId} with no transaction id`
      );
      return;
    }
    if (interval > 0) {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      this.getConnectorStatus(connectorId).transactionSetInterval = setInterval(
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        async (): Promise<void> => {
          // FIXME: Implement OCPP version agnostic helpers
          const meterValue: MeterValue = OCPP16ServiceUtils.buildMeterValue(
            this,
            connectorId,
            this.getConnectorStatus(connectorId).transactionId,
            interval
          );
          await this.ocppRequestService.sendMessageHandler<MeterValuesResponse>(
            RequestCommand.METER_VALUES,
            {
              connectorId,
              transactionId: this.getConnectorStatus(connectorId).transactionId,
              meterValue: [meterValue],
            }
          );
        },
        interval
      );
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
    if (this.getEnableStatistics()) {
      this.performanceStatistics.start();
    }
    this.openWSConnection();
    // Monitor authorization file
    FileUtils.watchJsonFile<string[]>(
      this.logPrefix(),
      FileType.Authorization,
      this.getAuthorizationFile(),
      this.authorizedTags
    );
    // Monitor charging station template file
    FileUtils.watchJsonFile(
      this.logPrefix(),
      FileType.ChargingStationTemplate,
      this.templateFile,
      null,
      (event, filename): void => {
        if (filename && event === 'change') {
          try {
            logger.debug(
              `${this.logPrefix()} ${FileType.ChargingStationTemplate} ${
                this.templateFile
              } file have changed, reload`
            );
            // Initialize
            this.initialize();
            // Restart the ATG
            if (
              !this.stationInfo.AutomaticTransactionGenerator.enable &&
              this.automaticTransactionGenerator
            ) {
              this.automaticTransactionGenerator.stop();
            }
            this.startAutomaticTransactionGenerator();
            if (this.getEnableStatistics()) {
              this.performanceStatistics.restart();
            } else {
              this.performanceStatistics.stop();
            }
            // FIXME?: restart heartbeat and WebSocket ping when their interval values have changed
          } catch (error) {
            logger.error(
              `${this.logPrefix()} ${FileType.ChargingStationTemplate} file monitoring error: %j`,
              error
            );
          }
        }
      }
    );
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
    parentPort.postMessage({
      id: ChargingStationWorkerMessageEvents.STARTED,
      data: { id: this.stationInfo.chargingStationId },
    });
  }

  public async stop(reason: StopTransactionReason = StopTransactionReason.NONE): Promise<void> {
    // Stop message sequence
    await this.stopMessageSequence(reason);
    for (const connectorId of this.connectors.keys()) {
      if (connectorId > 0) {
        await this.ocppRequestService.sendMessageHandler<StatusNotificationResponse>(
          RequestCommand.STATUS_NOTIFICATION,
          {
            connectorId,
            status: ChargePointStatus.UNAVAILABLE,
            errorCode: ChargePointErrorCode.NO_ERROR,
          }
        );
        this.getConnectorStatus(connectorId).status = ChargePointStatus.UNAVAILABLE;
      }
    }
    if (this.isWebSocketConnectionOpened()) {
      this.wsConnection.close();
    }
    if (this.getEnableStatistics()) {
      this.performanceStatistics.stop();
    }
    this.bootNotificationResponse = null;
    parentPort.postMessage({
      id: ChargingStationWorkerMessageEvents.STOPPED,
      data: { id: this.stationInfo.chargingStationId },
    });
    this.stopped = true;
  }

  public getConfigurationKey(
    key: string | StandardParametersKey,
    caseInsensitive = false
  ): ConfigurationKey | undefined {
    return this.ocppConfiguration.configurationKey.find((configElement) => {
      if (caseInsensitive) {
        return configElement.key.toLowerCase() === key.toLowerCase();
      }
      return configElement.key === key;
    });
  }

  public addConfigurationKey(
    key: string | StandardParametersKey,
    value: string,
    options: { readonly?: boolean; visible?: boolean; reboot?: boolean } = {
      readonly: false,
      visible: true,
      reboot: false,
    },
    params: { overwrite?: boolean; save?: boolean } = { overwrite: false, save: false }
  ): void {
    options = options ?? ({} as { readonly?: boolean; visible?: boolean; reboot?: boolean });
    options.readonly = options?.readonly ?? false;
    options.visible = options?.visible ?? true;
    options.reboot = options?.reboot ?? false;
    let keyFound = this.getConfigurationKey(key);
    if (keyFound && params?.overwrite) {
      this.deleteConfigurationKey(keyFound.key, { save: false });
      keyFound = undefined;
    }
    if (!keyFound) {
      this.ocppConfiguration.configurationKey.push({
        key,
        readonly: options.readonly,
        value,
        visible: options.visible,
        reboot: options.reboot,
      });
      params?.save && this.saveOcppConfiguration();
    } else {
      logger.error(
        `${this.logPrefix()} Trying to add an already existing configuration key: %j`,
        keyFound
      );
    }
  }

  public setConfigurationKeyValue(
    key: string | StandardParametersKey,
    value: string,
    caseInsensitive = false
  ): void {
    const keyFound = this.getConfigurationKey(key, caseInsensitive);
    if (keyFound) {
      this.ocppConfiguration.configurationKey[
        this.ocppConfiguration.configurationKey.indexOf(keyFound)
      ].value = value;
      this.saveOcppConfiguration();
    } else {
      logger.error(
        `${this.logPrefix()} Trying to set a value on a non existing configuration key: %j`,
        { key, value }
      );
    }
  }

  public deleteConfigurationKey(
    key: string | StandardParametersKey,
    params: { save?: boolean; caseInsensitive?: boolean } = { save: true, caseInsensitive: false }
  ): ConfigurationKey[] {
    const keyFound = this.getConfigurationKey(key, params?.caseInsensitive);
    if (keyFound) {
      const deletedConfigurationKey = this.ocppConfiguration.configurationKey.splice(
        this.ocppConfiguration.configurationKey.indexOf(keyFound),
        1
      );
      params?.save && this.saveOcppConfiguration();
      return deletedConfigurationKey;
    }
  }

  public getChargingProfilePowerLimit(connectorId: number): number | undefined {
    const timestamp = new Date().getTime();
    let matchingChargingProfile: ChargingProfile;
    let chargingSchedulePeriods: ChargingSchedulePeriod[] = [];
    if (!Utils.isEmptyArray(this.getConnectorStatus(connectorId)?.chargingProfiles)) {
      const chargingProfiles: ChargingProfile[] = this.getConnectorStatus(
        connectorId
      ).chargingProfiles.filter(
        (chargingProfile) =>
          timestamp >= chargingProfile.chargingSchedule?.startSchedule.getTime() &&
          timestamp <
            chargingProfile.chargingSchedule?.startSchedule.getTime() +
              chargingProfile.chargingSchedule.duration &&
          chargingProfile?.stackLevel === Math.max(...chargingProfiles.map((cp) => cp?.stackLevel))
      );
      if (!Utils.isEmptyArray(chargingProfiles)) {
        for (const chargingProfile of chargingProfiles) {
          if (!Utils.isEmptyArray(chargingProfile.chargingSchedule.chargingSchedulePeriod)) {
            chargingSchedulePeriods =
              chargingProfile.chargingSchedule.chargingSchedulePeriod.filter(
                (chargingSchedulePeriod, index) => {
                  timestamp >=
                    chargingProfile.chargingSchedule.startSchedule.getTime() +
                      chargingSchedulePeriod.startPeriod &&
                    chargingProfile.chargingSchedule.chargingSchedulePeriod[index + 1] &&
                    timestamp <
                      chargingProfile.chargingSchedule.startSchedule.getTime() +
                        chargingProfile.chargingSchedule.chargingSchedulePeriod[index + 1]
                          ?.startPeriod;
                }
              );
            if (!Utils.isEmptyArray(chargingSchedulePeriods)) {
              matchingChargingProfile = chargingProfile;
              break;
            }
          }
        }
      }
    }
    let limit: number;
    if (!Utils.isEmptyArray(chargingSchedulePeriods)) {
      switch (this.getCurrentOutType()) {
        case CurrentType.AC:
          limit =
            matchingChargingProfile.chargingSchedule.chargingRateUnit === ChargingRateUnitType.WATT
              ? chargingSchedulePeriods[0].limit
              : ACElectricUtils.powerTotal(
                  this.getNumberOfPhases(),
                  this.getVoltageOut(),
                  chargingSchedulePeriods[0].limit
                );
          break;
        case CurrentType.DC:
          limit =
            matchingChargingProfile.chargingSchedule.chargingRateUnit === ChargingRateUnitType.WATT
              ? chargingSchedulePeriods[0].limit
              : DCElectricUtils.power(this.getVoltageOut(), chargingSchedulePeriods[0].limit);
      }
    }
    const connectorMaximumPower =
      ((this.stationInfo['maxPower'] as number) ?? this.stationInfo.maximumPower) /
      this.stationInfo.powerDivider;
    if (limit > connectorMaximumPower) {
      logger.error(
        `${this.logPrefix()} Charging profile limit is greater than connector id ${connectorId} maximum, dump their stack: %j`,
        this.getConnectorStatus(connectorId).chargingProfiles
      );
      limit = connectorMaximumPower;
    }
    return limit;
  }

  public setChargingProfile(connectorId: number, cp: ChargingProfile): void {
    let cpReplaced = false;
    if (!Utils.isEmptyArray(this.getConnectorStatus(connectorId).chargingProfiles)) {
      this.getConnectorStatus(connectorId).chargingProfiles?.forEach(
        (chargingProfile: ChargingProfile, index: number) => {
          if (
            chargingProfile.chargingProfileId === cp.chargingProfileId ||
            (chargingProfile.stackLevel === cp.stackLevel &&
              chargingProfile.chargingProfilePurpose === cp.chargingProfilePurpose)
          ) {
            this.getConnectorStatus(connectorId).chargingProfiles[index] = cp;
            cpReplaced = true;
          }
        }
      );
    }
    !cpReplaced && this.getConnectorStatus(connectorId).chargingProfiles?.push(cp);
  }

  public resetConnectorStatus(connectorId: number): void {
    this.getConnectorStatus(connectorId).idTagLocalAuthorized = false;
    this.getConnectorStatus(connectorId).idTagAuthorized = false;
    this.getConnectorStatus(connectorId).transactionRemoteStarted = false;
    this.getConnectorStatus(connectorId).transactionStarted = false;
    delete this.getConnectorStatus(connectorId).localAuthorizeIdTag;
    delete this.getConnectorStatus(connectorId).authorizeIdTag;
    delete this.getConnectorStatus(connectorId).transactionId;
    delete this.getConnectorStatus(connectorId).transactionIdTag;
    this.getConnectorStatus(connectorId).transactionEnergyActiveImportRegisterValue = 0;
    delete this.getConnectorStatus(connectorId).transactionBeginMeterValue;
    this.stopMeterValues(connectorId);
  }

  public bufferMessage(message: string): void {
    this.messageBuffer.add(message);
  }

  private flushMessageBuffer() {
    if (this.messageBuffer.size > 0) {
      this.messageBuffer.forEach((message) => {
        // TODO: evaluate the need to track performance
        this.wsConnection.send(message);
        this.messageBuffer.delete(message);
      });
    }
  }

  private getSupervisionUrlOcppConfiguration(): boolean {
    return this.stationInfo.supervisionUrlOcppConfiguration ?? false;
  }

  private getSupervisionUrlOcppKey(): string {
    return this.stationInfo.supervisionUrlOcppKey ?? VendorDefaultParametersKey.ConnectionUrl;
  }

  private getChargingStationId(stationTemplate: ChargingStationTemplate): string {
    // In case of multiple instances: add instance index to charging station id
    const instanceIndex = process.env.CF_INSTANCE_INDEX ?? 0;
    const idSuffix = stationTemplate.nameSuffix ?? '';
    const idStr = '000000000' + this.index.toString();
    return stationTemplate.fixedName
      ? stationTemplate.baseName
      : stationTemplate.baseName +
          '-' +
          instanceIndex.toString() +
          idStr.substring(idStr.length - 4) +
          idSuffix;
  }

  private getRandomSerialNumberSuffix(params?: {
    randomBytesLength?: number;
    upperCase?: boolean;
  }): string {
    const randomSerialNumberSuffix = crypto
      .randomBytes(params?.randomBytesLength ?? 16)
      .toString('hex');
    if (params?.upperCase) {
      return randomSerialNumberSuffix.toUpperCase();
    }
    return randomSerialNumberSuffix;
  }

  private getTemplateFromFile(): ChargingStationTemplate | null {
    let template: ChargingStationTemplate = null;
    try {
      const measureId = `${FileType.ChargingStationTemplate} read`;
      const beginId = PerformanceStatistics.beginMeasure(measureId);
      template = JSON.parse(fs.readFileSync(this.templateFile, 'utf8')) as ChargingStationTemplate;
      PerformanceStatistics.endMeasure(measureId, beginId);
    } catch (error) {
      FileUtils.handleFileException(
        this.logPrefix(),
        FileType.ChargingStationTemplate,
        this.templateFile,
        error as NodeJS.ErrnoException
      );
    }
    return template;
  }

  private createSerialNumber(
    stationInfo: ChargingStationInfo,
    existingStationInfo?: ChargingStationInfo,
    params: { randomSerialNumberUpperCase?: boolean; randomSerialNumber?: boolean } = {
      randomSerialNumberUpperCase: true,
      randomSerialNumber: true,
    }
  ): void {
    params = params ?? {};
    params.randomSerialNumberUpperCase = params?.randomSerialNumberUpperCase ?? true;
    params.randomSerialNumber = params?.randomSerialNumber ?? true;
    if (existingStationInfo) {
      existingStationInfo?.chargePointSerialNumber &&
        (stationInfo.chargePointSerialNumber = existingStationInfo.chargePointSerialNumber);
      existingStationInfo?.chargeBoxSerialNumber &&
        (stationInfo.chargeBoxSerialNumber = existingStationInfo.chargeBoxSerialNumber);
    } else {
      const serialNumberSuffix = params?.randomSerialNumber
        ? this.getRandomSerialNumberSuffix({ upperCase: params.randomSerialNumberUpperCase })
        : '';
      stationInfo.chargePointSerialNumber =
        stationInfo?.chargePointSerialNumberPrefix &&
        stationInfo.chargePointSerialNumberPrefix + serialNumberSuffix;
      stationInfo.chargeBoxSerialNumber =
        stationInfo?.chargeBoxSerialNumberPrefix &&
        stationInfo.chargeBoxSerialNumberPrefix + serialNumberSuffix;
    }
  }

  private getStationInfoFromTemplate(): ChargingStationInfo {
    const stationInfo: ChargingStationInfo =
      this.getTemplateFromFile() ?? ({} as ChargingStationInfo);
    stationInfo.hash = crypto
      .createHash(Constants.DEFAULT_HASH_ALGORITHM)
      .update(JSON.stringify(stationInfo))
      .digest('hex');
    const chargingStationId = this.getChargingStationId(stationInfo);
    // Deprecation template keys section
    this.warnDeprecatedTemplateKey(
      stationInfo,
      'supervisionUrl',
      chargingStationId,
      "Use 'supervisionUrls' instead"
    );
    this.convertDeprecatedTemplateKey(stationInfo, 'supervisionUrl', 'supervisionUrls');
    stationInfo.wsOptions = stationInfo?.wsOptions ?? {};
    if (!Utils.isEmptyArray(stationInfo.power)) {
      stationInfo.power = stationInfo.power as number[];
      const powerArrayRandomIndex = Math.floor(Utils.secureRandom() * stationInfo.power.length);
      stationInfo.maximumPower =
        stationInfo.powerUnit === PowerUnits.KILO_WATT
          ? stationInfo.power[powerArrayRandomIndex] * 1000
          : stationInfo.power[powerArrayRandomIndex];
    } else {
      stationInfo.power = stationInfo.power as number;
      stationInfo.maximumPower =
        stationInfo.powerUnit === PowerUnits.KILO_WATT
          ? stationInfo.power * 1000
          : stationInfo.power;
    }
    delete stationInfo.power;
    delete stationInfo.powerUnit;
    stationInfo.chargingStationId = chargingStationId;
    stationInfo.resetTime = stationInfo.resetTime
      ? stationInfo.resetTime * 1000
      : Constants.CHARGING_STATION_DEFAULT_RESET_TIME;
    return stationInfo;
  }

  private getStationInfoFromFile(): ChargingStationInfo | null {
    return this.getConfigurationFromFile()?.stationInfo ?? null;
  }

  private getStationInfo(): ChargingStationInfo {
    const stationInfoFromTemplate: ChargingStationInfo = this.getStationInfoFromTemplate();
    this.hashId = this.getHashId(stationInfoFromTemplate);
    this.configurationFile = path.join(
      path.resolve(__dirname, '../'),
      'assets',
      'configurations',
      this.hashId + '.json'
    );
    const stationInfoFromFile: ChargingStationInfo = this.getStationInfoFromFile();
    if (stationInfoFromFile?.hash === stationInfoFromTemplate.hash) {
      return stationInfoFromFile;
    }
    this.createSerialNumber(stationInfoFromTemplate, stationInfoFromFile);
    return stationInfoFromTemplate;
  }

  private saveStationInfo(): void {
    this.saveConfiguration(Section.stationInfo);
  }

  private getOcppVersion(): OCPPVersion {
    return this.stationInfo.ocppVersion ? this.stationInfo.ocppVersion : OCPPVersion.VERSION_16;
  }

  private getOcppPersistentConfiguration(): boolean {
    return this.stationInfo.ocppPersistentConfiguration ?? true;
  }

  private handleUnsupportedVersion(version: OCPPVersion) {
    const errMsg = `${this.logPrefix()} Unsupported protocol version '${version}' configured in template file ${
      this.templateFile
    }`;
    logger.error(errMsg);
    throw new Error(errMsg);
  }

  private createBootNotificationRequest(stationInfo: ChargingStationInfo): BootNotificationRequest {
    return {
      chargePointModel: stationInfo.chargePointModel,
      chargePointVendor: stationInfo.chargePointVendor,
      ...(!Utils.isUndefined(stationInfo.chargeBoxSerialNumber) && {
        chargeBoxSerialNumber: stationInfo.chargeBoxSerialNumber,
      }),
      ...(!Utils.isUndefined(stationInfo.chargePointSerialNumber) && {
        chargePointSerialNumber: stationInfo.chargePointSerialNumber,
      }),
      ...(!Utils.isUndefined(stationInfo.firmwareVersion) && {
        firmwareVersion: stationInfo.firmwareVersion,
      }),
      ...(!Utils.isUndefined(stationInfo.iccid) && { iccid: stationInfo.iccid }),
      ...(!Utils.isUndefined(stationInfo.imsi) && { imsi: stationInfo.imsi }),
      ...(!Utils.isUndefined(stationInfo.meterSerialNumber) && {
        meterSerialNumber: stationInfo.meterSerialNumber,
      }),
      ...(!Utils.isUndefined(stationInfo.meterType) && {
        meterType: stationInfo.meterType,
      }),
    };
  }

  private getHashId(stationInfo: ChargingStationInfo): string {
    const hashBootNotificationRequest = {
      chargePointModel: stationInfo.chargePointModel,
      chargePointVendor: stationInfo.chargePointVendor,
      ...(!Utils.isUndefined(stationInfo.chargeBoxSerialNumberPrefix) && {
        chargeBoxSerialNumber: stationInfo.chargeBoxSerialNumberPrefix,
      }),
      ...(!Utils.isUndefined(stationInfo.chargePointSerialNumberPrefix) && {
        chargePointSerialNumber: stationInfo.chargePointSerialNumberPrefix,
      }),
      ...(!Utils.isUndefined(stationInfo.firmwareVersion) && {
        firmwareVersion: stationInfo.firmwareVersion,
      }),
      ...(!Utils.isUndefined(stationInfo.iccid) && { iccid: stationInfo.iccid }),
      ...(!Utils.isUndefined(stationInfo.imsi) && { imsi: stationInfo.imsi }),
      ...(!Utils.isUndefined(stationInfo.meterSerialNumber) && {
        meterSerialNumber: stationInfo.meterSerialNumber,
      }),
      ...(!Utils.isUndefined(stationInfo.meterType) && {
        meterType: stationInfo.meterType,
      }),
    };
    return crypto
      .createHash(Constants.DEFAULT_HASH_ALGORITHM)
      .update(JSON.stringify(hashBootNotificationRequest) + stationInfo.chargingStationId)
      .digest('hex');
  }

  private initialize(): void {
    this.stationInfo = this.getStationInfo();
    logger.info(`${this.logPrefix()} Charging station hashId '${this.hashId}'`);
    this.bootNotificationRequest = this.createBootNotificationRequest(this.stationInfo);
    this.ocppConfiguration = this.getOcppConfiguration();
    delete this.stationInfo.Configuration;
    // Build connectors if needed
    const maxConnectors = this.getMaxNumberOfConnectors();
    if (maxConnectors <= 0) {
      logger.warn(
        `${this.logPrefix()} Charging station template ${
          this.templateFile
        } with ${maxConnectors} connectors`
      );
    }
    const templateMaxConnectors = this.getTemplateMaxNumberOfConnectors();
    if (templateMaxConnectors <= 0) {
      logger.warn(
        `${this.logPrefix()} Charging station template ${
          this.templateFile
        } with no connector configuration`
      );
    }
    if (!this.stationInfo.Connectors[0]) {
      logger.warn(
        `${this.logPrefix()} Charging station template ${
          this.templateFile
        } with no connector Id 0 configuration`
      );
    }
    // Sanity check
    if (
      maxConnectors >
        (this.stationInfo.Connectors[0] ? templateMaxConnectors - 1 : templateMaxConnectors) &&
      !this.stationInfo.randomConnectors
    ) {
      logger.warn(
        `${this.logPrefix()} Number of connectors exceeds the number of connector configurations in template ${
          this.templateFile
        }, forcing random connector configurations affectation`
      );
      this.stationInfo.randomConnectors = true;
    }
    const connectorsConfigHash = crypto
      .createHash(Constants.DEFAULT_HASH_ALGORITHM)
      .update(JSON.stringify(this.stationInfo.Connectors) + maxConnectors.toString())
      .digest('hex');
    const connectorsConfigChanged =
      this.connectors?.size !== 0 && this.connectorsConfigurationHash !== connectorsConfigHash;
    if (this.connectors?.size === 0 || connectorsConfigChanged) {
      connectorsConfigChanged && this.connectors.clear();
      this.connectorsConfigurationHash = connectorsConfigHash;
      // Add connector Id 0
      let lastConnector = '0';
      for (lastConnector in this.stationInfo.Connectors) {
        const lastConnectorId = Utils.convertToInt(lastConnector);
        if (
          lastConnectorId === 0 &&
          this.getUseConnectorId0() &&
          this.stationInfo.Connectors[lastConnector]
        ) {
          this.connectors.set(
            lastConnectorId,
            Utils.cloneObject<ConnectorStatus>(this.stationInfo.Connectors[lastConnector])
          );
          this.getConnectorStatus(lastConnectorId).availability = AvailabilityType.OPERATIVE;
          if (Utils.isUndefined(this.getConnectorStatus(lastConnectorId)?.chargingProfiles)) {
            this.getConnectorStatus(lastConnectorId).chargingProfiles = [];
          }
        }
      }
      // Generate all connectors
      if (
        (this.stationInfo.Connectors[0] ? templateMaxConnectors - 1 : templateMaxConnectors) > 0
      ) {
        for (let index = 1; index <= maxConnectors; index++) {
          const randConnectorId = this.stationInfo.randomConnectors
            ? Utils.getRandomInteger(Utils.convertToInt(lastConnector), 1)
            : index;
          this.connectors.set(
            index,
            Utils.cloneObject<ConnectorStatus>(this.stationInfo.Connectors[randConnectorId])
          );
          this.getConnectorStatus(index).availability = AvailabilityType.OPERATIVE;
          if (Utils.isUndefined(this.getConnectorStatus(index)?.chargingProfiles)) {
            this.getConnectorStatus(index).chargingProfiles = [];
          }
        }
      }
    }
    // The connectors attribute need to be initialized
    this.stationInfo.maximumAmperage = this.getMaximumAmperage();
    this.saveStationInfo();
    // Avoid duplication of connectors related information in RAM
    delete this.stationInfo.Connectors;
    // Initialize transaction attributes on connectors
    for (const connectorId of this.connectors.keys()) {
      if (connectorId > 0 && !this.getConnectorStatus(connectorId)?.transactionStarted) {
        this.initializeConnectorStatus(connectorId);
      }
    }
    this.wsConfiguredConnectionUrl = new URL(
      this.getConfiguredSupervisionUrl().href + '/' + this.stationInfo.chargingStationId
    );
    // OCPP configuration
    this.initializeOcppConfiguration();
    switch (this.getOcppVersion()) {
      case OCPPVersion.VERSION_16:
        this.ocppIncomingRequestService =
          OCPP16IncomingRequestService.getInstance<OCPP16IncomingRequestService>(this);
        this.ocppRequestService = OCPP16RequestService.getInstance<OCPP16RequestService>(
          this,
          OCPP16ResponseService.getInstance<OCPP16ResponseService>(this)
        );
        break;
      default:
        this.handleUnsupportedVersion(this.getOcppVersion());
        break;
    }
    if (this.stationInfo.autoRegister) {
      this.bootNotificationResponse = {
        currentTime: new Date().toISOString(),
        interval: this.getHeartbeatInterval() / 1000,
        status: RegistrationStatus.ACCEPTED,
      };
    }
    this.stationInfo.powerDivider = this.getPowerDivider();
    if (this.getEnableStatistics()) {
      this.performanceStatistics = PerformanceStatistics.getInstance(
        this.hashId,
        this.stationInfo.chargingStationId,
        this.wsConnectionUrl
      );
    }
  }

  private initializeOcppConfiguration(): void {
    if (
      this.getSupervisionUrlOcppConfiguration() &&
      !this.getConfigurationKey(this.getSupervisionUrlOcppKey())
    ) {
      this.addConfigurationKey(
        this.getSupervisionUrlOcppKey(),
        this.getConfiguredSupervisionUrl().href,
        { reboot: true }
      );
    } else if (
      !this.getSupervisionUrlOcppConfiguration() &&
      this.getConfigurationKey(this.getSupervisionUrlOcppKey())
    ) {
      this.deleteConfigurationKey(this.getSupervisionUrlOcppKey(), { save: false });
    }
    if (
      this.stationInfo.amperageLimitationOcppKey &&
      !this.getConfigurationKey(this.stationInfo.amperageLimitationOcppKey)
    ) {
      this.addConfigurationKey(
        this.stationInfo.amperageLimitationOcppKey,
        (this.stationInfo.maximumAmperage * this.getAmperageLimitationUnitDivider()).toString()
      );
    }
    if (!this.getConfigurationKey(StandardParametersKey.SupportedFeatureProfiles)) {
      this.addConfigurationKey(
        StandardParametersKey.SupportedFeatureProfiles,
        `${SupportedFeatureProfiles.Core},${SupportedFeatureProfiles.Local_Auth_List_Management},${SupportedFeatureProfiles.Smart_Charging}`
      );
    }
    this.addConfigurationKey(
      StandardParametersKey.NumberOfConnectors,
      this.getNumberOfConnectors().toString(),
      { readonly: true },
      { overwrite: true }
    );
    if (!this.getConfigurationKey(StandardParametersKey.MeterValuesSampledData)) {
      this.addConfigurationKey(
        StandardParametersKey.MeterValuesSampledData,
        MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      );
    }
    if (!this.getConfigurationKey(StandardParametersKey.ConnectorPhaseRotation)) {
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
      this.addConfigurationKey(
        StandardParametersKey.ConnectorPhaseRotation,
        connectorPhaseRotation.toString()
      );
    }
    if (!this.getConfigurationKey(StandardParametersKey.AuthorizeRemoteTxRequests)) {
      this.addConfigurationKey(StandardParametersKey.AuthorizeRemoteTxRequests, 'true');
    }
    if (
      !this.getConfigurationKey(StandardParametersKey.LocalAuthListEnabled) &&
      this.getConfigurationKey(StandardParametersKey.SupportedFeatureProfiles).value.includes(
        SupportedFeatureProfiles.Local_Auth_List_Management
      )
    ) {
      this.addConfigurationKey(StandardParametersKey.LocalAuthListEnabled, 'false');
    }
    if (!this.getConfigurationKey(StandardParametersKey.ConnectionTimeOut)) {
      this.addConfigurationKey(
        StandardParametersKey.ConnectionTimeOut,
        Constants.DEFAULT_CONNECTION_TIMEOUT.toString()
      );
    }
    this.saveOcppConfiguration();
  }

  private getConfigurationFromFile(): ChargingStationConfiguration | null {
    let configuration: ChargingStationConfiguration = null;
    if (this.configurationFile && fs.existsSync(this.configurationFile)) {
      try {
        const measureId = `${FileType.ChargingStationConfiguration} read`;
        const beginId = PerformanceStatistics.beginMeasure(
          `${FileType.ChargingStationConfiguration} read`
        );
        configuration = JSON.parse(
          fs.readFileSync(this.configurationFile, 'utf8')
        ) as ChargingStationConfiguration;
        PerformanceStatistics.endMeasure(measureId, beginId);
      } catch (error) {
        FileUtils.handleFileException(
          this.logPrefix(),
          FileType.ChargingStationConfiguration,
          this.configurationFile,
          error as NodeJS.ErrnoException
        );
      }
    }
    return configuration;
  }

  private saveConfiguration(section?: Section): void {
    if (this.configurationFile) {
      try {
        const configurationData: ChargingStationConfiguration =
          this.getConfigurationFromFile() ?? {};
        if (!fs.existsSync(path.dirname(this.configurationFile))) {
          fs.mkdirSync(path.dirname(this.configurationFile), { recursive: true });
        }
        switch (section) {
          case Section.ocppConfiguration:
            configurationData.configurationKey = this.ocppConfiguration.configurationKey;
            break;
          case Section.stationInfo:
            configurationData.stationInfo = this.stationInfo;
            break;
          default:
            configurationData.configurationKey = this.ocppConfiguration.configurationKey;
            configurationData.stationInfo = this.stationInfo;
            break;
        }
        const measureId = `${FileType.ChargingStationConfiguration} write`;
        const beginId = PerformanceStatistics.beginMeasure(measureId);
        const fileDescriptor = fs.openSync(this.configurationFile, 'w');
        fs.writeFileSync(fileDescriptor, JSON.stringify(configurationData, null, 2), 'utf8');
        fs.closeSync(fileDescriptor);
        PerformanceStatistics.endMeasure(measureId, beginId);
      } catch (error) {
        FileUtils.handleFileException(
          this.logPrefix(),
          FileType.ChargingStationConfiguration,
          this.configurationFile,
          error as NodeJS.ErrnoException
        );
      }
    } else {
      logger.error(
        `${this.logPrefix()} Trying to save charging station configuration to undefined file`
      );
    }
  }

  private getOcppConfigurationFromTemplate(): ChargingStationOcppConfiguration {
    return this.getTemplateFromFile().Configuration ?? ({} as ChargingStationOcppConfiguration);
  }

  private getOcppConfigurationFromFile(): ChargingStationOcppConfiguration | null {
    let configuration: ChargingStationConfiguration = null;
    if (this.getOcppPersistentConfiguration()) {
      const configurationFromFile = this.getConfigurationFromFile();
      configuration = configurationFromFile?.configurationKey && configurationFromFile;
    }
    configuration && delete configuration.stationInfo;
    return configuration;
  }

  private getOcppConfiguration(): ChargingStationOcppConfiguration {
    let ocppConfiguration: ChargingStationOcppConfiguration = this.getOcppConfigurationFromFile();
    if (!ocppConfiguration) {
      ocppConfiguration = this.getOcppConfigurationFromTemplate();
    }
    return ocppConfiguration;
  }

  private saveOcppConfiguration(): void {
    if (this.getOcppPersistentConfiguration()) {
      this.saveConfiguration(Section.ocppConfiguration);
    }
  }

  private async onOpen(): Promise<void> {
    logger.info(
      `${this.logPrefix()} Connected to OCPP server through ${this.wsConnectionUrl.toString()}`
    );
    if (!this.isInAcceptedState()) {
      // Send BootNotification
      let registrationRetryCount = 0;
      do {
        this.bootNotificationResponse =
          await this.ocppRequestService.sendMessageHandler<BootNotificationResponse>(
            RequestCommand.BOOT_NOTIFICATION,
            {
              chargePointModel: this.bootNotificationRequest.chargePointModel,
              chargePointVendor: this.bootNotificationRequest.chargePointVendor,
              chargeBoxSerialNumber: this.bootNotificationRequest.chargeBoxSerialNumber,
              firmwareVersion: this.bootNotificationRequest.firmwareVersion,
              chargePointSerialNumber: this.bootNotificationRequest.chargePointSerialNumber,
              iccid: this.bootNotificationRequest.iccid,
              imsi: this.bootNotificationRequest.imsi,
              meterSerialNumber: this.bootNotificationRequest.meterSerialNumber,
              meterType: this.bootNotificationRequest.meterType,
            },
            { skipBufferingOnError: true }
          );
        if (!this.isInAcceptedState()) {
          this.getRegistrationMaxRetries() !== -1 && registrationRetryCount++;
          await Utils.sleep(
            this.bootNotificationResponse?.interval
              ? this.bootNotificationResponse.interval * 1000
              : Constants.OCPP_DEFAULT_BOOT_NOTIFICATION_INTERVAL
          );
        }
      } while (
        !this.isInAcceptedState() &&
        (registrationRetryCount <= this.getRegistrationMaxRetries() ||
          this.getRegistrationMaxRetries() === -1)
      );
    }
    if (this.isInAcceptedState()) {
      await this.startMessageSequence();
      this.stopped && (this.stopped = false);
      if (this.wsConnectionRestarted && this.isWebSocketConnectionOpened()) {
        this.flushMessageBuffer();
      }
    } else {
      logger.error(
        `${this.logPrefix()} Registration failure: max retries reached (${this.getRegistrationMaxRetries()}) or retry disabled (${this.getRegistrationMaxRetries()})`
      );
    }
    this.autoReconnectRetryCount = 0;
    this.wsConnectionRestarted = false;
  }

  private async onClose(code: number, reason: string): Promise<void> {
    switch (code) {
      // Normal close
      case WebSocketCloseEventStatusCode.CLOSE_NORMAL:
      case WebSocketCloseEventStatusCode.CLOSE_NO_STATUS:
        logger.info(
          `${this.logPrefix()} WebSocket normally closed with status '${Utils.getWebSocketCloseEventStatusString(
            code
          )}' and reason '${reason}'`
        );
        this.autoReconnectRetryCount = 0;
        break;
      // Abnormal close
      default:
        logger.error(
          `${this.logPrefix()} WebSocket abnormally closed with status '${Utils.getWebSocketCloseEventStatusString(
            code
          )}' and reason '${reason}'`
        );
        await this.reconnect(code);
        break;
    }
  }

  private async onMessage(data: Data): Promise<void> {
    let [messageType, messageId, commandName, commandPayload, errorDetails]: IncomingRequest = [
      0,
      '',
      '' as IncomingRequestCommand,
      {},
      {},
    ];
    let responseCallback: (
      payload: JsonType | string,
      requestPayload: JsonType | OCPPError
    ) => void;
    let rejectCallback: (error: OCPPError, requestStatistic?: boolean) => void;
    let requestCommandName: RequestCommand | IncomingRequestCommand;
    let requestPayload: JsonType | OCPPError;
    let cachedRequest: CachedRequest;
    let errMsg: string;
    try {
      const request = JSON.parse(data.toString()) as IncomingRequest;
      if (Utils.isIterable(request)) {
        // Parse the message
        [messageType, messageId, commandName, commandPayload, errorDetails] = request;
      } else {
        throw new OCPPError(
          ErrorType.PROTOCOL_ERROR,
          'Incoming request is not iterable',
          commandName
        );
      }
      // Check the Type of message
      switch (messageType) {
        // Incoming Message
        case MessageType.CALL_MESSAGE:
          if (this.getEnableStatistics()) {
            this.performanceStatistics.addRequestStatistic(commandName, messageType);
          }
          // Process the call
          await this.ocppIncomingRequestService.handleRequest(
            messageId,
            commandName,
            commandPayload
          );
          break;
        // Outcome Message
        case MessageType.CALL_RESULT_MESSAGE:
          // Respond
          cachedRequest = this.requests.get(messageId);
          if (Utils.isIterable(cachedRequest)) {
            [responseCallback, , , requestPayload] = cachedRequest;
          } else {
            throw new OCPPError(
              ErrorType.PROTOCOL_ERROR,
              `Cached request for message id ${messageId} response is not iterable`,
              commandName
            );
          }
          if (!responseCallback) {
            // Error
            throw new OCPPError(
              ErrorType.INTERNAL_ERROR,
              `Response for unknown message id ${messageId}`,
              commandName
            );
          }
          responseCallback(commandName, requestPayload);
          break;
        // Error Message
        case MessageType.CALL_ERROR_MESSAGE:
          cachedRequest = this.requests.get(messageId);
          if (Utils.isIterable(cachedRequest)) {
            [, rejectCallback, requestCommandName] = cachedRequest;
          } else {
            throw new OCPPError(
              ErrorType.PROTOCOL_ERROR,
              `Cached request for message id ${messageId} error response is not iterable`
            );
          }
          if (!rejectCallback) {
            // Error
            throw new OCPPError(
              ErrorType.INTERNAL_ERROR,
              `Error response for unknown message id ${messageId}`,
              requestCommandName
            );
          }
          rejectCallback(
            new OCPPError(commandName, commandPayload.toString(), requestCommandName, errorDetails)
          );
          break;
        // Error
        default:
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          errMsg = `${this.logPrefix()} Wrong message type ${messageType}`;
          logger.error(errMsg);
          throw new OCPPError(ErrorType.PROTOCOL_ERROR, errMsg);
      }
    } catch (error) {
      // Log
      logger.error(
        '%s Incoming OCPP message %j matching cached request %j processing error %j',
        this.logPrefix(),
        data.toString(),
        this.requests.get(messageId),
        error
      );
      // Send error
      messageType === MessageType.CALL_MESSAGE &&
        (await this.ocppRequestService.sendError(messageId, error as OCPPError, commandName));
    }
  }

  private onPing(): void {
    logger.debug(this.logPrefix() + ' Received a WS ping (rfc6455) from the server');
  }

  private onPong(): void {
    logger.debug(this.logPrefix() + ' Received a WS pong (rfc6455) from the server');
  }

  private onError(error: WSError): void {
    logger.error(this.logPrefix() + ' WebSocket error: %j', error);
  }

  private getAuthorizationFile(): string | undefined {
    return (
      this.stationInfo.authorizationFile &&
      path.join(
        path.resolve(__dirname, '../'),
        'assets',
        path.basename(this.stationInfo.authorizationFile)
      )
    );
  }

  private getAuthorizedTags(): string[] {
    let authorizedTags: string[] = [];
    const authorizationFile = this.getAuthorizationFile();
    if (authorizationFile) {
      try {
        // Load authorization file
        authorizedTags = JSON.parse(fs.readFileSync(authorizationFile, 'utf8')) as string[];
      } catch (error) {
        FileUtils.handleFileException(
          this.logPrefix(),
          FileType.Authorization,
          authorizationFile,
          error as NodeJS.ErrnoException
        );
      }
    } else {
      logger.info(
        this.logPrefix() + ' No authorization file given in template file ' + this.templateFile
      );
    }
    return authorizedTags;
  }

  private getUseConnectorId0(): boolean | undefined {
    return !Utils.isUndefined(this.stationInfo.useConnectorId0)
      ? this.stationInfo.useConnectorId0
      : true;
  }

  private getNumberOfRunningTransactions(): number {
    let trxCount = 0;
    for (const connectorId of this.connectors.keys()) {
      if (connectorId > 0 && this.getConnectorStatus(connectorId)?.transactionStarted) {
        trxCount++;
      }
    }
    return trxCount;
  }

  // 0 for disabling
  private getConnectionTimeout(): number | undefined {
    if (this.getConfigurationKey(StandardParametersKey.ConnectionTimeOut)) {
      return (
        parseInt(this.getConfigurationKey(StandardParametersKey.ConnectionTimeOut).value) ??
        Constants.DEFAULT_CONNECTION_TIMEOUT
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
    if (this.stationInfo.powerSharedByConnectors) {
      powerDivider = this.getNumberOfRunningTransactions();
    }
    return powerDivider;
  }

  private getTemplateMaxNumberOfConnectors(): number {
    return Object.keys(this.stationInfo.Connectors).length;
  }

  private getMaxNumberOfConnectors(): number {
    let maxConnectors: number;
    if (!Utils.isEmptyArray(this.stationInfo.numberOfConnectors)) {
      const numberOfConnectors = this.stationInfo.numberOfConnectors as number[];
      // Distribute evenly the number of connectors
      maxConnectors = numberOfConnectors[(this.index - 1) % numberOfConnectors.length];
    } else if (!Utils.isUndefined(this.stationInfo.numberOfConnectors)) {
      maxConnectors = this.stationInfo.numberOfConnectors as number;
    } else {
      maxConnectors = this.stationInfo.Connectors[0]
        ? this.getTemplateMaxNumberOfConnectors() - 1
        : this.getTemplateMaxNumberOfConnectors();
    }
    return maxConnectors;
  }

  private getMaximumAmperage(): number | undefined {
    const maximumPower = (this.stationInfo['maxPower'] as number) ?? this.stationInfo.maximumPower;
    switch (this.getCurrentOutType()) {
      case CurrentType.AC:
        return ACElectricUtils.amperagePerPhaseFromPower(
          this.getNumberOfPhases(),
          maximumPower / this.getNumberOfConnectors(),
          this.getVoltageOut()
        );
      case CurrentType.DC:
        return DCElectricUtils.amperage(maximumPower, this.getVoltageOut());
    }
  }

  private getAmperageLimitationUnitDivider(): number {
    let unitDivider = 1;
    switch (this.stationInfo.amperageLimitationUnit) {
      case AmpereUnits.DECI_AMPERE:
        unitDivider = 10;
        break;
      case AmpereUnits.CENTI_AMPERE:
        unitDivider = 100;
        break;
      case AmpereUnits.MILLI_AMPERE:
        unitDivider = 1000;
        break;
    }
    return unitDivider;
  }

  private getAmperageLimitation(): number | undefined {
    if (
      this.stationInfo.amperageLimitationOcppKey &&
      this.getConfigurationKey(this.stationInfo.amperageLimitationOcppKey)
    ) {
      return (
        Utils.convertToInt(
          this.getConfigurationKey(this.stationInfo.amperageLimitationOcppKey).value
        ) / this.getAmperageLimitationUnitDivider()
      );
    }
  }

  private async startMessageSequence(): Promise<void> {
    if (this.stationInfo.autoRegister) {
      await this.ocppRequestService.sendMessageHandler<BootNotificationResponse>(
        RequestCommand.BOOT_NOTIFICATION,
        {
          chargePointModel: this.bootNotificationRequest.chargePointModel,
          chargePointVendor: this.bootNotificationRequest.chargePointVendor,
          chargeBoxSerialNumber: this.bootNotificationRequest.chargeBoxSerialNumber,
          firmwareVersion: this.bootNotificationRequest.firmwareVersion,
          chargePointSerialNumber: this.bootNotificationRequest.chargePointSerialNumber,
          iccid: this.bootNotificationRequest.iccid,
          imsi: this.bootNotificationRequest.imsi,
          meterSerialNumber: this.bootNotificationRequest.meterSerialNumber,
          meterType: this.bootNotificationRequest.meterType,
        },
        { skipBufferingOnError: true }
      );
    }
    // Start WebSocket ping
    this.startWebSocketPing();
    // Start heartbeat
    this.startHeartbeat();
    // Initialize connectors status
    for (const connectorId of this.connectors.keys()) {
      if (connectorId === 0) {
        continue;
      } else if (
        !this.stopped &&
        !this.getConnectorStatus(connectorId)?.status &&
        this.getConnectorStatus(connectorId)?.bootStatus
      ) {
        // Send status in template at startup
        await this.ocppRequestService.sendMessageHandler<StatusNotificationResponse>(
          RequestCommand.STATUS_NOTIFICATION,
          {
            connectorId,
            status: this.getConnectorStatus(connectorId).bootStatus,
            errorCode: ChargePointErrorCode.NO_ERROR,
          }
        );
        this.getConnectorStatus(connectorId).status =
          this.getConnectorStatus(connectorId).bootStatus;
      } else if (
        this.stopped &&
        this.getConnectorStatus(connectorId)?.status &&
        this.getConnectorStatus(connectorId)?.bootStatus
      ) {
        // Send status in template after reset
        await this.ocppRequestService.sendMessageHandler<StatusNotificationResponse>(
          RequestCommand.STATUS_NOTIFICATION,
          {
            connectorId,
            status: this.getConnectorStatus(connectorId).bootStatus,
            errorCode: ChargePointErrorCode.NO_ERROR,
          }
        );
        this.getConnectorStatus(connectorId).status =
          this.getConnectorStatus(connectorId).bootStatus;
      } else if (!this.stopped && this.getConnectorStatus(connectorId)?.status) {
        // Send previous status at template reload
        await this.ocppRequestService.sendMessageHandler<StatusNotificationResponse>(
          RequestCommand.STATUS_NOTIFICATION,
          {
            connectorId,
            status: this.getConnectorStatus(connectorId).status,
            errorCode: ChargePointErrorCode.NO_ERROR,
          }
        );
      } else {
        // Send default status
        await this.ocppRequestService.sendMessageHandler<StatusNotificationResponse>(
          RequestCommand.STATUS_NOTIFICATION,
          {
            connectorId,
            status: ChargePointStatus.AVAILABLE,
            errorCode: ChargePointErrorCode.NO_ERROR,
          }
        );
        this.getConnectorStatus(connectorId).status = ChargePointStatus.AVAILABLE;
      }
    }
    // Start the ATG
    this.startAutomaticTransactionGenerator();
  }

  private startAutomaticTransactionGenerator() {
    if (this.stationInfo.AutomaticTransactionGenerator.enable) {
      if (!this.automaticTransactionGenerator) {
        this.automaticTransactionGenerator = AutomaticTransactionGenerator.getInstance(this);
      }
      if (!this.automaticTransactionGenerator.started) {
        this.automaticTransactionGenerator.start();
      }
    }
  }

  private async stopMessageSequence(
    reason: StopTransactionReason = StopTransactionReason.NONE
  ): Promise<void> {
    // Stop WebSocket ping
    this.stopWebSocketPing();
    // Stop heartbeat
    this.stopHeartbeat();
    // Stop the ATG
    if (
      this.stationInfo.AutomaticTransactionGenerator.enable &&
      this.automaticTransactionGenerator?.started
    ) {
      this.automaticTransactionGenerator.stop();
    } else {
      for (const connectorId of this.connectors.keys()) {
        if (connectorId > 0 && this.getConnectorStatus(connectorId)?.transactionStarted) {
          const transactionId = this.getConnectorStatus(connectorId).transactionId;
          if (
            this.getBeginEndMeterValues() &&
            this.getOcppStrictCompliance() &&
            !this.getOutOfOrderEndMeterValues()
          ) {
            // FIXME: Implement OCPP version agnostic helpers
            const transactionEndMeterValue = OCPP16ServiceUtils.buildTransactionEndMeterValue(
              this,
              connectorId,
              this.getEnergyActiveImportRegisterByTransactionId(transactionId)
            );
            await this.ocppRequestService.sendMessageHandler<MeterValuesResponse>(
              RequestCommand.METER_VALUES,
              {
                connectorId,
                transactionId,
                meterValue: transactionEndMeterValue,
              }
            );
          }
          await this.ocppRequestService.sendMessageHandler<StopTransactionResponse>(
            RequestCommand.STOP_TRANSACTION,
            {
              transactionId,
              meterStop: this.getEnergyActiveImportRegisterByTransactionId(transactionId),
              idTag: this.getTransactionIdTag(transactionId),
              reason,
            }
          );
        }
      }
    }
  }

  private startWebSocketPing(): void {
    const webSocketPingInterval: number = this.getConfigurationKey(
      StandardParametersKey.WebSocketPingInterval
    )
      ? Utils.convertToInt(
          this.getConfigurationKey(StandardParametersKey.WebSocketPingInterval).value
        )
      : 0;
    if (webSocketPingInterval > 0 && !this.webSocketPingSetInterval) {
      this.webSocketPingSetInterval = setInterval(() => {
        if (this.isWebSocketConnectionOpened()) {
          this.wsConnection.ping((): void => {
            /* This is intentional */
          });
        }
      }, webSocketPingInterval * 1000);
      logger.info(
        this.logPrefix() +
          ' WebSocket ping started every ' +
          Utils.formatDurationSeconds(webSocketPingInterval)
      );
    } else if (this.webSocketPingSetInterval) {
      logger.info(
        this.logPrefix() +
          ' WebSocket ping every ' +
          Utils.formatDurationSeconds(webSocketPingInterval) +
          ' already started'
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

  private warnDeprecatedTemplateKey(
    template: ChargingStationTemplate,
    key: string,
    chargingStationId: string,
    logMsgToAppend = ''
  ): void {
    if (!Utils.isUndefined(template[key])) {
      const logPrefixStr = ` ${chargingStationId} |`;
      logger.warn(
        `${Utils.logPrefix(logPrefixStr)} Deprecated template key '${key}' usage in file '${
          this.templateFile
        }'${logMsgToAppend && '. ' + logMsgToAppend}`
      );
    }
  }

  private convertDeprecatedTemplateKey(
    template: ChargingStationTemplate,
    deprecatedKey: string,
    key: string
  ): void {
    if (!Utils.isUndefined(template[deprecatedKey])) {
      template[key] = template[deprecatedKey] as unknown;
      delete template[deprecatedKey];
    }
  }

  private getConfiguredSupervisionUrl(): URL {
    const supervisionUrls = Utils.cloneObject<string | string[]>(
      this.stationInfo.supervisionUrls ?? Configuration.getSupervisionUrls()
    );
    if (!Utils.isEmptyArray(supervisionUrls)) {
      let urlIndex = 0;
      switch (Configuration.getSupervisionUrlDistribution()) {
        case SupervisionUrlDistribution.ROUND_ROBIN:
          urlIndex = (this.index - 1) % supervisionUrls.length;
          break;
        case SupervisionUrlDistribution.RANDOM:
          // Get a random url
          urlIndex = Math.floor(Utils.secureRandom() * supervisionUrls.length);
          break;
        case SupervisionUrlDistribution.SEQUENTIAL:
          if (this.index <= supervisionUrls.length) {
            urlIndex = this.index - 1;
          } else {
            logger.warn(
              `${this.logPrefix()} No more configured supervision urls available, using the first one`
            );
          }
          break;
        default:
          logger.error(
            `${this.logPrefix()} Unknown supervision url distribution '${Configuration.getSupervisionUrlDistribution()}' from values '${SupervisionUrlDistribution.toString()}', defaulting to ${
              SupervisionUrlDistribution.ROUND_ROBIN
            }`
          );
          urlIndex = (this.index - 1) % supervisionUrls.length;
          break;
      }
      return new URL(supervisionUrls[urlIndex]);
    }
    return new URL(supervisionUrls as string);
  }

  private getHeartbeatInterval(): number | undefined {
    const HeartbeatInterval = this.getConfigurationKey(StandardParametersKey.HeartbeatInterval);
    if (HeartbeatInterval) {
      return Utils.convertToInt(HeartbeatInterval.value) * 1000;
    }
    const HeartBeatInterval = this.getConfigurationKey(StandardParametersKey.HeartBeatInterval);
    if (HeartBeatInterval) {
      return Utils.convertToInt(HeartBeatInterval.value) * 1000;
    }
    !this.stationInfo.autoRegister &&
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

  private openWSConnection(
    options: WsOptions = this.stationInfo.wsOptions,
    forceCloseOpened = false
  ): void {
    options.handshakeTimeout = options?.handshakeTimeout ?? this.getConnectionTimeout() * 1000;
    if (
      !Utils.isNullOrUndefined(this.stationInfo.supervisionUser) &&
      !Utils.isNullOrUndefined(this.stationInfo.supervisionPassword)
    ) {
      options.auth = `${this.stationInfo.supervisionUser}:${this.stationInfo.supervisionPassword}`;
    }
    if (this.isWebSocketConnectionOpened() && forceCloseOpened) {
      this.wsConnection.close();
    }
    let protocol: string;
    switch (this.getOcppVersion()) {
      case OCPPVersion.VERSION_16:
        protocol = 'ocpp' + OCPPVersion.VERSION_16;
        break;
      default:
        this.handleUnsupportedVersion(this.getOcppVersion());
        break;
    }
    this.wsConnection = new WebSocket(this.wsConnectionUrl, protocol, options);
    logger.info(
      this.logPrefix() + ' Open OCPP connection to URL ' + this.wsConnectionUrl.toString()
    );
  }

  private stopMeterValues(connectorId: number) {
    if (this.getConnectorStatus(connectorId)?.transactionSetInterval) {
      clearInterval(this.getConnectorStatus(connectorId).transactionSetInterval);
    }
  }

  private getReconnectExponentialDelay(): boolean | undefined {
    return !Utils.isUndefined(this.stationInfo.reconnectExponentialDelay)
      ? this.stationInfo.reconnectExponentialDelay
      : false;
  }

  private async reconnect(code: number): Promise<void> {
    // Stop WebSocket ping
    this.stopWebSocketPing();
    // Stop heartbeat
    this.stopHeartbeat();
    // Stop the ATG if needed
    if (
      this.stationInfo.AutomaticTransactionGenerator.enable &&
      this.stationInfo.AutomaticTransactionGenerator.stopOnConnectionFailure &&
      this.automaticTransactionGenerator?.started
    ) {
      this.automaticTransactionGenerator.stop();
    }
    if (
      this.autoReconnectRetryCount < this.getAutoReconnectMaxRetries() ||
      this.getAutoReconnectMaxRetries() === -1
    ) {
      this.autoReconnectRetryCount++;
      const reconnectDelay = this.getReconnectExponentialDelay()
        ? Utils.exponentialDelay(this.autoReconnectRetryCount)
        : this.getConnectionTimeout() * 1000;
      const reconnectTimeout = reconnectDelay - 100 > 0 && reconnectDelay;
      logger.error(
        `${this.logPrefix()} WebSocket: connection retry in ${Utils.roundTo(
          reconnectDelay,
          2
        )}ms, timeout ${reconnectTimeout}ms`
      );
      await Utils.sleep(reconnectDelay);
      logger.error(
        this.logPrefix() +
          ' WebSocket: reconnecting try #' +
          this.autoReconnectRetryCount.toString()
      );
      this.openWSConnection(
        { ...this.stationInfo.wsOptions, handshakeTimeout: reconnectTimeout },
        true
      );
      this.wsConnectionRestarted = true;
    } else if (this.getAutoReconnectMaxRetries() !== -1) {
      logger.error(
        `${this.logPrefix()} WebSocket reconnect failure: maximum retries reached (${
          this.autoReconnectRetryCount
        }) or retry disabled (${this.getAutoReconnectMaxRetries()})`
      );
    }
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
