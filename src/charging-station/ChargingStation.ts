import { BootNotificationResponse, RegistrationStatus } from '../types/ocpp/Responses';
import ChargingStationConfiguration, { ConfigurationKey } from '../types/ChargingStationConfiguration';
import ChargingStationTemplate, { CurrentOutType, PowerUnits, VoltageOut } from '../types/ChargingStationTemplate';
import Connectors, { Connector } from '../types/Connectors';
import { PerformanceObserver, performance } from 'perf_hooks';
import Requests, { AvailabilityType, BootNotificationRequest, IncomingRequest, IncomingRequestCommand } from '../types/ocpp/Requests';
import WebSocket, { MessageEvent } from 'ws';

import AutomaticTransactionGenerator from './AutomaticTransactionGenerator';
import { ChargePointStatus } from '../types/ocpp/ChargePointStatus';
import { ChargingProfile } from '../types/ocpp/ChargingProfile';
import ChargingStationInfo from '../types/ChargingStationInfo';
import Configuration from '../utils/Configuration';
import Constants from '../utils/Constants';
import FileUtils from '../utils/FileUtils';
import { MessageType } from '../types/ocpp/MessageType';
import { MeterValueMeasurand } from '../types/ocpp/MeterValues';
import OCPP16IncomingRequestService from './ocpp/1.6/OCCP16IncomingRequestService';
import OCPP16RequestService from './ocpp/1.6/OCPP16RequestService';
import OCPP16ResponseService from './ocpp/1.6/OCPP16ResponseService';
import OCPPError from './OcppError';
import OCPPIncomingRequestService from './ocpp/OCPPIncomingRequestService';
import OCPPRequestService from './ocpp/OCPPRequestService';
import { OCPPVersion } from '../types/ocpp/OCPPVersion';
import PerformanceStatistics from '../utils/PerformanceStatistics';
import { StandardParametersKey } from '../types/ocpp/Configuration';
import { StopTransactionReason } from '../types/ocpp/Transaction';
import Utils from '../utils/Utils';
import { WebSocketCloseEventStatusCode } from '../types/WebSocket';
import crypto from 'crypto';
import fs from 'fs';
import logger from '../utils/Logger';
import path from 'path';

export default class ChargingStation {
  public stationTemplateFile: string;
  public authorizedTags: string[];
  public stationInfo!: ChargingStationInfo;
  public connectors: Connectors;
  public configuration!: ChargingStationConfiguration;
  public hasStopped: boolean;
  public wsConnection!: WebSocket;
  public requests: Requests;
  public messageQueue: string[];
  public performanceStatistics!: PerformanceStatistics;
  public heartbeatSetInterval!: NodeJS.Timeout;
  public ocppIncomingRequestService!: OCPPIncomingRequestService;
  public ocppRequestService!: OCPPRequestService;
  private index: number;
  private bootNotificationRequest!: BootNotificationRequest;
  private bootNotificationResponse!: BootNotificationResponse | null;
  private connectorsConfigurationHash!: string;
  private supervisionUrl!: string;
  private wsConnectionUrl!: string;
  private hasSocketRestarted: boolean;
  private autoReconnectRetryCount: number;
  private automaticTransactionGeneration!: AutomaticTransactionGenerator;
  private performanceObserver!: PerformanceObserver;
  private webSocketPingSetInterval!: NodeJS.Timeout;

  constructor(index: number, stationTemplateFile: string) {
    this.index = index;
    this.stationTemplateFile = stationTemplateFile;
    this.connectors = {} as Connectors;
    this.initialize();

    this.hasStopped = false;
    this.hasSocketRestarted = false;
    this.autoReconnectRetryCount = 0;

    this.requests = {} as Requests;
    this.messageQueue = [] as string[];

    this.authorizedTags = this.getAuthorizedTags();
  }

  public logPrefix(): string {
    return Utils.logPrefix(` ${this.stationInfo.chargingStationId} |`);
  }

  public getRandomTagId(): string {
    const index = Math.floor(Math.random() * this.authorizedTags.length);
    return this.authorizedTags[index];
  }

  public hasAuthorizedTags(): boolean {
    return !Utils.isEmptyArray(this.authorizedTags);
  }

  public getEnableStatistics(): boolean | undefined {
    return !Utils.isUndefined(this.stationInfo.enableStatistics) ? this.stationInfo.enableStatistics : true;
  }

  public getNumberOfPhases(): number | undefined {
    switch (this.getCurrentOutType()) {
      case CurrentOutType.AC:
        return !Utils.isUndefined(this.stationInfo.numberOfPhases) ? this.stationInfo.numberOfPhases : 3;
      case CurrentOutType.DC:
        return 0;
    }
  }

  public isWebSocketOpen(): boolean {
    return this.wsConnection?.readyState === WebSocket.OPEN;
  }

  public isRegistered(): boolean {
    return this.bootNotificationResponse?.status === RegistrationStatus.ACCEPTED;
  }

  public isChargingStationAvailable(): boolean {
    return this.getConnector(0).availability === AvailabilityType.OPERATIVE;
  }

  public isConnectorAvailable(id: number): boolean {
    return this.getConnector(id).availability === AvailabilityType.OPERATIVE;
  }

  public getConnector(id: number): Connector {
    return this.connectors[id];
  }

  public getCurrentOutType(): CurrentOutType | undefined {
    return !Utils.isUndefined(this.stationInfo.currentOutType) ? this.stationInfo.currentOutType : CurrentOutType.AC;
  }

  public getVoltageOut(): number | undefined {
    const errMsg = `${this.logPrefix()} Unknown ${this.getCurrentOutType()} currentOutType in template file ${this.stationTemplateFile}, cannot define default voltage out`;
    let defaultVoltageOut: number;
    switch (this.getCurrentOutType()) {
      case CurrentOutType.AC:
        defaultVoltageOut = VoltageOut.VOLTAGE_230;
        break;
      case CurrentOutType.DC:
        defaultVoltageOut = VoltageOut.VOLTAGE_400;
        break;
      default:
        logger.error(errMsg);
        throw Error(errMsg);
    }
    return !Utils.isUndefined(this.stationInfo.voltageOut) ? this.stationInfo.voltageOut : defaultVoltageOut;
  }

  public getTransactionIdTag(transactionId: number): string | undefined {
    for (const connector in this.connectors) {
      if (Utils.convertToInt(connector) > 0 && this.getConnector(Utils.convertToInt(connector)).transactionId === transactionId) {
        return this.getConnector(Utils.convertToInt(connector)).idTag;
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

  public getEnergyActiveImportRegisterByTransactionId(transactionId: number): number | undefined {
    if (this.getMeteringPerTransaction()) {
      for (const connector in this.connectors) {
        if (Utils.convertToInt(connector) > 0 && this.getConnector(Utils.convertToInt(connector)).transactionId === transactionId) {
          return this.getConnector(Utils.convertToInt(connector)).transactionEnergyActiveImportRegisterValue;
        }
      }
    }
    for (const connector in this.connectors) {
      if (Utils.convertToInt(connector) > 0 && this.getConnector(Utils.convertToInt(connector)).transactionId === transactionId) {
        return this.getConnector(Utils.convertToInt(connector)).energyActiveImportRegisterValue;
      }
    }
  }

  public getEnergyActiveImportRegisterByConnectorId(connectorId: number): number | undefined {
    if (this.getMeteringPerTransaction()) {
      return this.getConnector(connectorId).transactionEnergyActiveImportRegisterValue;
    }
    return this.getConnector(connectorId).energyActiveImportRegisterValue;
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

  public getAutomaticTransactionGeneratorRequireAuthorize(): boolean {
    return this.stationInfo.AutomaticTransactionGenerator.requireAuthorize ?? true;
  }

  public startHeartbeat(): void {
    if (this.getHeartbeatInterval() && this.getHeartbeatInterval() > 0 && !this.heartbeatSetInterval) {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      this.heartbeatSetInterval = setInterval(async (): Promise<void> => {
        await this.ocppRequestService.sendHeartbeat();
      }, this.getHeartbeatInterval());
      logger.info(this.logPrefix() + ' Heartbeat started every ' + Utils.milliSecondsToHHMMSS(this.getHeartbeatInterval()));
    } else if (this.heartbeatSetInterval) {
      logger.info(this.logPrefix() + ' Heartbeat already started every ' + Utils.milliSecondsToHHMMSS(this.getHeartbeatInterval()));
    } else {
      logger.error(`${this.logPrefix()} Heartbeat interval set to ${this.getHeartbeatInterval() ? Utils.milliSecondsToHHMMSS(this.getHeartbeatInterval()) : this.getHeartbeatInterval()}, not starting the heartbeat`);
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
    if (!this.getConnector(connectorId)) {
      logger.error(`${this.logPrefix()} Trying to start MeterValues on non existing connector Id ${connectorId.toString()}`);
      return;
    }
    if (!this.getConnector(connectorId)?.transactionStarted) {
      logger.error(`${this.logPrefix()} Trying to start MeterValues on connector Id ${connectorId} with no transaction started`);
      return;
    } else if (this.getConnector(connectorId)?.transactionStarted && !this.getConnector(connectorId)?.transactionId) {
      logger.error(`${this.logPrefix()} Trying to start MeterValues on connector Id ${connectorId} with no transaction id`);
      return;
    }
    if (interval > 0) {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      this.getConnector(connectorId).transactionSetInterval = setInterval(async (): Promise<void> => {
        if (this.getEnableStatistics()) {
          const sendMeterValues = performance.timerify(this.ocppRequestService.sendMeterValues);
          this.performanceObserver.observe({
            entryTypes: ['function'],
          });
          await sendMeterValues(connectorId, this.getConnector(connectorId).transactionId, interval, this.ocppRequestService);
        } else {
          await this.ocppRequestService.sendMeterValues(connectorId, this.getConnector(connectorId).transactionId, interval, this.ocppRequestService);
        }
      }, interval);
    } else {
      logger.error(`${this.logPrefix()} Charging station ${StandardParametersKey.MeterValueSampleInterval} configuration set to ${interval ? Utils.milliSecondsToHHMMSS(interval) : interval}, not sending MeterValues`);
    }
  }

  public start(): void {
    this.openWSConnection();
    // Monitor authorization file
    this.startAuthorizationFileMonitoring();
    // Monitor station template file
    this.startStationTemplateFileMonitoring();
    // Handle Socket incoming messages
    this.wsConnection.on('message', this.onMessage.bind(this));
    // Handle Socket error
    this.wsConnection.on('error', this.onError.bind(this));
    // Handle Socket close
    this.wsConnection.on('close', this.onClose.bind(this));
    // Handle Socket opening connection
    this.wsConnection.on('open', this.onOpen.bind(this));
    // Handle Socket ping
    this.wsConnection.on('ping', this.onPing.bind(this));
    // Handle Socket pong
    this.wsConnection.on('pong', this.onPong.bind(this));
  }

  public async stop(reason: StopTransactionReason = StopTransactionReason.NONE): Promise<void> {
    // Stop message sequence
    await this.stopMessageSequence(reason);
    for (const connector in this.connectors) {
      if (Utils.convertToInt(connector) > 0) {
        await this.ocppRequestService.sendStatusNotification(Utils.convertToInt(connector), ChargePointStatus.UNAVAILABLE);
        this.getConnector(Utils.convertToInt(connector)).status = ChargePointStatus.UNAVAILABLE;
      }
    }
    if (this.isWebSocketOpen()) {
      this.wsConnection.close();
    }
    this.bootNotificationResponse = null;
    this.hasStopped = true;
  }

  public getConfigurationKey(key: string | StandardParametersKey, caseInsensitive = false): ConfigurationKey | undefined {
    const configurationKey: ConfigurationKey | undefined = this.configuration.configurationKey.find((configElement) => {
      if (caseInsensitive) {
        return configElement.key.toLowerCase() === key.toLowerCase();
      }
      return configElement.key === key;
    });
    return configurationKey;
  }

  public addConfigurationKey(key: string | StandardParametersKey, value: string, readonly = false, visible = true, reboot = false): void {
    const keyFound = this.getConfigurationKey(key);
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

  public setChargingProfile(connectorId: number, cp: ChargingProfile): boolean {
    if (!Utils.isEmptyArray(this.getConnector(connectorId).chargingProfiles)) {
      this.getConnector(connectorId).chargingProfiles?.forEach((chargingProfile: ChargingProfile, index: number) => {
        if (chargingProfile.chargingProfileId === cp.chargingProfileId
          || (chargingProfile.stackLevel === cp.stackLevel && chargingProfile.chargingProfilePurpose === cp.chargingProfilePurpose)) {
          this.getConnector(connectorId).chargingProfiles[index] = cp;
          return true;
        }
      });
    }
    this.getConnector(connectorId).chargingProfiles?.push(cp);
    return true;
  }

  public resetTransactionOnConnector(connectorId: number): void {
    this.getConnector(connectorId).transactionStarted = false;
    delete this.getConnector(connectorId).transactionId;
    delete this.getConnector(connectorId).idTag;
    this.getConnector(connectorId).transactionEnergyActiveImportRegisterValue = 0;
    this.stopMeterValues(connectorId);
  }

  public addToMessageQueue(message: string): void {
    let dups = false;
    // Handle dups in message queue
    for (const bufferedMessage of this.messageQueue) {
      // Message already in the queue
      if (message === bufferedMessage) {
        dups = true;
        break;
      }
    }
    if (!dups) {
      // Queue message
      this.messageQueue.push(message);
    }
  }

  private flushMessageQueue() {
    if (!Utils.isEmptyArray(this.messageQueue)) {
      this.messageQueue.forEach((message, index) => {
        this.messageQueue.splice(index, 1);
        this.wsConnection.send(message);
      });
    }
  }

  private getChargingStationId(stationTemplate: ChargingStationTemplate): string {
    // In case of multiple instances: add instance index to charging station id
    let instanceIndex = process.env.CF_INSTANCE_INDEX ? process.env.CF_INSTANCE_INDEX : 0;
    instanceIndex = instanceIndex > 0 ? instanceIndex : '';
    const idSuffix = stationTemplate.nameSuffix ? stationTemplate.nameSuffix : '';
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
      FileUtils.handleFileException(this.logPrefix(), 'Template', this.stationTemplateFile, error);
    }
    const stationInfo: ChargingStationInfo = stationTemplateFromFile ?? {} as ChargingStationInfo;
    if (!Utils.isEmptyArray(stationTemplateFromFile.power)) {
      stationTemplateFromFile.power = stationTemplateFromFile.power as number[];
      const powerArrayRandomIndex = Math.floor(Math.random() * stationTemplateFromFile.power.length);
      stationInfo.maxPower = stationTemplateFromFile.powerUnit === PowerUnits.KILO_WATT
        ? stationTemplateFromFile.power[powerArrayRandomIndex] * 1000
        : stationTemplateFromFile.power[powerArrayRandomIndex];
    } else {
      stationTemplateFromFile.power = stationTemplateFromFile.power as number;
      stationInfo.maxPower = stationTemplateFromFile.powerUnit === PowerUnits.KILO_WATT
        ? (stationTemplateFromFile.power) * 1000
        : stationTemplateFromFile.power;
    }
    stationInfo.chargingStationId = this.getChargingStationId(stationTemplateFromFile);
    stationInfo.resetTime = stationTemplateFromFile.resetTime ? stationTemplateFromFile.resetTime * 1000 : Constants.CHARGING_STATION_DEFAULT_RESET_TIME;
    return stationInfo;
  }

  private getOCPPVersion(): OCPPVersion {
    return this.stationInfo.ocppVersion ? this.stationInfo.ocppVersion : OCPPVersion.VERSION_16;
  }

  private handleUnsupportedVersion(version: OCPPVersion) {
    const errMsg = `${this.logPrefix()} Unsupported protocol version '${version}' configured in template file ${this.stationTemplateFile}`;
    logger.error(errMsg);
    throw new Error(errMsg);
  }

  private initialize(): void {
    this.stationInfo = this.buildStationInfo();
    this.bootNotificationRequest = {
      chargePointModel: this.stationInfo.chargePointModel,
      chargePointVendor: this.stationInfo.chargePointVendor,
      ...!Utils.isUndefined(this.stationInfo.chargeBoxSerialNumberPrefix) && { chargeBoxSerialNumber: this.stationInfo.chargeBoxSerialNumberPrefix },
      ...!Utils.isUndefined(this.stationInfo.firmwareVersion) && { firmwareVersion: this.stationInfo.firmwareVersion },
    };
    this.configuration = this.getTemplateChargingStationConfiguration();
    this.supervisionUrl = this.getSupervisionURL();
    this.wsConnectionUrl = this.supervisionUrl + '/' + this.stationInfo.chargingStationId;
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
    // FIXME: Handle shrinking the number of connectors
    if (!this.connectors || (this.connectors && this.connectorsConfigurationHash !== connectorsConfigHash)) {
      this.connectorsConfigurationHash = connectorsConfigHash;
      // Add connector Id 0
      let lastConnector = '0';
      for (lastConnector in this.stationInfo.Connectors) {
        if (Utils.convertToInt(lastConnector) === 0 && this.getUseConnectorId0() && this.stationInfo.Connectors[lastConnector]) {
          this.connectors[lastConnector] = Utils.cloneObject<Connector>(this.stationInfo.Connectors[lastConnector]);
          this.connectors[lastConnector].availability = AvailabilityType.OPERATIVE;
          if (Utils.isUndefined(this.connectors[lastConnector]?.chargingProfiles)) {
            this.connectors[lastConnector].chargingProfiles = [];
          }
        }
      }
      // Generate all connectors
      if ((this.stationInfo.Connectors[0] ? templateMaxConnectors - 1 : templateMaxConnectors) > 0) {
        for (let index = 1; index <= maxConnectors; index++) {
          const randConnectorID = this.stationInfo.randomConnectors ? Utils.getRandomInt(Utils.convertToInt(lastConnector), 1) : index;
          this.connectors[index] = Utils.cloneObject<Connector>(this.stationInfo.Connectors[randConnectorID]);
          this.connectors[index].availability = AvailabilityType.OPERATIVE;
          if (Utils.isUndefined(this.connectors[lastConnector]?.chargingProfiles)) {
            this.connectors[index].chargingProfiles = [];
          }
        }
      }
    }
    // Avoid duplication of connectors related information
    delete this.stationInfo.Connectors;
    // Initialize transaction attributes on connectors
    for (const connector in this.connectors) {
      if (Utils.convertToInt(connector) > 0 && !this.getConnector(Utils.convertToInt(connector)).transactionStarted) {
        this.initTransactionAttributesOnConnector(Utils.convertToInt(connector));
      }
    }
    switch (this.getOCPPVersion()) {
      case OCPPVersion.VERSION_16:
        this.ocppIncomingRequestService = new OCPP16IncomingRequestService(this);
        this.ocppRequestService = new OCPP16RequestService(this, new OCPP16ResponseService(this));
        break;
      default:
        this.handleUnsupportedVersion(this.getOCPPVersion());
        break;
    }
    // OCPP parameters
    this.addConfigurationKey(StandardParametersKey.NumberOfConnectors, this.getNumberOfConnectors().toString(), true);
    if (!this.getConfigurationKey(StandardParametersKey.MeterValuesSampledData)) {
      this.addConfigurationKey(StandardParametersKey.MeterValuesSampledData, MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER);
    }
    this.stationInfo.powerDivider = this.getPowerDivider();
    if (this.getEnableStatistics()) {
      this.performanceStatistics = new PerformanceStatistics(this.stationInfo.chargingStationId);
      this.performanceObserver = new PerformanceObserver((list) => {
        const entry = list.getEntries()[0];
        this.performanceStatistics.logPerformance(entry, Constants.ENTITY_CHARGING_STATION);
        this.performanceObserver.disconnect();
      });
    }
  }

  private async onOpen(): Promise<void> {
    logger.info(`${this.logPrefix()} Is connected to server through ${this.wsConnectionUrl}`);
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
    if (this.isRegistered()) {
      await this.startMessageSequence();
      this.hasStopped && (this.hasStopped = false);
      if (this.hasSocketRestarted && this.isWebSocketOpen()) {
        this.flushMessageQueue();
      }
    } else {
      logger.error(`${this.logPrefix()} Registration failure: max retries reached (${this.getRegistrationMaxRetries()}) or retry disabled (${this.getRegistrationMaxRetries()})`);
    }
    this.autoReconnectRetryCount = 0;
    this.hasSocketRestarted = false;
  }

  private async onClose(closeEvent: any): Promise<void> {
    switch (closeEvent) {
      case WebSocketCloseEventStatusCode.CLOSE_NORMAL: // Normal close
      case WebSocketCloseEventStatusCode.CLOSE_NO_STATUS:
        logger.info(`${this.logPrefix()} Socket normally closed with status '${Utils.getWebSocketCloseEventStatusString(closeEvent)}'`);
        this.autoReconnectRetryCount = 0;
        break;
      default: // Abnormal close
        logger.error(`${this.logPrefix()} Socket abnormally closed with status '${Utils.getWebSocketCloseEventStatusString(closeEvent)}'`);
        await this.reconnect(closeEvent);
        break;
    }
  }

  private async onMessage(messageEvent: MessageEvent): Promise<void> {
    let [messageType, messageId, commandName, commandPayload, errorDetails]: IncomingRequest = [0, '', '' as IncomingRequestCommand, {}, {}];
    let responseCallback: (payload: Record<string, unknown> | string, requestPayload: Record<string, unknown>) => void;
    let rejectCallback: (error: OCPPError) => void;
    let requestPayload: Record<string, unknown>;
    let errMsg: string;
    try {
      // Parse the message
      [messageType, messageId, commandName, commandPayload, errorDetails] = JSON.parse(messageEvent.toString()) as IncomingRequest;
      // Check the Type of message
      switch (messageType) {
        // Incoming Message
        case MessageType.CALL_MESSAGE:
          if (this.getEnableStatistics()) {
            this.performanceStatistics.addMessage(commandName, messageType);
          }
          // Process the call
          await this.ocppIncomingRequestService.handleRequest(messageId, commandName, commandPayload);
          break;
        // Outcome Message
        case MessageType.CALL_RESULT_MESSAGE:
          // Respond
          if (Utils.isIterable(this.requests[messageId])) {
            [responseCallback, , requestPayload] = this.requests[messageId];
          } else {
            throw new Error(`Response request for message id ${messageId} is not iterable`);
          }
          if (!responseCallback) {
            // Error
            throw new Error(`Response request for unknown message id ${messageId}`);
          }
          delete this.requests[messageId];
          responseCallback(commandName, requestPayload);
          break;
        // Error Message
        case MessageType.CALL_ERROR_MESSAGE:
          if (!this.requests[messageId]) {
            // Error
            throw new Error(`Error request for unknown message id ${messageId}`);
          }
          if (Utils.isIterable(this.requests[messageId])) {
            [, rejectCallback] = this.requests[messageId];
          } else {
            throw new Error(`Error request for message id ${messageId} is not iterable`);
          }
          delete this.requests[messageId];
          rejectCallback(new OCPPError(commandName, commandPayload.toString(), errorDetails));
          break;
        // Error
        default:
          errMsg = `${this.logPrefix()} Wrong message type ${messageType}`;
          logger.error(errMsg);
          throw new Error(errMsg);
      }
    } catch (error) {
      // Log
      logger.error('%s Incoming message %j processing error %j on request content type %j', this.logPrefix(), messageEvent, error, this.requests[messageId]);
      // Send error
      messageType !== MessageType.CALL_ERROR_MESSAGE && await this.ocppRequestService.sendError(messageId, error, commandName);
    }
  }

  private onPing(): void {
    logger.debug(this.logPrefix() + ' Has received a WS ping (rfc6455) from the server');
  }

  private onPong(): void {
    logger.debug(this.logPrefix() + ' Has received a WS pong (rfc6455) from the server');
  }

  private async onError(errorEvent: any): Promise<void> {
    logger.error(this.logPrefix() + ' Socket error: %j', errorEvent);
    // switch (errorEvent.code) {
    //   case 'ECONNREFUSED':
    //     await this._reconnect(errorEvent);
    //     break;
    // }
  }

  private getTemplateChargingStationConfiguration(): ChargingStationConfiguration {
    return this.stationInfo.Configuration ? this.stationInfo.Configuration : {} as ChargingStationConfiguration;
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
        FileUtils.handleFileException(this.logPrefix(), 'Authorization', authorizationFile, error);
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
    for (const connector in this.connectors) {
      if (Utils.convertToInt(connector) > 0 && this.getConnector(Utils.convertToInt(connector)).transactionStarted) {
        trxCount++;
      }
    }
    return trxCount;
  }

  // 0 for disabling
  private getConnectionTimeout(): number | undefined {
    if (!Utils.isUndefined(this.stationInfo.connectionTimeout)) {
      return this.stationInfo.connectionTimeout;
    }
    if (!Utils.isUndefined(Configuration.getConnectionTimeout())) {
      return Configuration.getConnectionTimeout();
    }
    return 30;
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
    let maxConnectors = 0;
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

  private getNumberOfConnectors(): number {
    return this.connectors[0] ? Object.keys(this.connectors).length - 1 : Object.keys(this.connectors).length;
  }

  private async startMessageSequence(): Promise<void> {
    // Start WebSocket ping
    this.startWebSocketPing();
    // Start heartbeat
    this.startHeartbeat();
    // Initialize connectors status
    for (const connector in this.connectors) {
      if (Utils.convertToInt(connector) === 0) {
        continue;
      } else if (!this.hasStopped && !this.getConnector(Utils.convertToInt(connector))?.status && this.getConnector(Utils.convertToInt(connector))?.bootStatus) {
        // Send status in template at startup
        await this.ocppRequestService.sendStatusNotification(Utils.convertToInt(connector), this.getConnector(Utils.convertToInt(connector)).bootStatus);
        this.getConnector(Utils.convertToInt(connector)).status = this.getConnector(Utils.convertToInt(connector)).bootStatus;
      } else if (this.hasStopped && this.getConnector(Utils.convertToInt(connector))?.bootStatus) {
        // Send status in template after reset
        await this.ocppRequestService.sendStatusNotification(Utils.convertToInt(connector), this.getConnector(Utils.convertToInt(connector)).bootStatus);
        this.getConnector(Utils.convertToInt(connector)).status = this.getConnector(Utils.convertToInt(connector)).bootStatus;
      } else if (!this.hasStopped && this.getConnector(Utils.convertToInt(connector))?.status) {
        // Send previous status at template reload
        await this.ocppRequestService.sendStatusNotification(Utils.convertToInt(connector), this.getConnector(Utils.convertToInt(connector)).status);
      } else {
        // Send default status
        await this.ocppRequestService.sendStatusNotification(Utils.convertToInt(connector), ChargePointStatus.AVAILABLE);
        this.getConnector(Utils.convertToInt(connector)).status = ChargePointStatus.AVAILABLE;
      }
    }
    // Start the ATG
    this.startAutomaticTransactionGenerator();
    if (this.getEnableStatistics()) {
      this.performanceStatistics.start();
    }
  }

  private startAutomaticTransactionGenerator() {
    if (this.stationInfo.AutomaticTransactionGenerator.enable) {
      if (!this.automaticTransactionGeneration) {
        this.automaticTransactionGeneration = new AutomaticTransactionGenerator(this);
      }
      if (this.automaticTransactionGeneration.timeToStop) {
        // The ATG might sleep
        void this.automaticTransactionGeneration.start();
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
      this.automaticTransactionGeneration &&
      !this.automaticTransactionGeneration.timeToStop) {
      await this.automaticTransactionGeneration.stop(reason);
    } else {
      for (const connector in this.connectors) {
        if (Utils.convertToInt(connector) > 0 && this.getConnector(Utils.convertToInt(connector)).transactionStarted) {
          const transactionId = this.getConnector(Utils.convertToInt(connector)).transactionId;
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
        if (this.isWebSocketOpen()) {
          this.wsConnection.ping((): void => { });
        }
      }, webSocketPingInterval * 1000);
      logger.info(this.logPrefix() + ' WebSocket ping started every ' + Utils.secondsToHHMMSS(webSocketPingInterval));
    } else if (this.webSocketPingSetInterval) {
      logger.info(this.logPrefix() + ' WebSocket ping every ' + Utils.secondsToHHMMSS(webSocketPingInterval) + ' already started');
    } else {
      logger.error(`${this.logPrefix()} WebSocket ping interval set to ${webSocketPingInterval ? Utils.secondsToHHMMSS(webSocketPingInterval) : webSocketPingInterval}, not starting the WebSocket ping`);
    }
  }

  private stopWebSocketPing(): void {
    if (this.webSocketPingSetInterval) {
      clearInterval(this.webSocketPingSetInterval);
    }
  }

  private getSupervisionURL(): string {
    const supervisionUrls = Utils.cloneObject<string | string[]>(this.stationInfo.supervisionURL ? this.stationInfo.supervisionURL : Configuration.getSupervisionURLs());
    let indexUrl = 0;
    if (!Utils.isEmptyArray(supervisionUrls)) {
      if (Configuration.getDistributeStationsToTenantsEqually()) {
        indexUrl = this.index % supervisionUrls.length;
      } else {
        // Get a random url
        indexUrl = Math.floor(Math.random() * supervisionUrls.length);
      }
      return supervisionUrls[indexUrl];
    }
    return supervisionUrls as string;
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
  }

  private stopHeartbeat(): void {
    if (this.heartbeatSetInterval) {
      clearInterval(this.heartbeatSetInterval);
    }
  }

  private openWSConnection(options?: WebSocket.ClientOptions, forceCloseOpened = false): void {
    options ?? {} as WebSocket.ClientOptions;
    options?.handshakeTimeout ?? this.getConnectionTimeout() * 1000;
    if (this.isWebSocketOpen() && forceCloseOpened) {
      this.wsConnection.close();
    }
    let protocol;
    switch (this.getOCPPVersion()) {
      case OCPPVersion.VERSION_16:
        protocol = 'ocpp' + OCPPVersion.VERSION_16;
        break;
      default:
        this.handleUnsupportedVersion(this.getOCPPVersion());
        break;
    }
    this.wsConnection = new WebSocket(this.wsConnectionUrl, protocol, options);
    logger.info(this.logPrefix() + ' Will communicate through URL ' + this.supervisionUrl);
  }

  private stopMeterValues(connectorId: number) {
    if (this.getConnector(connectorId)?.transactionSetInterval) {
      clearInterval(this.getConnector(connectorId).transactionSetInterval);
    }
  }

  private startAuthorizationFileMonitoring(): void {
    const authorizationFile = this.getAuthorizationFile();
    if (authorizationFile) {
      try {
        fs.watch(authorizationFile).on('change', (e) => {
          try {
            logger.debug(this.logPrefix() + ' Authorization file ' + authorizationFile + ' have changed, reload');
            // Initialize authorizedTags
            this.authorizedTags = this.getAuthorizedTags();
          } catch (error) {
            logger.error(this.logPrefix() + ' Authorization file monitoring error: %j', error);
          }
        });
      } catch (error) {
        FileUtils.handleFileException(this.logPrefix(), 'Authorization', authorizationFile, error);
      }
    } else {
      logger.info(this.logPrefix() + ' No authorization file given in template file ' + this.stationTemplateFile + '. Not monitoring changes');
    }
  }

  private startStationTemplateFileMonitoring(): void {
    try {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
      fs.watch(this.stationTemplateFile).on('change', async (e): Promise<void> => {
        try {
          logger.debug(this.logPrefix() + ' Template file ' + this.stationTemplateFile + ' have changed, reload');
          // Initialize
          this.initialize();
          // Stop the ATG
          if (!this.stationInfo.AutomaticTransactionGenerator.enable &&
          this.automaticTransactionGeneration) {
            await this.automaticTransactionGeneration.stop();
          }
          // Start the ATG
          this.startAutomaticTransactionGenerator();
          // FIXME?: restart heartbeat and WebSocket ping when their interval values have changed
        } catch (error) {
          logger.error(this.logPrefix() + ' Charging station template file monitoring error: %j', error);
        }
      });
    } catch (error) {
      FileUtils.handleFileException(this.logPrefix(), 'Template', this.stationTemplateFile, error);
    }
  }

  private getReconnectExponentialDelay(): boolean | undefined {
    return !Utils.isUndefined(this.stationInfo.reconnectExponentialDelay) ? this.stationInfo.reconnectExponentialDelay : false;
  }

  private async reconnect(error: any): Promise<void> {
    // Stop heartbeat
    this.stopHeartbeat();
    // Stop the ATG if needed
    if (this.stationInfo.AutomaticTransactionGenerator.enable &&
      this.stationInfo.AutomaticTransactionGenerator.stopOnConnectionFailure &&
      this.automaticTransactionGeneration &&
      !this.automaticTransactionGeneration.timeToStop) {
      await this.automaticTransactionGeneration.stop();
    }
    if (this.autoReconnectRetryCount < this.getAutoReconnectMaxRetries() || this.getAutoReconnectMaxRetries() === -1) {
      this.autoReconnectRetryCount++;
      const reconnectDelay = (this.getReconnectExponentialDelay() ? Utils.exponentialDelay(this.autoReconnectRetryCount) : this.getConnectionTimeout() * 1000);
      logger.error(`${this.logPrefix()} Socket: connection retry in ${Utils.roundTo(reconnectDelay, 2)}ms, timeout ${reconnectDelay - 100}ms`);
      await Utils.sleep(reconnectDelay);
      logger.error(this.logPrefix() + ' Socket: reconnecting try #' + this.autoReconnectRetryCount.toString());
      this.openWSConnection({ handshakeTimeout: reconnectDelay - 100 });
      this.hasSocketRestarted = true;
    } else if (this.getAutoReconnectMaxRetries() !== -1) {
      logger.error(`${this.logPrefix()} Socket reconnect failure: max retries reached (${this.autoReconnectRetryCount}) or retry disabled (${this.getAutoReconnectMaxRetries()})`);
    }
  }

  private initTransactionAttributesOnConnector(connectorId: number): void {
    this.getConnector(connectorId).transactionStarted = false;
    this.getConnector(connectorId).energyActiveImportRegisterValue = 0;
    this.getConnector(connectorId).transactionEnergyActiveImportRegisterValue = 0;
  }
}

