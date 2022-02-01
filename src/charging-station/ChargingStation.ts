// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import { AvailabilityType, BootNotificationRequest, CachedRequest, IncomingRequest, IncomingRequestCommand, RequestCommand } from '../types/ocpp/Requests';
import { BootNotificationResponse, RegistrationStatus } from '../types/ocpp/Responses';
import ChargingStationConfiguration, { ConfigurationKey } from '../types/ChargingStationConfiguration';
import ChargingStationTemplate, { CurrentType, PowerUnits, Voltage } from '../types/ChargingStationTemplate';
import { ConnectorPhaseRotation, StandardParametersKey, SupportedFeatureProfiles, VendorDefaultParametersKey } from '../types/ocpp/Configuration';
import { MeterValueMeasurand, MeterValuePhase } from '../types/ocpp/MeterValues';
import { WSError, WebSocketCloseEventStatusCode } from '../types/WebSocket';
import WebSocket, { ClientOptions, Data, OPEN } from 'ws';

import AutomaticTransactionGenerator from './AutomaticTransactionGenerator';
import { ChargePointStatus } from '../types/ocpp/ChargePointStatus';
import { ChargingProfile } from '../types/ocpp/ChargingProfile';
import ChargingStationInfo from '../types/ChargingStationInfo';
import { ChargingStationWorkerMessageEvents } from '../types/ChargingStationWorker';
import { ClientRequestArgs } from 'http';
import Configuration from '../utils/Configuration';
import { ConnectorStatus } from '../types/ConnectorStatus';
import Constants from '../utils/Constants';
import { ErrorType } from '../types/ocpp/ErrorType';
import FileUtils from '../utils/FileUtils';
import { MessageType } from '../types/ocpp/MessageType';
import OCPP16IncomingRequestService from './ocpp/1.6/OCPP16IncomingRequestService';
import OCPP16RequestService from './ocpp/1.6/OCPP16RequestService';
import OCPP16ResponseService from './ocpp/1.6/OCPP16ResponseService';
import OCPPError from '../exception/OCPPError';
import OCPPIncomingRequestService from './ocpp/OCPPIncomingRequestService';
import OCPPRequestService from './ocpp/OCPPRequestService';
import { OCPPVersion } from '../types/ocpp/OCPPVersion';
import PerformanceStatistics from '../performance/PerformanceStatistics';
import { SampledValueTemplate } from '../types/MeasurandPerPhaseSampledValueTemplates';
import { StopTransactionReason } from '../types/ocpp/Transaction';
import { SupervisionUrlDistribution } from '../types/ConfigurationData';
import { URL } from 'url';
import Utils from '../utils/Utils';
import crypto from 'crypto';
import fs from 'fs';
import logger from '../utils/Logger';
import { parentPort } from 'worker_threads';
import path from 'path';

export default class ChargingStation {
  public readonly stationTemplateFile: string;
  public authorizedTags: string[];
  public stationInfo!: ChargingStationInfo;
  public readonly connectors: Map<number, ConnectorStatus>;
  public configuration!: ChargingStationConfiguration;
  public wsConnection!: WebSocket;
  public readonly requests: Map<string, CachedRequest>;
  public performanceStatistics!: PerformanceStatistics;
  public heartbeatSetInterval!: NodeJS.Timeout;
  public ocppRequestService!: OCPPRequestService;
  private readonly index: number;
  private bootNotificationRequest!: BootNotificationRequest;
  private bootNotificationResponse!: BootNotificationResponse | null;
  private connectorsConfigurationHash!: string;
  private ocppIncomingRequestService!: OCPPIncomingRequestService;
  private readonly messageBuffer: Set<string>;
  private wsConfiguredConnectionUrl!: URL;
  private wsConnectionRestarted: boolean;
  private stopped: boolean;
  private autoReconnectRetryCount: number;
  private automaticTransactionGenerator!: AutomaticTransactionGenerator;
  private webSocketPingSetInterval!: NodeJS.Timeout;

  constructor(index: number, stationTemplateFile: string) {
    this.index = index;
    this.stationTemplateFile = stationTemplateFile;
    this.connectors = new Map<number, ConnectorStatus>();
    this.initialize();

    this.stopped = false;
    this.wsConnectionRestarted = false;
    this.autoReconnectRetryCount = 0;

    this.requests = new Map<string, CachedRequest>();
    this.messageBuffer = new Set<string>();

    this.authorizedTags = this.getAuthorizedTags();
  }

  get wsConnectionUrl(): URL {
    return this.getSupervisionUrlOcppConfiguration() ? new URL(this.getConfigurationKey(this.stationInfo.supervisionUrlOcppKey ?? VendorDefaultParametersKey.ConnectionUrl).value + '/' + this.stationInfo.chargingStationId) : this.wsConfiguredConnectionUrl;
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
    return !Utils.isUndefined(this.stationInfo.enableStatistics) ? this.stationInfo.enableStatistics : true;
  }

  public getMayAuthorizeAtRemoteStart(): boolean | undefined {
    return this.stationInfo.mayAuthorizeAtRemoteStart ?? true;
  }

  public getNumberOfPhases(): number | undefined {
    switch (this.getCurrentOutType()) {
      case CurrentType.AC:
        return !Utils.isUndefined(this.stationInfo.numberOfPhases) ? this.stationInfo.numberOfPhases : 3;
      case CurrentType.DC:
        return 0;
    }
  }

  public isWebSocketConnectionOpened(): boolean {
    return this?.wsConnection?.readyState === OPEN;
  }

  public isRegistered(): boolean {
    return this?.bootNotificationResponse?.status === RegistrationStatus.ACCEPTED;
  }

  public isChargingStationAvailable(): boolean {
    return this.getConnectorStatus(0).availability === AvailabilityType.OPERATIVE;
  }

  public isConnectorAvailable(id: number): boolean {
    return this.getConnectorStatus(id).availability === AvailabilityType.OPERATIVE;
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

  public getVoltageOut(): number | undefined {
    const errMsg = `${this.logPrefix()} Unknown ${this.getCurrentOutType()} currentOutType in template file ${this.stationTemplateFile}, cannot define default voltage out`;
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
    return !Utils.isUndefined(this.stationInfo.voltageOut) ? this.stationInfo.voltageOut : defaultVoltageOut;
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

  public getEnergyActiveImportRegisterByTransactionId(transactionId: number): number | undefined {
    if (this.getMeteringPerTransaction()) {
      for (const connectorId of this.connectors.keys()) {
        if (connectorId > 0 && this.getConnectorStatus(connectorId).transactionId === transactionId) {
          return this.getConnectorStatus(connectorId).transactionEnergyActiveImportRegisterValue;
        }
      }
    }
    for (const connectorId of this.connectors.keys()) {
      if (connectorId > 0 && this.getConnectorStatus(connectorId).transactionId === transactionId) {
        return this.getConnectorStatus(connectorId).energyActiveImportRegisterValue;
      }
    }
  }

  public getEnergyActiveImportRegisterByConnectorId(connectorId: number): number | undefined {
    if (this.getMeteringPerTransaction()) {
      return this.getConnectorStatus(connectorId).transactionEnergyActiveImportRegisterValue;
    }
    return this.getConnectorStatus(connectorId).energyActiveImportRegisterValue;
  }

  public getAuthorizeRemoteTxRequests(): boolean {
    const authorizeRemoteTxRequests = this.getConfigurationKey(StandardParametersKey.AuthorizeRemoteTxRequests);
    return authorizeRemoteTxRequests ? Utils.convertToBoolean(authorizeRemoteTxRequests.value) : false;
  }

  public getLocalAuthListEnabled(): boolean {
    const localAuthListEnabled = this.getConfigurationKey(StandardParametersKey.LocalAuthListEnabled);
    return localAuthListEnabled ? Utils.convertToBoolean(localAuthListEnabled.value) : false;
  }

  public restartWebSocketPing(): void {
    // Stop WebSocket ping
    this.stopWebSocketPing();
    // Start WebSocket ping
    this.startWebSocketPing();
  }

  public getSampledValueTemplate(connectorId: number, measurand: MeterValueMeasurand = MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
      phase?: MeterValuePhase): SampledValueTemplate | undefined {
    if (!Constants.SUPPORTED_MEASURANDS.includes(measurand)) {
      logger.warn(`${this.logPrefix()} Trying to get unsupported MeterValues measurand '${measurand}' ${phase ? `on phase ${phase} ` : ''}in template on connectorId ${connectorId}`);
      return;
    }
    if (measurand !== MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER && !this.getConfigurationKey(StandardParametersKey.MeterValuesSampledData).value.includes(measurand)) {
      logger.debug(`${this.logPrefix()} Trying to get MeterValues measurand '${measurand}' ${phase ? `on phase ${phase} ` : ''}in template on connectorId ${connectorId} not found in '${StandardParametersKey.MeterValuesSampledData}' OCPP parameter`);
      return;
    }
    const sampledValueTemplates: SampledValueTemplate[] = this.getConnectorStatus(connectorId).MeterValues;
    for (let index = 0; !Utils.isEmptyArray(sampledValueTemplates) && index < sampledValueTemplates.length; index++) {
      if (!Constants.SUPPORTED_MEASURANDS.includes(sampledValueTemplates[index]?.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER)) {
        logger.warn(`${this.logPrefix()} Unsupported MeterValues measurand '${measurand}' ${phase ? `on phase ${phase} ` : ''}in template on connectorId ${connectorId}`);
      } else if (phase && sampledValueTemplates[index]?.phase === phase && sampledValueTemplates[index]?.measurand === measurand
        && this.getConfigurationKey(StandardParametersKey.MeterValuesSampledData).value.includes(measurand)) {
        return sampledValueTemplates[index];
      } else if (!phase && !sampledValueTemplates[index].phase && sampledValueTemplates[index]?.measurand === measurand
        && this.getConfigurationKey(StandardParametersKey.MeterValuesSampledData).value.includes(measurand)) {
        return sampledValueTemplates[index];
      } else if (measurand === MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
        && (!sampledValueTemplates[index].measurand || sampledValueTemplates[index].measurand === measurand)) {
        return sampledValueTemplates[index];
      }
    }
    if (measurand === MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER) {
      const errorMsg = `${this.logPrefix()} Missing MeterValues for default measurand '${measurand}' in template on connectorId ${connectorId}`;
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }
    logger.debug(`${this.logPrefix()} No MeterValues for measurand '${measurand}' ${phase ? `on phase ${phase} ` : ''}in template on connectorId ${connectorId}`);
  }

  public getAutomaticTransactionGeneratorRequireAuthorize(): boolean {
    return this.stationInfo.AutomaticTransactionGenerator.requireAuthorize ?? true;
  }

  public startHeartbeat(): void {
    if (this.getHeartbeatInterval() && this.getHeartbeatInterval() > 0 && !this.heartbeatSetInterval) {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      this.heartbeatSetInterval = setInterval(async (): Promise<void> => {
        await this.ocppRequestService.sendHeartbeat();
      }, this.getHeartbeatInterval());
      logger.info(this.logPrefix() + ' Heartbeat started every ' + Utils.formatDurationMilliSeconds(this.getHeartbeatInterval()));
    } else if (this.heartbeatSetInterval) {
      logger.info(this.logPrefix() + ' Heartbeat already started every ' + Utils.formatDurationMilliSeconds(this.getHeartbeatInterval()));
    } else {
      logger.error(`${this.logPrefix()} Heartbeat interval set to ${this.getHeartbeatInterval() ? Utils.formatDurationMilliSeconds(this.getHeartbeatInterval()) : this.getHeartbeatInterval()}, not starting the heartbeat`);
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
      logger.error(`${this.logPrefix()} Trying to start MeterValues on connector Id ${connectorId.toString()}`);
      return;
    }
    if (!this.getConnectorStatus(connectorId)) {
      logger.error(`${this.logPrefix()} Trying to start MeterValues on non existing connector Id ${connectorId.toString()}`);
      return;
    }
    if (!this.getConnectorStatus(connectorId)?.transactionStarted) {
      logger.error(`${this.logPrefix()} Trying to start MeterValues on connector Id ${connectorId} with no transaction started`);
      return;
    } else if (this.getConnectorStatus(connectorId)?.transactionStarted && !this.getConnectorStatus(connectorId)?.transactionId) {
      logger.error(`${this.logPrefix()} Trying to start MeterValues on connector Id ${connectorId} with no transaction id`);
      return;
    }
    if (interval > 0) {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      this.getConnectorStatus(connectorId).transactionSetInterval = setInterval(async (): Promise<void> => {
        await this.ocppRequestService.sendMeterValues(connectorId, this.getConnectorStatus(connectorId).transactionId, interval);
      }, interval);
    } else {
      logger.error(`${this.logPrefix()} Charging station ${StandardParametersKey.MeterValueSampleInterval} configuration set to ${interval ? Utils.formatDurationMilliSeconds(interval) : interval}, not sending MeterValues`);
    }
  }

  public start(): void {
    if (this.getEnableStatistics()) {
      this.performanceStatistics.start();
    }
    this.openWSConnection();
    // Monitor authorization file
    this.startAuthorizationFileMonitoring();
    // Monitor station template file
    this.startStationTemplateFileMonitoring();
    // Handle WebSocket message
    this.wsConnection.on('message', this.onMessage.bind(this));
    // Handle WebSocket error
    this.wsConnection.on('error', this.onError.bind(this));
    // Handle WebSocket close
    this.wsConnection.on('close', this.onClose.bind(this));
    // Handle WebSocket open
    this.wsConnection.on('open', this.onOpen.bind(this));
    // Handle WebSocket ping
    this.wsConnection.on('ping', this.onPing.bind(this));
    // Handle WebSocket pong
    this.wsConnection.on('pong', this.onPong.bind(this));
    parentPort.postMessage({ id: ChargingStationWorkerMessageEvents.STARTED, data: { id: this.stationInfo.chargingStationId } });
  }

  public async stop(reason: StopTransactionReason = StopTransactionReason.NONE): Promise<void> {
    // Stop message sequence
    await this.stopMessageSequence(reason);
    for (const connectorId of this.connectors.keys()) {
      if (connectorId > 0) {
        await this.ocppRequestService.sendStatusNotification(connectorId, ChargePointStatus.UNAVAILABLE);
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
    parentPort.postMessage({ id: ChargingStationWorkerMessageEvents.STOPPED, data: { id: this.stationInfo.chargingStationId } });
    this.stopped = true;
  }

  public getConfigurationKey(key: string | StandardParametersKey, caseInsensitive = false): ConfigurationKey | undefined {
    return this.configuration.configurationKey.find((configElement) => {
      if (caseInsensitive) {
        return configElement.key.toLowerCase() === key.toLowerCase();
      }
      return configElement.key === key;
    });
  }

  public addConfigurationKey(key: string | StandardParametersKey, value: string, options: { readonly?: boolean, visible?: boolean, reboot?: boolean } = { readonly: false, visible: true, reboot: false }): void {
    const keyFound = this.getConfigurationKey(key);
    const readonly = options.readonly;
    const visible = options.visible;
    const reboot = options.reboot;
    if (!keyFound) {
      this.configuration.configurationKey.push({
        key,
        readonly,
        value,
        visible,
        reboot,
      });
    } else {
      logger.error(`${this.logPrefix()} Trying to add an already existing configuration key: %j`, keyFound);
    }
  }

  public setConfigurationKeyValue(key: string | StandardParametersKey, value: string): void {
    const keyFound = this.getConfigurationKey(key);
    if (keyFound) {
      const keyIndex = this.configuration.configurationKey.indexOf(keyFound);
      this.configuration.configurationKey[keyIndex].value = value;
    } else {
      logger.error(`${this.logPrefix()} Trying to set a value on a non existing configuration key: %j`, { key, value });
    }
  }

  public setChargingProfile(connectorId: number, cp: ChargingProfile): void {
    let cpReplaced = false;
    if (!Utils.isEmptyArray(this.getConnectorStatus(connectorId).chargingProfiles)) {
      this.getConnectorStatus(connectorId).chargingProfiles?.forEach((chargingProfile: ChargingProfile, index: number) => {
        if (chargingProfile.chargingProfileId === cp.chargingProfileId
          || (chargingProfile.stackLevel === cp.stackLevel && chargingProfile.chargingProfilePurpose === cp.chargingProfilePurpose)) {
          this.getConnectorStatus(connectorId).chargingProfiles[index] = cp;
          cpReplaced = true;
        }
      });
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

  private getChargingStationId(stationTemplate: ChargingStationTemplate): string {
    // In case of multiple instances: add instance index to charging station id
    const instanceIndex = process.env.CF_INSTANCE_INDEX ?? 0;
    const idSuffix = stationTemplate.nameSuffix ?? '';
    return stationTemplate.fixedName ? stationTemplate.baseName : stationTemplate.baseName + '-' + instanceIndex.toString() + ('000000000' + this.index.toString()).substr(('000000000' + this.index.toString()).length - 4) + idSuffix;
  }

  private buildStationInfo(): ChargingStationInfo {
    let stationTemplateFromFile: ChargingStationTemplate;
    try {
      // Load template file
      const fileDescriptor = fs.openSync(this.stationTemplateFile, 'r');
      stationTemplateFromFile = JSON.parse(fs.readFileSync(fileDescriptor, 'utf8')) as ChargingStationTemplate;
      fs.closeSync(fileDescriptor);
    } catch (error) {
      FileUtils.handleFileException(this.logPrefix(), 'Template', this.stationTemplateFile, error as NodeJS.ErrnoException);
    }
    const chargingStationId = this.getChargingStationId(stationTemplateFromFile);
    // Deprecation template keys section
    this.warnDeprecatedTemplateKey(stationTemplateFromFile, 'supervisionUrl', chargingStationId, 'Use \'supervisionUrls\' instead');
    this.convertDeprecatedTemplateKey(stationTemplateFromFile, 'supervisionUrl', 'supervisionUrls');
    const stationInfo: ChargingStationInfo = stationTemplateFromFile ?? {} as ChargingStationInfo;
    stationInfo.wsOptions = stationTemplateFromFile?.wsOptions ?? {};
    if (!Utils.isEmptyArray(stationTemplateFromFile.power)) {
      stationTemplateFromFile.power = stationTemplateFromFile.power as number[];
      const powerArrayRandomIndex = Math.floor(Utils.secureRandom() * stationTemplateFromFile.power.length);
      stationInfo.maxPower = stationTemplateFromFile.powerUnit === PowerUnits.KILO_WATT
        ? stationTemplateFromFile.power[powerArrayRandomIndex] * 1000
        : stationTemplateFromFile.power[powerArrayRandomIndex];
    } else {
      stationTemplateFromFile.power = stationTemplateFromFile.power as number;
      stationInfo.maxPower = stationTemplateFromFile.powerUnit === PowerUnits.KILO_WATT
        ? stationTemplateFromFile.power * 1000
        : stationTemplateFromFile.power;
    }
    delete stationInfo.power;
    delete stationInfo.powerUnit;
    stationInfo.chargingStationId = chargingStationId;
    stationInfo.resetTime = stationTemplateFromFile.resetTime ? stationTemplateFromFile.resetTime * 1000 : Constants.CHARGING_STATION_DEFAULT_RESET_TIME;
    return stationInfo;
  }

  private getOcppVersion(): OCPPVersion {
    return this.stationInfo.ocppVersion ? this.stationInfo.ocppVersion : OCPPVersion.VERSION_16;
  }

  private handleUnsupportedVersion(version: OCPPVersion) {
    const errMsg = `${this.logPrefix()} Unsupported protocol version '${version}' configured in template file ${this.stationTemplateFile}`;
    logger.error(errMsg);
    throw new Error(errMsg);
  }

  private initialize(): void {
    this.stationInfo = this.buildStationInfo();
    this.configuration = this.getTemplateChargingStationConfiguration();
    delete this.stationInfo.Configuration;
    this.bootNotificationRequest = {
      chargePointModel: this.stationInfo.chargePointModel,
      chargePointVendor: this.stationInfo.chargePointVendor,
      ...!Utils.isUndefined(this.stationInfo.chargeBoxSerialNumberPrefix) && { chargeBoxSerialNumber: this.stationInfo.chargeBoxSerialNumberPrefix },
      ...!Utils.isUndefined(this.stationInfo.firmwareVersion) && { firmwareVersion: this.stationInfo.firmwareVersion },
    };
    // Build connectors if needed
    const maxConnectors = this.getMaxNumberOfConnectors();
    if (maxConnectors <= 0) {
      logger.warn(`${this.logPrefix()} Charging station template ${this.stationTemplateFile} with ${maxConnectors} connectors`);
    }
    const templateMaxConnectors = this.getTemplateMaxNumberOfConnectors();
    if (templateMaxConnectors <= 0) {
      logger.warn(`${this.logPrefix()} Charging station template ${this.stationTemplateFile} with no connector configuration`);
    }
    if (!this.stationInfo.Connectors[0]) {
      logger.warn(`${this.logPrefix()} Charging station template ${this.stationTemplateFile} with no connector Id 0 configuration`);
    }
    // Sanity check
    if (maxConnectors > (this.stationInfo.Connectors[0] ? templateMaxConnectors - 1 : templateMaxConnectors) && !this.stationInfo.randomConnectors) {
      logger.warn(`${this.logPrefix()} Number of connectors exceeds the number of connector configurations in template ${this.stationTemplateFile}, forcing random connector configurations affectation`);
      this.stationInfo.randomConnectors = true;
    }
    const connectorsConfigHash = crypto.createHash('sha256').update(JSON.stringify(this.stationInfo.Connectors) + maxConnectors.toString()).digest('hex');
    const connectorsConfigChanged = this.connectors?.size !== 0 && this.connectorsConfigurationHash !== connectorsConfigHash;
    if (this.connectors?.size === 0 || connectorsConfigChanged) {
      connectorsConfigChanged && (this.connectors.clear());
      this.connectorsConfigurationHash = connectorsConfigHash;
      // Add connector Id 0
      let lastConnector = '0';
      for (lastConnector in this.stationInfo.Connectors) {
        const lastConnectorId = Utils.convertToInt(lastConnector);
        if (lastConnectorId === 0 && this.getUseConnectorId0() && this.stationInfo.Connectors[lastConnector]) {
          this.connectors.set(lastConnectorId, Utils.cloneObject<ConnectorStatus>(this.stationInfo.Connectors[lastConnector]));
          this.getConnectorStatus(lastConnectorId).availability = AvailabilityType.OPERATIVE;
          if (Utils.isUndefined(this.getConnectorStatus(lastConnectorId)?.chargingProfiles)) {
            this.getConnectorStatus(lastConnectorId).chargingProfiles = [];
          }
        }
      }
      // Generate all connectors
      if ((this.stationInfo.Connectors[0] ? templateMaxConnectors - 1 : templateMaxConnectors) > 0) {
        for (let index = 1; index <= maxConnectors; index++) {
          const randConnectorId = this.stationInfo.randomConnectors ? Utils.getRandomInteger(Utils.convertToInt(lastConnector), 1) : index;
          this.connectors.set(index, Utils.cloneObject<ConnectorStatus>(this.stationInfo.Connectors[randConnectorId]));
          this.getConnectorStatus(index).availability = AvailabilityType.OPERATIVE;
          if (Utils.isUndefined(this.getConnectorStatus(index)?.chargingProfiles)) {
            this.getConnectorStatus(index).chargingProfiles = [];
          }
        }
      }
    }
    // Avoid duplication of connectors related information
    delete this.stationInfo.Connectors;
    // Initialize transaction attributes on connectors
    for (const connectorId of this.connectors.keys()) {
      if (connectorId > 0 && !this.getConnectorStatus(connectorId)?.transactionStarted) {
        this.initializeConnectorStatus(connectorId);
      }
    }
    this.wsConfiguredConnectionUrl = new URL(this.getConfiguredSupervisionUrl().href + '/' + this.stationInfo.chargingStationId);
    switch (this.getOcppVersion()) {
      case OCPPVersion.VERSION_16:
        this.ocppIncomingRequestService = new OCPP16IncomingRequestService(this);
        this.ocppRequestService = new OCPP16RequestService(this, new OCPP16ResponseService(this));
        break;
      default:
        this.handleUnsupportedVersion(this.getOcppVersion());
        break;
    }
    // OCPP parameters
    this.initOcppParameters();
    if (this.stationInfo.autoRegister) {
      this.bootNotificationResponse = {
        currentTime: new Date().toISOString(),
        interval: this.getHeartbeatInterval() / 1000,
        status: RegistrationStatus.ACCEPTED
      };
    }
    this.stationInfo.powerDivider = this.getPowerDivider();
    if (this.getEnableStatistics()) {
      this.performanceStatistics = new PerformanceStatistics(this.stationInfo.chargingStationId, this.wsConnectionUrl);
    }
  }

  private initOcppParameters(): void {
    if (this.getSupervisionUrlOcppConfiguration() && !this.getConfigurationKey(this.stationInfo.supervisionUrlOcppKey ?? VendorDefaultParametersKey.ConnectionUrl)) {
      this.addConfigurationKey(VendorDefaultParametersKey.ConnectionUrl, this.getConfiguredSupervisionUrl().href, { reboot: true });
    }
    if (!this.getConfigurationKey(StandardParametersKey.SupportedFeatureProfiles)) {
      this.addConfigurationKey(StandardParametersKey.SupportedFeatureProfiles, `${SupportedFeatureProfiles.Core},${SupportedFeatureProfiles.Local_Auth_List_Management},${SupportedFeatureProfiles.Smart_Charging}`);
    }
    this.addConfigurationKey(StandardParametersKey.NumberOfConnectors, this.getNumberOfConnectors().toString(), { readonly: true });
    if (!this.getConfigurationKey(StandardParametersKey.MeterValuesSampledData)) {
      this.addConfigurationKey(StandardParametersKey.MeterValuesSampledData, MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER);
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
      this.addConfigurationKey(StandardParametersKey.ConnectorPhaseRotation, connectorPhaseRotation.toString());
    }
    if (!this.getConfigurationKey(StandardParametersKey.AuthorizeRemoteTxRequests)) {
      this.addConfigurationKey(StandardParametersKey.AuthorizeRemoteTxRequests, 'true');
    }
    if (!this.getConfigurationKey(StandardParametersKey.LocalAuthListEnabled)
      && this.getConfigurationKey(StandardParametersKey.SupportedFeatureProfiles).value.includes(SupportedFeatureProfiles.Local_Auth_List_Management)) {
      this.addConfigurationKey(StandardParametersKey.LocalAuthListEnabled, 'false');
    }
    if (!this.getConfigurationKey(StandardParametersKey.ConnectionTimeOut)) {
      this.addConfigurationKey(StandardParametersKey.ConnectionTimeOut, Constants.DEFAULT_CONNECTION_TIMEOUT.toString());
    }
  }

  private async onOpen(): Promise<void> {
    logger.info(`${this.logPrefix()} Connected to OCPP server through ${this.wsConnectionUrl.toString()}`);
    if (!this.isRegistered()) {
      // Send BootNotification
      let registrationRetryCount = 0;
      do {
        this.bootNotificationResponse = await this.ocppRequestService.sendBootNotification(this.bootNotificationRequest.chargePointModel,
          this.bootNotificationRequest.chargePointVendor, this.bootNotificationRequest.chargeBoxSerialNumber, this.bootNotificationRequest.firmwareVersion);
        if (!this.isRegistered()) {
          registrationRetryCount++;
          await Utils.sleep(this.bootNotificationResponse?.interval ? this.bootNotificationResponse.interval * 1000 : Constants.OCPP_DEFAULT_BOOT_NOTIFICATION_INTERVAL);
        }
      } while (!this.isRegistered() && (registrationRetryCount <= this.getRegistrationMaxRetries() || this.getRegistrationMaxRetries() === -1));
    }
    if (this.isRegistered() && this.stationInfo.autoRegister) {
      await this.ocppRequestService.sendBootNotification(this.bootNotificationRequest.chargePointModel,
        this.bootNotificationRequest.chargePointVendor, this.bootNotificationRequest.chargeBoxSerialNumber, this.bootNotificationRequest.firmwareVersion);
    }
    if (this.isRegistered()) {
      await this.startMessageSequence();
      this.stopped && (this.stopped = false);
      if (this.wsConnectionRestarted && this.isWebSocketConnectionOpened()) {
        this.flushMessageBuffer();
      }
    } else {
      logger.error(`${this.logPrefix()} Registration failure: max retries reached (${this.getRegistrationMaxRetries()}) or retry disabled (${this.getRegistrationMaxRetries()})`);
    }
    this.autoReconnectRetryCount = 0;
    this.wsConnectionRestarted = false;
  }

  private async onClose(code: number, reason: string): Promise<void> {
    switch (code) {
      // Normal close
      case WebSocketCloseEventStatusCode.CLOSE_NORMAL:
      case WebSocketCloseEventStatusCode.CLOSE_NO_STATUS:
        logger.info(`${this.logPrefix()} WebSocket normally closed with status '${Utils.getWebSocketCloseEventStatusString(code)}' and reason '${reason}'`);
        this.autoReconnectRetryCount = 0;
        break;
      // Abnormal close
      default:
        logger.error(`${this.logPrefix()} WebSocket abnormally closed with status '${Utils.getWebSocketCloseEventStatusString(code)}' and reason '${reason}'`);
        await this.reconnect(code);
        break;
    }
  }

  private async onMessage(data: Data): Promise<void> {
    let [messageType, messageId, commandName, commandPayload, errorDetails]: IncomingRequest = [0, '', '' as IncomingRequestCommand, {}, {}];
    let responseCallback: (payload: Record<string, unknown> | string, requestPayload: Record<string, unknown>) => void;
    let rejectCallback: (error: OCPPError, requestStatistic?: boolean) => void;
    let requestCommandName: RequestCommand | IncomingRequestCommand;
    let requestPayload: Record<string, unknown>;
    let cachedRequest: CachedRequest;
    let errMsg: string;
    try {
      const request = JSON.parse(data.toString()) as IncomingRequest;
      if (Utils.isIterable(request)) {
        // Parse the message
        [messageType, messageId, commandName, commandPayload, errorDetails] = request;
      } else {
        throw new OCPPError(ErrorType.PROTOCOL_ERROR, 'Incoming request is not iterable', commandName);
      }
      // Check the Type of message
      switch (messageType) {
        // Incoming Message
        case MessageType.CALL_MESSAGE:
          if (this.getEnableStatistics()) {
            this.performanceStatistics.addRequestStatistic(commandName, messageType);
          }
          // Process the call
          await this.ocppIncomingRequestService.handleRequest(messageId, commandName, commandPayload);
          break;
        // Outcome Message
        case MessageType.CALL_RESULT_MESSAGE:
          // Respond
          cachedRequest = this.requests.get(messageId);
          if (Utils.isIterable(cachedRequest)) {
            [responseCallback, , , requestPayload] = cachedRequest;
          } else {
            throw new OCPPError(ErrorType.PROTOCOL_ERROR, `Cached request for message id ${messageId} response is not iterable`, commandName);
          }
          if (!responseCallback) {
            // Error
            throw new OCPPError(ErrorType.INTERNAL_ERROR, `Response for unknown message id ${messageId}`, commandName);
          }
          responseCallback(commandName, requestPayload);
          break;
        // Error Message
        case MessageType.CALL_ERROR_MESSAGE:
          cachedRequest = this.requests.get(messageId);
          if (Utils.isIterable(cachedRequest)) {
            [, rejectCallback, requestCommandName] = cachedRequest;
          } else {
            throw new OCPPError(ErrorType.PROTOCOL_ERROR, `Cached request for message id ${messageId} error response is not iterable`);
          }
          if (!rejectCallback) {
            // Error
            throw new OCPPError(ErrorType.INTERNAL_ERROR, `Error response for unknown message id ${messageId}`, requestCommandName);
          }
          rejectCallback(new OCPPError(commandName, commandPayload.toString(), requestCommandName, errorDetails));
          break;
        // Error
        default:
          errMsg = `${this.logPrefix()} Wrong message type ${messageType}`;
          logger.error(errMsg);
          throw new OCPPError(ErrorType.PROTOCOL_ERROR, errMsg);
      }
    } catch (error) {
      // Log
      logger.error('%s Incoming OCPP message %j matching cached request %j processing error %j', this.logPrefix(), data.toString(), this.requests.get(messageId), error);
      // Send error
      messageType === MessageType.CALL_MESSAGE && await this.ocppRequestService.sendError(messageId, error as OCPPError, commandName);
    }
  }

  private onPing(): void {
    logger.debug(this.logPrefix() + ' Received a WS ping (rfc6455) from the server');
  }

  private onPong(): void {
    logger.debug(this.logPrefix() + ' Received a WS pong (rfc6455) from the server');
  }

  private async onError(error: WSError): Promise<void> {
    logger.error(this.logPrefix() + ' WebSocket error: %j', error);
    // switch (error.code) {
    //   case 'ECONNREFUSED':
    //     await this.reconnect(error);
    //     break;
    // }
  }

  private getTemplateChargingStationConfiguration(): ChargingStationConfiguration {
    return this.stationInfo.Configuration ?? {} as ChargingStationConfiguration;
  }

  private getAuthorizationFile(): string | undefined {
    return this.stationInfo.authorizationFile && path.join(path.resolve(__dirname, '../'), 'assets', path.basename(this.stationInfo.authorizationFile));
  }

  private getAuthorizedTags(): string[] {
    let authorizedTags: string[] = [];
    const authorizationFile = this.getAuthorizationFile();
    if (authorizationFile) {
      try {
        // Load authorization file
        const fileDescriptor = fs.openSync(authorizationFile, 'r');
        authorizedTags = JSON.parse(fs.readFileSync(fileDescriptor, 'utf8')) as string[];
        fs.closeSync(fileDescriptor);
      } catch (error) {
        FileUtils.handleFileException(this.logPrefix(), 'Authorization', authorizationFile, error as NodeJS.ErrnoException);
      }
    } else {
      logger.info(this.logPrefix() + ' No authorization file given in template file ' + this.stationTemplateFile);
    }
    return authorizedTags;
  }

  private getUseConnectorId0(): boolean | undefined {
    return !Utils.isUndefined(this.stationInfo.useConnectorId0) ? this.stationInfo.useConnectorId0 : true;
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
      return parseInt(this.getConfigurationKey(StandardParametersKey.ConnectionTimeOut).value) ?? Constants.DEFAULT_CONNECTION_TIMEOUT;
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
      maxConnectors = this.stationInfo.Connectors[0] ? this.getTemplateMaxNumberOfConnectors() - 1 : this.getTemplateMaxNumberOfConnectors();
    }
    return maxConnectors;
  }

  private async startMessageSequence(): Promise<void> {
    // Start WebSocket ping
    this.startWebSocketPing();
    // Start heartbeat
    this.startHeartbeat();
    // Initialize connectors status
    for (const connectorId of this.connectors.keys()) {
      if (connectorId === 0) {
        continue;
      } else if (!this.stopped && !this.getConnectorStatus(connectorId)?.status && this.getConnectorStatus(connectorId)?.bootStatus) {
        // Send status in template at startup
        await this.ocppRequestService.sendStatusNotification(connectorId, this.getConnectorStatus(connectorId).bootStatus);
        this.getConnectorStatus(connectorId).status = this.getConnectorStatus(connectorId).bootStatus;
      } else if (this.stopped && this.getConnectorStatus(connectorId)?.status && this.getConnectorStatus(connectorId)?.bootStatus) {
        // Send status in template after reset
        await this.ocppRequestService.sendStatusNotification(connectorId, this.getConnectorStatus(connectorId).bootStatus);
        this.getConnectorStatus(connectorId).status = this.getConnectorStatus(connectorId).bootStatus;
      } else if (!this.stopped && this.getConnectorStatus(connectorId)?.status) {
        // Send previous status at template reload
        await this.ocppRequestService.sendStatusNotification(connectorId, this.getConnectorStatus(connectorId).status);
      } else {
        // Send default status
        await this.ocppRequestService.sendStatusNotification(connectorId, ChargePointStatus.AVAILABLE);
        this.getConnectorStatus(connectorId).status = ChargePointStatus.AVAILABLE;
      }
    }
    // Start the ATG
    this.startAutomaticTransactionGenerator();
  }

  private startAutomaticTransactionGenerator() {
    if (this.stationInfo.AutomaticTransactionGenerator.enable) {
      if (!this.automaticTransactionGenerator) {
        this.automaticTransactionGenerator = new AutomaticTransactionGenerator(this);
      }
      if (!this.automaticTransactionGenerator.started) {
        this.automaticTransactionGenerator.start();
      }
    }
  }

  private async stopMessageSequence(reason: StopTransactionReason = StopTransactionReason.NONE): Promise<void> {
    // Stop WebSocket ping
    this.stopWebSocketPing();
    // Stop heartbeat
    this.stopHeartbeat();
    // Stop the ATG
    if (this.stationInfo.AutomaticTransactionGenerator.enable &&
      this.automaticTransactionGenerator &&
      this.automaticTransactionGenerator.started) {
      this.automaticTransactionGenerator.stop();
    } else {
      for (const connectorId of this.connectors.keys()) {
        if (connectorId > 0 && this.getConnectorStatus(connectorId)?.transactionStarted) {
          const transactionId = this.getConnectorStatus(connectorId).transactionId;
          await this.ocppRequestService.sendStopTransaction(transactionId, this.getEnergyActiveImportRegisterByTransactionId(transactionId),
            this.getTransactionIdTag(transactionId), reason);
        }
      }
    }
  }

  private startWebSocketPing(): void {
    const webSocketPingInterval: number = this.getConfigurationKey(StandardParametersKey.WebSocketPingInterval)
      ? Utils.convertToInt(this.getConfigurationKey(StandardParametersKey.WebSocketPingInterval).value)
      : 0;
    if (webSocketPingInterval > 0 && !this.webSocketPingSetInterval) {
      this.webSocketPingSetInterval = setInterval(() => {
        if (this.isWebSocketConnectionOpened()) {
          this.wsConnection.ping((): void => { /* This is intentional */ });
        }
      }, webSocketPingInterval * 1000);
      logger.info(this.logPrefix() + ' WebSocket ping started every ' + Utils.formatDurationSeconds(webSocketPingInterval));
    } else if (this.webSocketPingSetInterval) {
      logger.info(this.logPrefix() + ' WebSocket ping every ' + Utils.formatDurationSeconds(webSocketPingInterval) + ' already started');
    } else {
      logger.error(`${this.logPrefix()} WebSocket ping interval set to ${webSocketPingInterval ? Utils.formatDurationSeconds(webSocketPingInterval) : webSocketPingInterval}, not starting the WebSocket ping`);
    }
  }

  private stopWebSocketPing(): void {
    if (this.webSocketPingSetInterval) {
      clearInterval(this.webSocketPingSetInterval);
    }
  }

  private warnDeprecatedTemplateKey(template: ChargingStationTemplate, key: string, chargingStationId: string, logMsgToAppend = ''): void {
    if (!Utils.isUndefined(template[key])) {
      logger.warn(`${Utils.logPrefix(` ${chargingStationId} |`)} Deprecated template key '${key}' usage in file '${this.stationTemplateFile}'${logMsgToAppend && '. ' + logMsgToAppend}`);
    }
  }

  private convertDeprecatedTemplateKey(template: ChargingStationTemplate, deprecatedKey: string, key: string): void {
    if (!Utils.isUndefined(template[deprecatedKey])) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      template[key] = template[deprecatedKey];
      delete template[deprecatedKey];
    }
  }

  private getConfiguredSupervisionUrl(): URL {
    const supervisionUrls = Utils.cloneObject<string | string[]>(this.stationInfo.supervisionUrls ?? Configuration.getSupervisionUrls());
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
            logger.warn(`${this.logPrefix()} No more configured supervision urls available, using the first one`);
          }
          break;
        default:
          logger.error(`${this.logPrefix()} Unknown supervision url distribution '${Configuration.getSupervisionUrlDistribution()}', defaulting to ${SupervisionUrlDistribution.ROUND_ROBIN}`);
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
    !this.stationInfo.autoRegister && logger.warn(`${this.logPrefix()} Heartbeat interval configuration key not set, using default value: ${Constants.DEFAULT_HEARTBEAT_INTERVAL}`);
    return Constants.DEFAULT_HEARTBEAT_INTERVAL;
  }

  private stopHeartbeat(): void {
    if (this.heartbeatSetInterval) {
      clearInterval(this.heartbeatSetInterval);
    }
  }

  private openWSConnection(options: ClientOptions & ClientRequestArgs = this.stationInfo.wsOptions, forceCloseOpened = false): void {
    options.handshakeTimeout = options?.handshakeTimeout ?? this.getConnectionTimeout() * 1000;
    if (!Utils.isNullOrUndefined(this.stationInfo.supervisionUser) && !Utils.isNullOrUndefined(this.stationInfo.supervisionPassword)) {
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
    logger.info(this.logPrefix() + ' Open OCPP connection to URL ' + this.wsConnectionUrl.toString());
  }

  private stopMeterValues(connectorId: number) {
    if (this.getConnectorStatus(connectorId)?.transactionSetInterval) {
      clearInterval(this.getConnectorStatus(connectorId).transactionSetInterval);
    }
  }

  private startAuthorizationFileMonitoring(): void {
    const authorizationFile = this.getAuthorizationFile();
    if (authorizationFile) {
      try {
        fs.watch(authorizationFile, (event, filename) => {
          if (filename && event === 'change') {
            try {
              logger.debug(this.logPrefix() + ' Authorization file ' + authorizationFile + ' have changed, reload');
              // Initialize authorizedTags
              this.authorizedTags = this.getAuthorizedTags();
            } catch (error) {
              logger.error(this.logPrefix() + ' Authorization file monitoring error: %j', error);
            }
          }
        });
      } catch (error) {
        FileUtils.handleFileException(this.logPrefix(), 'Authorization', authorizationFile, error as NodeJS.ErrnoException);
      }
    } else {
      logger.info(this.logPrefix() + ' No authorization file given in template file ' + this.stationTemplateFile + '. Not monitoring changes');
    }
  }

  private startStationTemplateFileMonitoring(): void {
    try {
      fs.watch(this.stationTemplateFile, (event, filename): void => {
        if (filename && event === 'change') {
          try {
            logger.debug(this.logPrefix() + ' Template file ' + this.stationTemplateFile + ' have changed, reload');
            // Initialize
            this.initialize();
            // Restart the ATG
            if (!this.stationInfo.AutomaticTransactionGenerator.enable &&
              this.automaticTransactionGenerator) {
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
            logger.error(this.logPrefix() + ' Charging station template file monitoring error: %j', error);
          }
        }
      });
    } catch (error) {
      FileUtils.handleFileException(this.logPrefix(), 'Template', this.stationTemplateFile, error as NodeJS.ErrnoException);
    }
  }

  private getReconnectExponentialDelay(): boolean | undefined {
    return !Utils.isUndefined(this.stationInfo.reconnectExponentialDelay) ? this.stationInfo.reconnectExponentialDelay : false;
  }

  private async reconnect(code: number): Promise<void> {
    // Stop WebSocket ping
    this.stopWebSocketPing();
    // Stop heartbeat
    this.stopHeartbeat();
    // Stop the ATG if needed
    if (this.stationInfo.AutomaticTransactionGenerator.enable &&
      this.stationInfo.AutomaticTransactionGenerator.stopOnConnectionFailure &&
      this.automaticTransactionGenerator &&
      this.automaticTransactionGenerator.started) {
      this.automaticTransactionGenerator.stop();
    }
    if (this.autoReconnectRetryCount < this.getAutoReconnectMaxRetries() || this.getAutoReconnectMaxRetries() === -1) {
      this.autoReconnectRetryCount++;
      const reconnectDelay = (this.getReconnectExponentialDelay() ? Utils.exponentialDelay(this.autoReconnectRetryCount) : this.getConnectionTimeout() * 1000);
      const reconnectTimeout = (reconnectDelay - 100) > 0 && reconnectDelay;
      logger.error(`${this.logPrefix()} WebSocket: connection retry in ${Utils.roundTo(reconnectDelay, 2)}ms, timeout ${reconnectTimeout}ms`);
      await Utils.sleep(reconnectDelay);
      logger.error(this.logPrefix() + ' WebSocket: reconnecting try #' + this.autoReconnectRetryCount.toString());
      this.openWSConnection({ ...this.stationInfo.wsOptions, handshakeTimeout: reconnectTimeout }, true);
      this.wsConnectionRestarted = true;
    } else if (this.getAutoReconnectMaxRetries() !== -1) {
      logger.error(`${this.logPrefix()} WebSocket reconnect failure: max retries reached (${this.autoReconnectRetryCount}) or retry disabled (${this.getAutoReconnectMaxRetries()})`);
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

