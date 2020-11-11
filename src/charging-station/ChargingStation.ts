import { AuthorizationStatus, StartTransactionResponse, StopTransactionReason, StopTransactionResponse } from '../types/ocpp/1.6/Transaction';
import ChargingStationConfiguration, { ConfigurationKey } from '../types/ChargingStationConfiguration';
import ChargingStationTemplate, { PowerOutType } from '../types/ChargingStationTemplate';
import { ConfigurationResponse, DefaultRequestResponse, UnlockResponse } from '../types/ocpp/1.6/RequestResponses';
import Connectors, { Connector } from '../types/Connectors';
import MeterValue, { MeterValueLocation, MeterValueMeasurand, MeterValuePhase, MeterValueUnit } from '../types/ocpp/1.6/MeterValue';
import { PerformanceObserver, performance } from 'perf_hooks';

import AutomaticTransactionGenerator from './AutomaticTransactionGenerator';
import { ChargePointErrorCode } from '../types/ocpp/1.6/ChargePointErrorCode';
import { ChargePointStatus } from '../types/ocpp/1.6/ChargePointStatus';
import ChargingStationInfo from '../types/ChargingStationInfo';
import Configuration from '../utils/Configuration';
import Constants from '../utils/Constants.js';
import ElectricUtils from '../utils/ElectricUtils';
import MeasurandValues from '../types/MeasurandValues';
import OCPPError from './OcppError.js';
import Statistics from '../utils/Statistics';
import Utils from '../utils/Utils';
import WebSocket from 'ws';
import crypto from 'crypto';
import fs from 'fs';
import logger from '../utils/Logger';

export default class ChargingStation {
  private _index: number;
  private _stationTemplateFile: string;
  private _stationInfo: ChargingStationInfo;
  private _bootNotificationMessage: {
    chargePointModel: string,
    chargePointVendor: string,
    chargeBoxSerialNumber?: string,
    firmwareVersion?: string,
  };

  private _connectors: Connectors;
  private _configuration: ChargingStationConfiguration;
  private _connectorsConfigurationHash: string;
  private _supervisionUrl: string;
  private _wsConnectionUrl: string;
  private _wsConnection: WebSocket;
  private _hasStopped: boolean;
  private _hasSocketRestarted: boolean;
  private _autoReconnectRetryCount: number;
  private _autoReconnectMaxRetries: number;
  private _autoReconnectTimeout: number;
  private _requests: { [id: string]: [(payload?, requestPayload?) => void, (error?: OCPPError) => void, object] };
  private _messageQueue: any[];
  private _automaticTransactionGeneration: AutomaticTransactionGenerator;
  private _authorizedTags: string[];
  private _heartbeatInterval: number;
  private _heartbeatSetInterval: NodeJS.Timeout;
  private _statistics: Statistics;
  private _performanceObserver: PerformanceObserver;

  constructor(index: number, stationTemplateFile: string) {
    this._index = index;
    this._stationTemplateFile = stationTemplateFile;
    this._connectors = {};
    this._initialize();

    this._hasStopped = false;
    this._hasSocketRestarted = false;
    this._autoReconnectRetryCount = 0;
    this._autoReconnectMaxRetries = Configuration.getAutoReconnectMaxRetries(); // -1 for unlimited
    this._autoReconnectTimeout = Configuration.getAutoReconnectTimeout() * 1000; // Ms, zero for disabling

    this._requests = {};
    this._messageQueue = [];

    this._authorizedTags = this._loadAndGetAuthorizedTags();
  }

  _getStationName(stationTemplate: ChargingStationTemplate): string {
    return stationTemplate.fixedName ? stationTemplate.baseName : stationTemplate.baseName + '-' + ('000000000' + this._index.toString()).substr(('000000000' + this._index.toString()).length - 4);
  }

  _buildStationInfo(): ChargingStationInfo {
    let stationTemplateFromFile: ChargingStationTemplate;
    try {
      // Load template file
      const fileDescriptor = fs.openSync(this._stationTemplateFile, 'r');
      stationTemplateFromFile = JSON.parse(fs.readFileSync(fileDescriptor, 'utf8')) as ChargingStationTemplate;
      fs.closeSync(fileDescriptor);
    } catch (error) {
      logger.error('Template file ' + this._stationTemplateFile + ' loading error: %j', error);
      throw error;
    }
    const stationInfo: ChargingStationInfo = stationTemplateFromFile || {} as ChargingStationInfo;
    if (!Utils.isEmptyArray(stationTemplateFromFile.power)) {
      stationTemplateFromFile.power = stationTemplateFromFile.power as number[];
      stationInfo.maxPower = stationTemplateFromFile.power[Math.floor(Math.random() * stationTemplateFromFile.power.length)];
    } else {
      stationInfo.maxPower = stationTemplateFromFile.power as number;
    }
    stationInfo.name = this._getStationName(stationTemplateFromFile);
    stationInfo.resetTime = stationTemplateFromFile.resetTime ? stationTemplateFromFile.resetTime * 1000 : Constants.CHARGING_STATION_DEFAULT_RESET_TIME;
    return stationInfo;
  }

  get stationInfo(): ChargingStationInfo {
    return this._stationInfo;
  }

  _initialize(): void {
    this._stationInfo = this._buildStationInfo();
    this._bootNotificationMessage = {
      chargePointModel: this._stationInfo.chargePointModel,
      chargePointVendor: this._stationInfo.chargePointVendor,
      ...!Utils.isUndefined(this._stationInfo.chargeBoxSerialNumberPrefix) && { chargeBoxSerialNumber: this._stationInfo.chargeBoxSerialNumberPrefix },
      ...!Utils.isUndefined(this._stationInfo.firmwareVersion) && { firmwareVersion: this._stationInfo.firmwareVersion },
    };
    this._configuration = this._getConfiguration();
    this._supervisionUrl = this._getSupervisionURL();
    this._wsConnectionUrl = this._supervisionUrl + '/' + this._stationInfo.name;
    // Build connectors if needed
    const maxConnectors = this._getMaxNumberOfConnectors();
    if (maxConnectors <= 0) {
      logger.warn(`${this._logPrefix()} Charging station template ${this._stationTemplateFile} with ${maxConnectors} connectors`);
    }
    const templateMaxConnectors = this._getTemplateMaxNumberOfConnectors();
    if (templateMaxConnectors <= 0) {
      logger.warn(`${this._logPrefix()} Charging station template ${this._stationTemplateFile} with no connector configurations`);
    }
    // Sanity check
    if (maxConnectors > (this._stationInfo.Connectors[0] ? templateMaxConnectors - 1 : templateMaxConnectors) && !this._stationInfo.randomConnectors) {
      logger.warn(`${this._logPrefix()} Number of connectors exceeds the number of connector configurations in template ${this._stationTemplateFile}, forcing random connector configurations affectation`);
      this._stationInfo.randomConnectors = true;
    }
    const connectorsConfigHash = crypto.createHash('sha256').update(JSON.stringify(this._stationInfo.Connectors) + maxConnectors.toString()).digest('hex');
    // FIXME: Handle shrinking the number of connectors
    if (!this._connectors || (this._connectors && this._connectorsConfigurationHash !== connectorsConfigHash)) {
      this._connectorsConfigurationHash = connectorsConfigHash;
      // Add connector Id 0
      let lastConnector = '0';
      for (lastConnector in this._stationInfo.Connectors) {
        if (Utils.convertToInt(lastConnector) === 0 && this._stationInfo.useConnectorId0 && this._stationInfo.Connectors[lastConnector]) {
          this._connectors[lastConnector] = Utils.cloneObject(this._stationInfo.Connectors[lastConnector]) as Connector;
        }
      }
      // Generate all connectors
      if ((this._stationInfo.Connectors[0] ? templateMaxConnectors - 1 : templateMaxConnectors) > 0) {
        for (let index = 1; index <= maxConnectors; index++) {
          const randConnectorID = this._stationInfo.randomConnectors ? Utils.getRandomInt(Utils.convertToInt(lastConnector), 1) : index;
          this._connectors[index] = Utils.cloneObject(this._stationInfo.Connectors[randConnectorID]) as Connector;
        }
      }
    }
    // Avoid duplication of connectors related information
    delete this._stationInfo.Connectors;
    // Initialize transaction attributes on connectors
    for (const connector in this._connectors) {
      if (!this.getConnector(Utils.convertToInt(connector)).transactionStarted) {
        this._initTransactionOnConnector(Utils.convertToInt(connector));
      }
    }
    // OCPP parameters
    this._addConfigurationKey('NumberOfConnectors', this._getNumberOfConnectors().toString(), true);
    if (!this._getConfigurationKey('MeterValuesSampledData')) {
      this._addConfigurationKey('MeterValuesSampledData', MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER);
    }
    this._stationInfo.powerDivider = this._getPowerDivider();
    if (this.getEnableStatistics()) {
      this._statistics = Statistics.getInstance();
      this._statistics.objName = this._stationInfo.name;
      this._performanceObserver = new PerformanceObserver((list) => {
        const entry = list.getEntries()[0];
        this._statistics.logPerformance(entry, Constants.ENTITY_CHARGING_STATION);
        this._performanceObserver.disconnect();
      });
    }
  }

  get connectors(): Connectors {
    return this._connectors;
  }

  get statistics(): Statistics {
    return this._statistics;
  }

  _logPrefix(): string {
    return Utils.logPrefix(` ${this._stationInfo.name}:`);
  }

  _getConfiguration(): ChargingStationConfiguration {
    return this._stationInfo.Configuration ? this._stationInfo.Configuration : {} as ChargingStationConfiguration;
  }

  _getAuthorizationFile(): string {
    return this._stationInfo.authorizationFile && this._stationInfo.authorizationFile;
  }

  _loadAndGetAuthorizedTags(): string[] {
    let authorizedTags: string[] = [];
    const authorizationFile = this._getAuthorizationFile();
    if (authorizationFile) {
      try {
        // Load authorization file
        const fileDescriptor = fs.openSync(authorizationFile, 'r');
        authorizedTags = JSON.parse(fs.readFileSync(fileDescriptor, 'utf8')) as string[];
        fs.closeSync(fileDescriptor);
      } catch (error) {
        logger.error(this._logPrefix() + ' Authorization file ' + authorizationFile + ' loading error: %j', error);
        throw error;
      }
    } else {
      logger.info(this._logPrefix() + ' No authorization file given in template file ' + this._stationTemplateFile);
    }
    return authorizedTags;
  }

  getRandomTagId(): string {
    const index = Math.floor(Math.random() * this._authorizedTags.length);
    return this._authorizedTags[index];
  }

  hasAuthorizedTags(): boolean {
    return !Utils.isEmptyArray(this._authorizedTags);
  }

  getEnableStatistics(): boolean {
    return !Utils.isUndefined(this._stationInfo.enableStatistics) ? this._stationInfo.enableStatistics : true;
  }

  _getNumberOfPhases(): number {
    switch (this._getPowerOutType()) {
      case PowerOutType.AC:
        return !Utils.isUndefined(this._stationInfo.numberOfPhases) ? Utils.convertToInt(this._stationInfo.numberOfPhases) : 3;
      case PowerOutType.DC:
        return 0;
    }
  }

  _getNumberOfRunningTransactions(): number {
    let trxCount = 0;
    for (const connector in this._connectors) {
      if (this.getConnector(Utils.convertToInt(connector)).transactionStarted) {
        trxCount++;
      }
    }
    return trxCount;
  }

  _getPowerDivider(): number {
    let powerDivider = this._getNumberOfConnectors();
    if (this._stationInfo.powerSharedByConnectors) {
      powerDivider = this._getNumberOfRunningTransactions();
    }
    return powerDivider;
  }

  getConnector(id: number): Connector {
    return this._connectors[id];
  }

  _getTemplateMaxNumberOfConnectors(): number {
    return Object.keys(this._stationInfo.Connectors).length;
  }

  _getMaxNumberOfConnectors(): number {
    let maxConnectors = 0;
    if (!Utils.isEmptyArray(this._stationInfo.numberOfConnectors)) {
      const numberOfConnectors = this._stationInfo.numberOfConnectors as number[];
      // Distribute evenly the number of connectors
      maxConnectors = numberOfConnectors[(this._index - 1) % numberOfConnectors.length];
    } else if (!Utils.isUndefined(this._stationInfo.numberOfConnectors)) {
      maxConnectors = this._stationInfo.numberOfConnectors as number;
    } else {
      maxConnectors = this._stationInfo.Connectors[0] ? this._getTemplateMaxNumberOfConnectors() - 1 : this._getTemplateMaxNumberOfConnectors();
    }
    return maxConnectors;
  }

  _getNumberOfConnectors(): number {
    return this._connectors[0] ? Object.keys(this._connectors).length - 1 : Object.keys(this._connectors).length;
  }

  _getVoltageOut(): number {
    const errMsg = `${this._logPrefix()} Unknown ${this._getPowerOutType()} powerOutType in template file ${this._stationTemplateFile}, cannot define default voltage out`;
    let defaultVoltageOut: number;
    switch (this._getPowerOutType()) {
      case PowerOutType.AC:
        defaultVoltageOut = 230;
        break;
      case PowerOutType.DC:
        defaultVoltageOut = 400;
        break;
      default:
        logger.error(errMsg);
        throw Error(errMsg);
    }
    return !Utils.isUndefined(this._stationInfo.voltageOut) ? Utils.convertToInt(this._stationInfo.voltageOut) : defaultVoltageOut;
  }

  _getTransactionidTag(transactionId: number): string {
    for (const connector in this._connectors) {
      if (this.getConnector(Utils.convertToInt(connector)).transactionId === transactionId) {
        return this.getConnector(Utils.convertToInt(connector)).idTag;
      }
    }
  }

  _getPowerOutType(): PowerOutType {
    return !Utils.isUndefined(this._stationInfo.powerOutType) ? this._stationInfo.powerOutType : PowerOutType.AC;
  }

  _getSupervisionURL(): string {
    const supervisionUrls = Utils.cloneObject(this._stationInfo.supervisionURL ? this._stationInfo.supervisionURL : Configuration.getSupervisionURLs()) as string | string[];
    let indexUrl = 0;
    if (!Utils.isEmptyArray(supervisionUrls)) {
      if (Configuration.getDistributeStationToTenantEqually()) {
        indexUrl = this._index % supervisionUrls.length;
      } else {
        // Get a random url
        indexUrl = Math.floor(Math.random() * supervisionUrls.length);
      }
      return supervisionUrls[indexUrl];
    }
    return supervisionUrls as string;
  }

  _getAuthorizeRemoteTxRequests(): boolean {
    const authorizeRemoteTxRequests = this._getConfigurationKey('AuthorizeRemoteTxRequests');
    return authorizeRemoteTxRequests ? Utils.convertToBoolean(authorizeRemoteTxRequests.value) : false;
  }

  _getLocalAuthListEnabled(): boolean {
    const localAuthListEnabled = this._getConfigurationKey('LocalAuthListEnabled');
    return localAuthListEnabled ? Utils.convertToBoolean(localAuthListEnabled.value) : false;
  }

  _startMessageSequence(): void {
    // Start heartbeat
    this._startHeartbeat();
    // Initialize connectors status
    for (const connector in this._connectors) {
      if (!this.getConnector(Utils.convertToInt(connector)).transactionStarted) {
        if (!this.getConnector(Utils.convertToInt(connector)).status && this.getConnector(Utils.convertToInt(connector)).bootStatus) {
          this.sendStatusNotification(Utils.convertToInt(connector), this.getConnector(Utils.convertToInt(connector)).bootStatus);
        } else if (!this._hasStopped && this.getConnector(Utils.convertToInt(connector)).status) {
          this.sendStatusNotification(Utils.convertToInt(connector), this.getConnector(Utils.convertToInt(connector)).status);
        } else {
          this.sendStatusNotification(Utils.convertToInt(connector), ChargePointStatus.AVAILABLE);
        }
      } else {
        this.sendStatusNotification(Utils.convertToInt(connector), ChargePointStatus.CHARGING);
      }
    }
    // Start the ATG
    if (this._stationInfo.AutomaticTransactionGenerator.enable) {
      if (!this._automaticTransactionGeneration) {
        this._automaticTransactionGeneration = new AutomaticTransactionGenerator(this);
      }
      if (this._automaticTransactionGeneration.timeToStop) {
        this._automaticTransactionGeneration.start();
      }
    }
    if (this.getEnableStatistics()) {
      this._statistics.start();
    }
  }

  async _stopMessageSequence(reason: StopTransactionReason = StopTransactionReason.NONE): Promise<void> {
    // Stop heartbeat
    this._stopHeartbeat();
    // Stop the ATG
    if (this._stationInfo.AutomaticTransactionGenerator.enable &&
      this._automaticTransactionGeneration &&
      !this._automaticTransactionGeneration.timeToStop) {
      await this._automaticTransactionGeneration.stop(reason);
    } else {
      for (const connector in this._connectors) {
        if (this.getConnector(Utils.convertToInt(connector)).transactionStarted) {
          await this.sendStopTransaction(this.getConnector(Utils.convertToInt(connector)).transactionId, reason);
        }
      }
    }
  }

  _startHeartbeat(): void {
    if (this._heartbeatInterval && this._heartbeatInterval > 0 && !this._heartbeatSetInterval) {
      this._heartbeatSetInterval = setInterval(() => {
        this.sendHeartbeat();
      }, this._heartbeatInterval);
      logger.info(this._logPrefix() + ' Heartbeat started every ' + Utils.milliSecondsToHHMMSS(this._heartbeatInterval));
    } else {
      logger.error(`${this._logPrefix()} Heartbeat interval set to ${Utils.milliSecondsToHHMMSS(this._heartbeatInterval)}, not starting the heartbeat`);
    }
  }

  _stopHeartbeat(): void {
    if (this._heartbeatSetInterval) {
      clearInterval(this._heartbeatSetInterval);
      this._heartbeatSetInterval = null;
    }
  }

  _startAuthorizationFileMonitoring(): void {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    fs.watchFile(this._getAuthorizationFile(), (current, previous) => {
      try {
        logger.debug(this._logPrefix() + ' Authorization file ' + this._getAuthorizationFile() + ' have changed, reload');
        // Initialize _authorizedTags
        this._authorizedTags = this._loadAndGetAuthorizedTags();
      } catch (error) {
        logger.error(this._logPrefix() + ' Authorization file monitoring error: %j', error);
      }
    });
  }

  _startStationTemplateFileMonitoring(): void {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    fs.watchFile(this._stationTemplateFile, (current, previous) => {
      try {
        logger.debug(this._logPrefix() + ' Template file ' + this._stationTemplateFile + ' have changed, reload');
        // Initialize
        this._initialize();
        if (!this._stationInfo.AutomaticTransactionGenerator.enable &&
          this._automaticTransactionGeneration) {
          this._automaticTransactionGeneration.stop().catch(() => { });
        }
      } catch (error) {
        logger.error(this._logPrefix() + ' Charging station template file monitoring error: %j', error);
      }
    });
  }

  _startMeterValues(connectorId: number, interval: number): void {
    if (!this.getConnector(connectorId).transactionStarted) {
      logger.error(`${this._logPrefix()} Trying to start MeterValues on connector Id ${connectorId} with no transaction started`);
      return;
    } else if (this.getConnector(connectorId).transactionStarted && !this.getConnector(connectorId).transactionId) {
      logger.error(`${this._logPrefix()} Trying to start MeterValues on connector Id ${connectorId} with no transaction id`);
      return;
    }
    if (interval > 0) {
      this.getConnector(connectorId).transactionSetInterval = setInterval(async () => {
        if (this.getEnableStatistics()) {
          const sendMeterValues = performance.timerify(this.sendMeterValues);
          this._performanceObserver.observe({
            entryTypes: ['function'],
          });
          await sendMeterValues(connectorId, interval, this);
        } else {
          await this.sendMeterValues(connectorId, interval, this);
        }
      }, interval);
    } else {
      logger.error(`${this._logPrefix()} Charging station MeterValueSampleInterval configuration set to ${Utils.milliSecondsToHHMMSS(interval)}, not sending MeterValues`);
    }
  }

  start(): void {
    if (!this._wsConnectionUrl) {
      this._wsConnectionUrl = this._supervisionUrl + '/' + this._stationInfo.name;
    }
    this._wsConnection = new WebSocket(this._wsConnectionUrl, 'ocpp' + Constants.OCPP_VERSION_16);
    logger.info(this._logPrefix() + ' Will communicate through URL ' + this._supervisionUrl);
    // Monitor authorization file
    this._startAuthorizationFileMonitoring();
    // Monitor station template file
    this._startStationTemplateFileMonitoring();
    // Handle Socket incoming messages
    this._wsConnection.on('message', this.onMessage.bind(this));
    // Handle Socket error
    this._wsConnection.on('error', this.onError.bind(this));
    // Handle Socket close
    this._wsConnection.on('close', this.onClose.bind(this));
    // Handle Socket opening connection
    this._wsConnection.on('open', this.onOpen.bind(this));
    // Handle Socket ping
    this._wsConnection.on('ping', this.onPing.bind(this));
  }

  async stop(reason: StopTransactionReason = StopTransactionReason.NONE): Promise<void> {
    // Stop
    await this._stopMessageSequence(reason);
    // eslint-disable-next-line guard-for-in
    for (const connector in this._connectors) {
      await this.sendStatusNotification(Utils.convertToInt(connector), ChargePointStatus.UNAVAILABLE);
    }
    if (this._wsConnection && this._wsConnection.readyState === WebSocket.OPEN) {
      this._wsConnection.close();
    }
    this._hasStopped = true;
  }

  _reconnect(error): void {
    logger.error(this._logPrefix() + ' Socket: abnormally closed %j', error);
    // Stop the ATG if needed
    if (this._stationInfo.AutomaticTransactionGenerator.enable &&
      this._stationInfo.AutomaticTransactionGenerator.stopOnConnectionFailure &&
      this._automaticTransactionGeneration &&
      !this._automaticTransactionGeneration.timeToStop) {
      this._automaticTransactionGeneration.stop().catch(() => { });
    }
    // Stop heartbeat
    this._stopHeartbeat();
    if (this._autoReconnectTimeout !== 0 &&
      (this._autoReconnectRetryCount < this._autoReconnectMaxRetries || this._autoReconnectMaxRetries === -1)) {
      logger.error(`${this._logPrefix()} Socket: connection retry with timeout ${this._autoReconnectTimeout}ms`);
      this._autoReconnectRetryCount++;
      setTimeout(() => {
        logger.error(this._logPrefix() + ' Socket: reconnecting try #' + this._autoReconnectRetryCount.toString());
        this.start();
      }, this._autoReconnectTimeout);
    } else if (this._autoReconnectTimeout !== 0 || this._autoReconnectMaxRetries !== -1) {
      logger.error(`${this._logPrefix()} Socket: max retries reached (${this._autoReconnectRetryCount}) or retry disabled (${this._autoReconnectTimeout})`);
    }
  }

  onOpen(): void {
    logger.info(`${this._logPrefix()} Is connected to server through ${this._wsConnectionUrl}`);
    if (!this._hasSocketRestarted) {
      // Send BootNotification
      this.sendBootNotification();
    }
    if (this._hasSocketRestarted) {
      this._startMessageSequence();
      if (!Utils.isEmptyArray(this._messageQueue)) {
        this._messageQueue.forEach((message) => {
          if (this._wsConnection && this._wsConnection.readyState === WebSocket.OPEN) {
            this._wsConnection.send(message);
          }
        });
      }
    }
    this._autoReconnectRetryCount = 0;
    this._hasSocketRestarted = false;
  }

  onError(error): void {
    switch (error) {
      case 'ECONNREFUSED':
        this._hasSocketRestarted = true;
        this._reconnect(error);
        break;
      default:
        logger.error(this._logPrefix() + ' Socket error: %j', error);
        break;
    }
  }

  onClose(error): void {
    switch (error) {
      case 1000: // Normal close
      case 1005:
        logger.info(this._logPrefix() + ' Socket normally closed %j', error);
        this._autoReconnectRetryCount = 0;
        break;
      default: // Abnormal close
        this._hasSocketRestarted = true;
        this._reconnect(error);
        break;
    }
  }

  onPing(): void {
    logger.debug(this._logPrefix() + ' Has received a WS ping (rfc6455) from the server');
  }

  async onMessage(message): Promise<void> {
    let [messageType, messageId, commandName, commandPayload, errorDetails] = [0, '', Constants.ENTITY_CHARGING_STATION, '', ''];
    try {
      // Parse the message
      [messageType, messageId, commandName, commandPayload, errorDetails] = JSON.parse(message);

      // Check the Type of message
      switch (messageType) {
        // Incoming Message
        case Constants.OCPP_JSON_CALL_MESSAGE:
          if (this.getEnableStatistics()) {
            this._statistics.addMessage(commandName, messageType);
          }
          // Process the call
          await this.handleRequest(messageId, commandName, commandPayload);
          break;
        // Outcome Message
        case Constants.OCPP_JSON_CALL_RESULT_MESSAGE:
          // Respond
          // eslint-disable-next-line no-case-declarations
          let responseCallback; let requestPayload;
          if (Utils.isIterable(this._requests[messageId])) {
            [responseCallback, , requestPayload] = this._requests[messageId];
          } else {
            throw new Error(`Response request for message id ${messageId} is not iterable`);
          }
          if (!responseCallback) {
            // Error
            throw new Error(`Response request for unknown message id ${messageId}`);
          }
          delete this._requests[messageId];
          responseCallback(commandName, requestPayload);
          break;
        // Error Message
        case Constants.OCPP_JSON_CALL_ERROR_MESSAGE:
          if (!this._requests[messageId]) {
            // Error
            throw new Error(`Error request for unknown message id ${messageId}`);
          }
          // eslint-disable-next-line no-case-declarations
          let rejectCallback;
          if (Utils.isIterable(this._requests[messageId])) {
            [, rejectCallback] = this._requests[messageId];
          } else {
            throw new Error(`Error request for message id ${messageId} is not iterable`);
          }
          delete this._requests[messageId];
          rejectCallback(new OCPPError(commandName, commandPayload, errorDetails));
          break;
        // Error
        default:
          // eslint-disable-next-line no-case-declarations
          const errMsg = `${this._logPrefix()} Wrong message type ${messageType}`;
          logger.error(errMsg);
          throw new Error(errMsg);
      }
    } catch (error) {
      // Log
      logger.error('%s Incoming message %j processing error %s on request content type %s', this._logPrefix(), message, error, this._requests[messageId]);
      // Send error
      await this.sendError(messageId, error, commandName);
    }
  }

  async sendHeartbeat(): Promise<void> {
    try {
      const payload = {
        currentTime: new Date().toISOString(),
      };
      await this.sendMessage(Utils.generateUUID(), payload, Constants.OCPP_JSON_CALL_MESSAGE, 'Heartbeat');
    } catch (error) {
      logger.error(this._logPrefix() + ' Send Heartbeat error: %j', error);
      throw error;
    }
  }

  async sendBootNotification(): Promise<void> {
    try {
      await this.sendMessage(Utils.generateUUID(), this._bootNotificationMessage, Constants.OCPP_JSON_CALL_MESSAGE, 'BootNotification');
    } catch (error) {
      logger.error(this._logPrefix() + ' Send BootNotification error: %j', error);
      throw error;
    }
  }

  async sendStatusNotification(connectorId: number, status: ChargePointStatus, errorCode: ChargePointErrorCode = ChargePointErrorCode.NO_ERROR): Promise<void> {
    this.getConnector(connectorId).status = status;
    try {
      const payload = {
        connectorId,
        errorCode,
        status,
      };
      await this.sendMessage(Utils.generateUUID(), payload, Constants.OCPP_JSON_CALL_MESSAGE, 'StatusNotification');
    } catch (error) {
      logger.error(this._logPrefix() + ' Send StatusNotification error: %j', error);
      throw error;
    }
  }

  async sendStartTransaction(connectorId: number, idTag?: string): Promise<StartTransactionResponse> {
    try {
      const payload = {
        connectorId,
        ...!Utils.isUndefined(idTag) ? { idTag } : { idTag: Constants.TRANSACTION_DEFAULT_IDTAG },
        meterStart: 0,
        timestamp: new Date().toISOString(),
      };
      return await this.sendMessage(Utils.generateUUID(), payload, Constants.OCPP_JSON_CALL_MESSAGE, 'StartTransaction') as StartTransactionResponse;
    } catch (error) {
      logger.error(this._logPrefix() + ' Send StartTransaction error: %j', error);
      throw error;
    }
  }

  async sendStopTransaction(transactionId: number, reason: StopTransactionReason = StopTransactionReason.NONE): Promise<StopTransactionResponse> {
    const idTag = this._getTransactionidTag(transactionId);
    try {
      const payload = {
        transactionId,
        ...!Utils.isUndefined(idTag) && { idTag: idTag },
        meterStop: 0,
        timestamp: new Date().toISOString(),
        ...reason && { reason },
      };
      return await this.sendMessage(Utils.generateUUID(), payload, Constants.OCPP_JSON_CALL_MESSAGE, 'StopTransaction') as StartTransactionResponse;
    } catch (error) {
      logger.error(this._logPrefix() + ' Send StopTransaction error: %j', error);
      throw error;
    }
  }

  // eslint-disable-next-line consistent-this
  async sendMeterValues(connectorId: number, interval: number, self: ChargingStation, debug = false): Promise<void> {
    try {
      const sampledValues: {
        timestamp: string;
        sampledValue: MeterValue[];
      } = {
        timestamp: new Date().toISOString(),
        sampledValue: [],
      };
      const meterValuesTemplate = self.getConnector(connectorId).MeterValues;
      for (let index = 0; index < meterValuesTemplate.length; index++) {
        const connector = self.getConnector(connectorId);
        // SoC measurand
        if (meterValuesTemplate[index].measurand && meterValuesTemplate[index].measurand === MeterValueMeasurand.STATE_OF_CHARGE && self._getConfigurationKey('MeterValuesSampledData').value.includes(MeterValueMeasurand.STATE_OF_CHARGE)) {
          sampledValues.sampledValue.push({
            ...!Utils.isUndefined(meterValuesTemplate[index].unit) ? { unit: meterValuesTemplate[index].unit } : { unit: MeterValueUnit.PERCENT },
            ...!Utils.isUndefined(meterValuesTemplate[index].context) && { context: meterValuesTemplate[index].context },
            measurand: meterValuesTemplate[index].measurand,
            ...!Utils.isUndefined(meterValuesTemplate[index].location) ? { location: meterValuesTemplate[index].location } : { location: MeterValueLocation.EV },
            ...!Utils.isUndefined(meterValuesTemplate[index].value) ? { value: meterValuesTemplate[index].value } : { value: Utils.getRandomInt(100).toString() },
          });
          const sampledValuesIndex = sampledValues.sampledValue.length - 1;
          if (Utils.convertToInt(sampledValues.sampledValue[sampledValuesIndex].value) > 100 || debug) {
            logger.error(`${self._logPrefix()} MeterValues measurand ${sampledValues.sampledValue[sampledValuesIndex].measurand ? sampledValues.sampledValue[sampledValuesIndex].measurand : MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: connectorId ${connectorId}, transaction ${connector.transactionId}, value: ${sampledValues.sampledValue[sampledValuesIndex].value}/100`);
          }
        // Voltage measurand
        } else if (meterValuesTemplate[index].measurand && meterValuesTemplate[index].measurand === MeterValueMeasurand.VOLTAGE && self._getConfigurationKey('MeterValuesSampledData').value.includes(MeterValueMeasurand.VOLTAGE)) {
          const voltageMeasurandValue = Utils.getRandomFloatRounded(self._getVoltageOut() + self._getVoltageOut() * 0.1, self._getVoltageOut() - self._getVoltageOut() * 0.1);
          sampledValues.sampledValue.push({
            ...!Utils.isUndefined(meterValuesTemplate[index].unit) ? { unit: meterValuesTemplate[index].unit } : { unit: MeterValueUnit.VOLT },
            ...!Utils.isUndefined(meterValuesTemplate[index].context) && { context: meterValuesTemplate[index].context },
            measurand: meterValuesTemplate[index].measurand,
            ...!Utils.isUndefined(meterValuesTemplate[index].location) && { location: meterValuesTemplate[index].location },
            ...!Utils.isUndefined(meterValuesTemplate[index].value) ? { value: meterValuesTemplate[index].value } : { value: voltageMeasurandValue.toString() },
          });
          for (let phase = 1; self._getNumberOfPhases() === 3 && phase <= self._getNumberOfPhases(); phase++) {
            const voltageValue = Utils.convertToFloat(sampledValues.sampledValue[sampledValues.sampledValue.length - 1].value);
            let phaseValue: string;
            if (voltageValue >= 0 && voltageValue <= 250) {
              phaseValue = `L${phase}-N`;
            } else if (voltageValue > 250) {
              phaseValue = `L${phase}-L${(phase + 1) % self._getNumberOfPhases() !== 0 ? (phase + 1) % self._getNumberOfPhases() : self._getNumberOfPhases()}`;
            }
            sampledValues.sampledValue.push({
              ...!Utils.isUndefined(meterValuesTemplate[index].unit) ? { unit: meterValuesTemplate[index].unit } : { unit: MeterValueUnit.VOLT },
              ...!Utils.isUndefined(meterValuesTemplate[index].context) && { context: meterValuesTemplate[index].context },
              measurand: meterValuesTemplate[index].measurand,
              ...!Utils.isUndefined(meterValuesTemplate[index].location) && { location: meterValuesTemplate[index].location },
              ...!Utils.isUndefined(meterValuesTemplate[index].value) ? { value: meterValuesTemplate[index].value } : { value: voltageMeasurandValue.toString() },
              phase: phaseValue as MeterValuePhase,
            });
          }
        // Power.Active.Import measurand
        } else if (meterValuesTemplate[index].measurand && meterValuesTemplate[index].measurand === MeterValueMeasurand.POWER_ACTIVE_IMPORT && self._getConfigurationKey('MeterValuesSampledData').value.includes(MeterValueMeasurand.POWER_ACTIVE_IMPORT)) {
          // FIXME: factor out powerDivider checks
          if (Utils.isUndefined(self._stationInfo.powerDivider)) {
            const errMsg = `${self._logPrefix()} MeterValues measurand ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: powerDivider is undefined`;
            logger.error(errMsg);
            throw Error(errMsg);
          } else if (self._stationInfo.powerDivider && self._stationInfo.powerDivider <= 0) {
            const errMsg = `${self._logPrefix()} MeterValues measurand ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: powerDivider have zero or below value ${self._stationInfo.powerDivider}`;
            logger.error(errMsg);
            throw Error(errMsg);
          }
          const errMsg = `${self._logPrefix()} MeterValues measurand ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: Unknown ${self._getPowerOutType()} powerOutType in template file ${self._stationTemplateFile}, cannot calculate ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER} measurand value`;
          const powerMeasurandValues = {} as MeasurandValues;
          const maxPower = Math.round(self._stationInfo.maxPower / self._stationInfo.powerDivider);
          const maxPowerPerPhase = Math.round((self._stationInfo.maxPower / self._stationInfo.powerDivider) / self._getNumberOfPhases());
          switch (self._getPowerOutType()) {
            case PowerOutType.AC:
              if (Utils.isUndefined(meterValuesTemplate[index].value)) {
                powerMeasurandValues.L1 = Utils.getRandomFloatRounded(maxPowerPerPhase);
                powerMeasurandValues.L2 = 0;
                powerMeasurandValues.L3 = 0;
                if (self._getNumberOfPhases() === 3) {
                  powerMeasurandValues.L2 = Utils.getRandomFloatRounded(maxPowerPerPhase);
                  powerMeasurandValues.L3 = Utils.getRandomFloatRounded(maxPowerPerPhase);
                }
                powerMeasurandValues.allPhases = Utils.roundTo(powerMeasurandValues.L1 + powerMeasurandValues.L2 + powerMeasurandValues.L3, 2);
              }
              break;
            case PowerOutType.DC:
              if (Utils.isUndefined(meterValuesTemplate[index].value)) {
                powerMeasurandValues.allPhases = Utils.getRandomFloatRounded(maxPower);
              }
              break;
            default:
              logger.error(errMsg);
              throw Error(errMsg);
          }
          sampledValues.sampledValue.push({
            ...!Utils.isUndefined(meterValuesTemplate[index].unit) ? { unit: meterValuesTemplate[index].unit } : { unit: MeterValueUnit.WATT },
            ...!Utils.isUndefined(meterValuesTemplate[index].context) && { context: meterValuesTemplate[index].context },
            measurand: meterValuesTemplate[index].measurand,
            ...!Utils.isUndefined(meterValuesTemplate[index].location) && { location: meterValuesTemplate[index].location },
            ...!Utils.isUndefined(meterValuesTemplate[index].value) ? { value: meterValuesTemplate[index].value } : { value: powerMeasurandValues.allPhases.toString() },
          });
          const sampledValuesIndex = sampledValues.sampledValue.length - 1;
          if (Utils.convertToFloat(sampledValues.sampledValue[sampledValuesIndex].value) > maxPower || debug) {
            logger.error(`${self._logPrefix()} MeterValues measurand ${sampledValues.sampledValue[sampledValuesIndex].measurand ? sampledValues.sampledValue[sampledValuesIndex].measurand : MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: connectorId ${connectorId}, transaction ${connector.transactionId}, value: ${sampledValues.sampledValue[sampledValuesIndex].value}/${maxPower}`);
          }
          for (let phase = 1; self._getNumberOfPhases() === 3 && phase <= self._getNumberOfPhases(); phase++) {
            const phaseValue = `L${phase}-N`;
            sampledValues.sampledValue.push({
              ...!Utils.isUndefined(meterValuesTemplate[index].unit) ? { unit: meterValuesTemplate[index].unit } : { unit: MeterValueUnit.WATT },
              ...!Utils.isUndefined(meterValuesTemplate[index].context) && { context: meterValuesTemplate[index].context },
              ...!Utils.isUndefined(meterValuesTemplate[index].measurand) && { measurand: meterValuesTemplate[index].measurand },
              ...!Utils.isUndefined(meterValuesTemplate[index].location) && { location: meterValuesTemplate[index].location },
              ...!Utils.isUndefined(meterValuesTemplate[index].value) ? { value: meterValuesTemplate[index].value } : { value: powerMeasurandValues[`L${phase}`] as string },
              phase: phaseValue as MeterValuePhase,
            });
          }
        // Current.Import measurand
        } else if (meterValuesTemplate[index].measurand && meterValuesTemplate[index].measurand === MeterValueMeasurand.CURRENT_IMPORT && self._getConfigurationKey('MeterValuesSampledData').value.includes(MeterValueMeasurand.CURRENT_IMPORT)) {
          // FIXME: factor out powerDivider checks
          if (Utils.isUndefined(self._stationInfo.powerDivider)) {
            const errMsg = `${self._logPrefix()} MeterValues measurand ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: powerDivider is undefined`;
            logger.error(errMsg);
            throw Error(errMsg);
          } else if (self._stationInfo.powerDivider && self._stationInfo.powerDivider <= 0) {
            const errMsg = `${self._logPrefix()} MeterValues measurand ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: powerDivider have zero or below value ${self._stationInfo.powerDivider}`;
            logger.error(errMsg);
            throw Error(errMsg);
          }
          const errMsg = `${self._logPrefix()} MeterValues measurand ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: Unknown ${self._getPowerOutType()} powerOutType in template file ${self._stationTemplateFile}, cannot calculate ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER} measurand value`;
          const currentMeasurandValues: MeasurandValues = {} as MeasurandValues;
          let maxAmperage: number;
          switch (self._getPowerOutType()) {
            case PowerOutType.AC:
              maxAmperage = ElectricUtils.ampPerPhaseFromPower(self._getNumberOfPhases(), self._stationInfo.maxPower / self._stationInfo.powerDivider, self._getVoltageOut());
              if (Utils.isUndefined(meterValuesTemplate[index].value)) {
                currentMeasurandValues.L1 = Utils.getRandomFloatRounded(maxAmperage);
                currentMeasurandValues.L2 = 0;
                currentMeasurandValues.L3 = 0;
                if (self._getNumberOfPhases() === 3) {
                  currentMeasurandValues.L2 = Utils.getRandomFloatRounded(maxAmperage);
                  currentMeasurandValues.L3 = Utils.getRandomFloatRounded(maxAmperage);
                }
                currentMeasurandValues.allPhases = Utils.roundTo((currentMeasurandValues.L1 + currentMeasurandValues.L2 + currentMeasurandValues.L3) / self._getNumberOfPhases(), 2);
              }
              break;
            case PowerOutType.DC:
              maxAmperage = ElectricUtils.ampTotalFromPower(self._stationInfo.maxPower / self._stationInfo.powerDivider, self._getVoltageOut());
              if (Utils.isUndefined(meterValuesTemplate[index].value)) {
                currentMeasurandValues.allPhases = Utils.getRandomFloatRounded(maxAmperage);
              }
              break;
            default:
              logger.error(errMsg);
              throw Error(errMsg);
          }
          sampledValues.sampledValue.push({
            ...!Utils.isUndefined(meterValuesTemplate[index].unit) ? { unit: meterValuesTemplate[index].unit } : { unit: MeterValueUnit.AMP },
            ...!Utils.isUndefined(meterValuesTemplate[index].context) && { context: meterValuesTemplate[index].context },
            measurand: meterValuesTemplate[index].measurand,
            ...!Utils.isUndefined(meterValuesTemplate[index].location) && { location: meterValuesTemplate[index].location },
            ...!Utils.isUndefined(meterValuesTemplate[index].value) ? { value: meterValuesTemplate[index].value } : { value: currentMeasurandValues.allPhases.toString() },
          });
          const sampledValuesIndex = sampledValues.sampledValue.length - 1;
          if (Utils.convertToFloat(sampledValues.sampledValue[sampledValuesIndex].value) > maxAmperage || debug) {
            logger.error(`${self._logPrefix()} MeterValues measurand ${sampledValues.sampledValue[sampledValuesIndex].measurand ? sampledValues.sampledValue[sampledValuesIndex].measurand : MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: connectorId ${connectorId}, transaction ${connector.transactionId}, value: ${sampledValues.sampledValue[sampledValuesIndex].value}/${maxAmperage}`);
          }
          for (let phase = 1; self._getNumberOfPhases() === 3 && phase <= self._getNumberOfPhases(); phase++) {
            const phaseValue = `L${phase}`;
            sampledValues.sampledValue.push({
              ...!Utils.isUndefined(meterValuesTemplate[index].unit) ? { unit: meterValuesTemplate[index].unit } : { unit: MeterValueUnit.AMP },
              ...!Utils.isUndefined(meterValuesTemplate[index].context) && { context: meterValuesTemplate[index].context },
              ...!Utils.isUndefined(meterValuesTemplate[index].measurand) && { measurand: meterValuesTemplate[index].measurand },
              ...!Utils.isUndefined(meterValuesTemplate[index].location) && { location: meterValuesTemplate[index].location },
              ...!Utils.isUndefined(meterValuesTemplate[index].value) ? { value: meterValuesTemplate[index].value } : { value: currentMeasurandValues[phaseValue] as string },
              phase: phaseValue as MeterValuePhase,
            });
          }
        // Energy.Active.Import.Register measurand (default)
        } else if (!meterValuesTemplate[index].measurand || meterValuesTemplate[index].measurand === MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER) {
          // FIXME: factor out powerDivider checks
          if (Utils.isUndefined(self._stationInfo.powerDivider)) {
            const errMsg = `${self._logPrefix()} MeterValues measurand ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: powerDivider is undefined`;
            logger.error(errMsg);
            throw Error(errMsg);
          } else if (self._stationInfo.powerDivider && self._stationInfo.powerDivider <= 0) {
            const errMsg = `${self._logPrefix()} MeterValues measurand ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: powerDivider have zero or below value ${self._stationInfo.powerDivider}`;
            logger.error(errMsg);
            throw Error(errMsg);
          }
          if (Utils.isUndefined(meterValuesTemplate[index].value)) {
            const measurandValue = Utils.getRandomInt(self._stationInfo.maxPower / (self._stationInfo.powerDivider * 3600000) * interval);
            // Persist previous value in connector
            if (connector && !Utils.isNullOrUndefined(connector.lastEnergyActiveImportRegisterValue) && connector.lastEnergyActiveImportRegisterValue >= 0) {
              connector.lastEnergyActiveImportRegisterValue += measurandValue;
            } else {
              connector.lastEnergyActiveImportRegisterValue = 0;
            }
          }
          sampledValues.sampledValue.push({
            ...!Utils.isUndefined(meterValuesTemplate[index].unit) ? { unit: meterValuesTemplate[index].unit } : { unit: MeterValueUnit.WATT_HOUR },
            ...!Utils.isUndefined(meterValuesTemplate[index].context) && { context: meterValuesTemplate[index].context },
            ...!Utils.isUndefined(meterValuesTemplate[index].measurand) && { measurand: meterValuesTemplate[index].measurand },
            ...!Utils.isUndefined(meterValuesTemplate[index].location) && { location: meterValuesTemplate[index].location },
            ...!Utils.isUndefined(meterValuesTemplate[index].value) ? { value: meterValuesTemplate[index].value } :
              { value: connector.lastEnergyActiveImportRegisterValue.toString() },
          });
          const sampledValuesIndex = sampledValues.sampledValue.length - 1;
          const maxConsumption = Math.round(self._stationInfo.maxPower * 3600 / (self._stationInfo.powerDivider * interval));
          if (Utils.convertToFloat(sampledValues.sampledValue[sampledValuesIndex].value) > maxConsumption || debug) {
            logger.error(`${self._logPrefix()} MeterValues measurand ${sampledValues.sampledValue[sampledValuesIndex].measurand ? sampledValues.sampledValue[sampledValuesIndex].measurand : MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: connectorId ${connectorId}, transaction ${connector.transactionId}, value: ${sampledValues.sampledValue[sampledValuesIndex].value}/${maxConsumption}`);
          }
        // Unsupported measurand
        } else {
          logger.info(`${self._logPrefix()} Unsupported MeterValues measurand ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER} on connectorId ${connectorId}`);
        }
      }

      const payload = {
        connectorId,
        transactionId: self.getConnector(connectorId).transactionId,
        meterValue: sampledValues,
      };
      await self.sendMessage(Utils.generateUUID(), payload, Constants.OCPP_JSON_CALL_MESSAGE, 'MeterValues');
    } catch (error) {
      logger.error(self._logPrefix() + ' Send MeterValues error: %j', error);
      throw error;
    }
  }

  async sendError(messageId: string, err: Error | OCPPError, commandName: string): Promise<unknown> {
    // Check exception type: only OCPP error are accepted
    const error = err instanceof OCPPError ? err : new OCPPError(Constants.OCPP_ERROR_INTERNAL_ERROR, err.message, err.stack && err.stack);
    // Send error
    return this.sendMessage(messageId, error, Constants.OCPP_JSON_CALL_ERROR_MESSAGE, commandName);
  }

  async sendMessage(messageId: string, commandParams, messageType = Constants.OCPP_JSON_CALL_RESULT_MESSAGE, commandName: string): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    // Send a message through wsConnection
    return new Promise((resolve, reject) => {
      let messageToSend;
      // Type of message
      switch (messageType) {
        // Request
        case Constants.OCPP_JSON_CALL_MESSAGE:
          // Build request
          this._requests[messageId] = [responseCallback, rejectCallback, commandParams];
          messageToSend = JSON.stringify([messageType, messageId, commandName, commandParams]);
          break;
        // Response
        case Constants.OCPP_JSON_CALL_RESULT_MESSAGE:
          // Build response
          messageToSend = JSON.stringify([messageType, messageId, commandParams]);
          break;
        // Error Message
        case Constants.OCPP_JSON_CALL_ERROR_MESSAGE:
          // Build Error Message
          messageToSend = JSON.stringify([messageType, messageId, commandParams.code ? commandParams.code : Constants.OCPP_ERROR_GENERIC_ERROR, commandParams.message ? commandParams.message : '', commandParams.details ? commandParams.details : {}]);
          break;
      }
      // Check if wsConnection is ready
      if (this._wsConnection && this._wsConnection.readyState === WebSocket.OPEN) {
        if (this.getEnableStatistics()) {
          this._statistics.addMessage(commandName, messageType);
        }
        // Yes: Send Message
        this._wsConnection.send(messageToSend);
      } else {
        let dups = false;
        // Handle dups in buffer
        for (const message of this._messageQueue) {
          // Same message
          if (JSON.stringify(messageToSend) === JSON.stringify(message)) {
            dups = true;
            break;
          }
        }
        if (!dups) {
          // Buffer message
          this._messageQueue.push(messageToSend);
        }
        // Reject it
        return rejectCallback(new OCPPError(commandParams.code ? commandParams.code : Constants.OCPP_ERROR_GENERIC_ERROR, commandParams.message ? commandParams.message : `Web socket closed for message id '${messageId}' with content '${messageToSend}', message buffered`, commandParams.details ? commandParams.details : {}));
      }
      // Response?
      if (messageType === Constants.OCPP_JSON_CALL_RESULT_MESSAGE) {
        // Yes: send Ok
        resolve();
      } else if (messageType === Constants.OCPP_JSON_CALL_ERROR_MESSAGE) {
        // Send timeout
        setTimeout(() => rejectCallback(new OCPPError(commandParams.code ? commandParams.code : Constants.OCPP_ERROR_GENERIC_ERROR, commandParams.message ? commandParams.message : `Timeout for message id '${messageId}' with content '${messageToSend}'`, commandParams.details ? commandParams.details : {})), Constants.OCPP_SOCKET_TIMEOUT);
      }

      // Function that will receive the request's response
      function responseCallback(payload, requestPayload): void {
        if (self.getEnableStatistics()) {
          self._statistics.addMessage(commandName, messageType);
        }
        // Send the response
        self.handleResponse(commandName, payload, requestPayload);
        resolve(payload);
      }

      // Function that will receive the request's rejection
      function rejectCallback(error: OCPPError): void {
        if (self.getEnableStatistics()) {
          self._statistics.addMessage(commandName, messageType);
        }
        logger.debug(`${self._logPrefix()} Error %j occurred when calling command %s with parameters %j`, error, commandName, commandParams);
        // Build Exception
        // eslint-disable-next-line no-empty-function
        self._requests[messageId] = [() => { }, () => { }, {}]; // Properly format the request
        // Send error
        reject(error);
      }
    });
  }

  handleResponse(commandName: string, payload, requestPayload): void {
    const responseCallbackFn = 'handleResponse' + commandName;
    if (typeof this[responseCallbackFn] === 'function') {
      this[responseCallbackFn](payload, requestPayload);
    } else {
      logger.error(this._logPrefix() + ' Trying to call an undefined response callback function: ' + responseCallbackFn);
    }
  }

  handleResponseBootNotification(payload, requestPayload): void {
    if (payload.status === 'Accepted') {
      this._heartbeatInterval = payload.interval * 1000;
      this._addConfigurationKey('HeartBeatInterval', payload.interval);
      this._addConfigurationKey('HeartbeatInterval', payload.interval, false, false);
      this._startMessageSequence();
      this._hasStopped && (this._hasStopped = false);
    } else if (payload.status === 'Pending') {
      logger.info(this._logPrefix() + ' Charging station in pending state on the central server');
    } else {
      logger.info(this._logPrefix() + ' Charging station rejected by the central server');
    }
  }

  _initTransactionOnConnector(connectorId: number): void {
    this.getConnector(connectorId).transactionStarted = false;
    this.getConnector(connectorId).transactionId = null;
    this.getConnector(connectorId).idTag = null;
    this.getConnector(connectorId).lastEnergyActiveImportRegisterValue = -1;
  }

  _resetTransactionOnConnector(connectorId: number): void {
    this._initTransactionOnConnector(connectorId);
    if (this.getConnector(connectorId).transactionSetInterval) {
      clearInterval(this.getConnector(connectorId).transactionSetInterval);
    }
  }

  handleResponseStartTransaction(payload: StartTransactionResponse, requestPayload): void {
    const connectorId = Utils.convertToInt(requestPayload.connectorId);
    if (this.getConnector(connectorId).transactionStarted) {
      logger.debug(this._logPrefix() + ' Try to start a transaction on an already used connector ' + connectorId.toString() + ': %j', this.getConnector(connectorId));
      return;
    }

    let transactionConnectorId: number;
    for (const connector in this._connectors) {
      if (Utils.convertToInt(connector) === connectorId) {
        transactionConnectorId = Utils.convertToInt(connector);
        break;
      }
    }
    if (!transactionConnectorId) {
      logger.error(this._logPrefix() + ' Try to start a transaction on a non existing connector Id ' + connectorId.toString());
      return;
    }
    if (payload.idTagInfo?.status === AuthorizationStatus.ACCEPTED) {
      this.getConnector(connectorId).transactionStarted = true;
      this.getConnector(connectorId).transactionId = payload.transactionId;
      this.getConnector(connectorId).idTag = requestPayload.idTag;
      this.getConnector(connectorId).lastEnergyActiveImportRegisterValue = 0;
      this.sendStatusNotification(connectorId, ChargePointStatus.CHARGING).catch(() => { });
      logger.info(this._logPrefix() + ' Transaction ' + payload.transactionId.toString() + ' STARTED on ' + this._stationInfo.name + '#' + connectorId.toString() + ' for idTag ' + requestPayload.idTag);
      if (this._stationInfo.powerSharedByConnectors) {
        this._stationInfo.powerDivider++;
      }
      const configuredMeterValueSampleInterval = this._getConfigurationKey('MeterValueSampleInterval');
      this._startMeterValues(connectorId,
        configuredMeterValueSampleInterval ? Utils.convertToInt(configuredMeterValueSampleInterval.value) * 1000 : 60000);
    } else {
      logger.error(this._logPrefix() + ' Starting transaction id ' + payload.transactionId.toString() + ' REJECTED with status ' + payload.idTagInfo?.status + ', idTag ' + requestPayload.idTag);
      this._resetTransactionOnConnector(connectorId);
      this.sendStatusNotification(connectorId, ChargePointStatus.AVAILABLE).catch(() => { });
    }
  }

  handleResponseStopTransaction(payload: StopTransactionResponse, requestPayload): void {
    let transactionConnectorId: number;
    for (const connector in this._connectors) {
      if (this.getConnector(Utils.convertToInt(connector)).transactionId === Utils.convertToInt(requestPayload.transactionId)) {
        transactionConnectorId = Utils.convertToInt(connector);
        break;
      }
    }
    if (!transactionConnectorId) {
      logger.error(this._logPrefix() + ' Try to stop a non existing transaction ' + requestPayload.transactionId);
      return;
    }
    if (payload.idTagInfo?.status === AuthorizationStatus.ACCEPTED) {
      this.sendStatusNotification(transactionConnectorId, ChargePointStatus.AVAILABLE).catch(() => { });
      if (this._stationInfo.powerSharedByConnectors) {
        this._stationInfo.powerDivider--;
      }
      logger.info(this._logPrefix() + ' Transaction ' + requestPayload.transactionId + ' STOPPED on ' + this._stationInfo.name + '#' + transactionConnectorId.toString());
      this._resetTransactionOnConnector(transactionConnectorId);
    } else {
      logger.error(this._logPrefix() + ' Stopping transaction id ' + requestPayload.transactionId + ' REJECTED with status ' + payload.idTagInfo?.status);
    }
  }

  handleResponseStatusNotification(payload, requestPayload): void {
    logger.debug(this._logPrefix() + ' Status notification response received: %j to StatusNotification request: %j', payload, requestPayload);
  }

  handleResponseMeterValues(payload, requestPayload): void {
    logger.debug(this._logPrefix() + ' MeterValues response received: %j to MeterValues request: %j', payload, requestPayload);
  }

  handleResponseHeartbeat(payload, requestPayload): void {
    logger.debug(this._logPrefix() + ' Heartbeat response received: %j to Heartbeat request: %j', payload, requestPayload);
  }

  async handleRequest(messageId: string, commandName: string, commandPayload): Promise<void> {
    let response;
    // Call
    if (typeof this['handleRequest' + commandName] === 'function') {
      try {
        // Call the method to build the response
        response = await this['handleRequest' + commandName](commandPayload);
      } catch (error) {
        // Log
        logger.error(this._logPrefix() + ' Handle request error: %j', error);
        // Send back response to inform backend
        await this.sendError(messageId, error, commandName);
        throw error;
      }
    } else {
      // Throw exception
      await this.sendError(messageId, new OCPPError(Constants.OCPP_ERROR_NOT_IMPLEMENTED, `${commandName} is not implemented`, {}), commandName);
      throw new Error(`${commandName} is not implemented ${JSON.stringify(commandPayload, null, ' ')}`);
    }
    // Send response
    await this.sendMessage(messageId, response, Constants.OCPP_JSON_CALL_RESULT_MESSAGE, commandName);
  }

  // Simulate charging station restart
  handleRequestReset(commandPayload): DefaultRequestResponse {
    setImmediate(async () => {
      await this.stop(commandPayload.type + 'Reset' as StopTransactionReason);
      await Utils.sleep(this._stationInfo.resetTime);
      await this.start();
    });
    logger.info(`${this._logPrefix()} ${commandPayload.type} reset command received, simulating it. The station will be back online in ${Utils.milliSecondsToHHMMSS(this._stationInfo.resetTime)}`);
    return Constants.OCPP_RESPONSE_ACCEPTED;
  }

  async handleRequestUnlockConnector(commandPayload): Promise<UnlockResponse> {
    const connectorId = Utils.convertToInt(commandPayload.connectorId);
    if (connectorId === 0) {
      logger.error(this._logPrefix() + ' Try to unlock connector ' + connectorId.toString());
      return Constants.OCPP_RESPONSE_UNLOCK_NOT_SUPPORTED;
    }
    if (this.getConnector(connectorId).transactionStarted) {
      const stopResponse = await this.sendStopTransaction(this.getConnector(connectorId).transactionId, StopTransactionReason.UNLOCK_COMMAND);
      if (stopResponse.idTagInfo?.status === AuthorizationStatus.ACCEPTED) {
        return Constants.OCPP_RESPONSE_UNLOCKED;
      }
      return Constants.OCPP_RESPONSE_UNLOCK_FAILED;
    }
    await this.sendStatusNotification(connectorId, ChargePointStatus.AVAILABLE);
    return Constants.OCPP_RESPONSE_UNLOCKED;
  }

  _getConfigurationKey(key: string): ConfigurationKey {
    return this._configuration.configurationKey.find((configElement) => configElement.key === key);
  }

  _addConfigurationKey(key: string, value: string, readonly = false, visible = true, reboot = false): void {
    const keyFound = this._getConfigurationKey(key);
    if (!keyFound) {
      this._configuration.configurationKey.push({
        key,
        readonly,
        value,
        visible,
        reboot,
      });
    }
  }

  _setConfigurationKeyValue(key: string, value: string): void {
    const keyFound = this._getConfigurationKey(key);
    if (keyFound) {
      const keyIndex = this._configuration.configurationKey.indexOf(keyFound);
      this._configuration.configurationKey[keyIndex].value = value;
    }
  }

  handleRequestGetConfiguration(commandPayload): { configurationKey: ConfigurationKey[]; unknownKey: string[] } {
    const configurationKey: ConfigurationKey[] = [];
    const unknownKey: string[] = [];
    if (Utils.isEmptyArray(commandPayload.key)) {
      for (const configuration of this._configuration.configurationKey) {
        if (Utils.isUndefined(configuration.visible)) {
          configuration.visible = true;
        }
        if (!configuration.visible) {
          continue;
        }
        configurationKey.push({
          key: configuration.key,
          readonly: configuration.readonly,
          value: configuration.value,
        });
      }
    } else {
      for (const key of commandPayload.key as string[]) {
        const keyFound = this._getConfigurationKey(key);
        if (keyFound) {
          if (Utils.isUndefined(keyFound.visible)) {
            keyFound.visible = true;
          }
          if (!keyFound.visible) {
            continue;
          }
          configurationKey.push({
            key: keyFound.key,
            readonly: keyFound.readonly,
            value: keyFound.value,
          });
        } else {
          unknownKey.push(key);
        }
      }
    }
    return {
      configurationKey,
      unknownKey,
    };
  }

  handleRequestChangeConfiguration(commandPayload): ConfigurationResponse {
    const keyToChange = this._getConfigurationKey(commandPayload.key);
    if (!keyToChange) {
      return Constants.OCPP_CONFIGURATION_RESPONSE_NOT_SUPPORTED;
    } else if (keyToChange && keyToChange.readonly) {
      return Constants.OCPP_CONFIGURATION_RESPONSE_REJECTED;
    } else if (keyToChange && !keyToChange.readonly) {
      const keyIndex = this._configuration.configurationKey.indexOf(keyToChange);
      this._configuration.configurationKey[keyIndex].value = commandPayload.value;
      let triggerHeartbeatRestart = false;
      if (keyToChange.key === 'HeartBeatInterval') {
        this._setConfigurationKeyValue('HeartbeatInterval', commandPayload.value);
        triggerHeartbeatRestart = true;
      }
      if (keyToChange.key === 'HeartbeatInterval') {
        this._setConfigurationKeyValue('HeartBeatInterval', commandPayload.value);
        triggerHeartbeatRestart = true;
      }
      if (triggerHeartbeatRestart) {
        this._heartbeatInterval = Utils.convertToInt(commandPayload.value) * 1000;
        // Stop heartbeat
        this._stopHeartbeat();
        // Start heartbeat
        this._startHeartbeat();
      }
      if (keyToChange.reboot) {
        return Constants.OCPP_CONFIGURATION_RESPONSE_REBOOT_REQUIRED;
      }
      return Constants.OCPP_CONFIGURATION_RESPONSE_ACCEPTED;
    }
  }

  async handleRequestRemoteStartTransaction(commandPayload): Promise<DefaultRequestResponse> {
    const transactionConnectorID: number = commandPayload.connectorId ? Utils.convertToInt(commandPayload.connectorId) : 1;
    if (this._getAuthorizeRemoteTxRequests() && this._getLocalAuthListEnabled() && this.hasAuthorizedTags()) {
      // Check if authorized
      if (this._authorizedTags.find((value) => value === commandPayload.idTag)) {
        // Authorization successful start transaction
        await this.sendStartTransaction(transactionConnectorID, commandPayload.idTag);
        logger.debug(this._logPrefix() + ' Transaction remotely STARTED on ' + this._stationInfo.name + '#' + transactionConnectorID.toString() + ' for idTag ' + commandPayload.idTag);
        return Constants.OCPP_RESPONSE_ACCEPTED;
      }
      logger.error(this._logPrefix() + ' Remote starting transaction REJECTED with status ' + commandPayload.idTagInfo?.status + ', idTag ' + commandPayload.idTag);
      return Constants.OCPP_RESPONSE_REJECTED;
    }
    // No local authorization check required => start transaction
    await this.sendStartTransaction(transactionConnectorID, commandPayload.idTag);
    logger.debug(this._logPrefix() + ' Transaction remotely STARTED on ' + this._stationInfo.name + '#' + transactionConnectorID.toString() + ' for idTag ' + commandPayload.idTag);
    return Constants.OCPP_RESPONSE_ACCEPTED;
  }

  async handleRequestRemoteStopTransaction(commandPayload): Promise<DefaultRequestResponse> {
    const transactionId = Utils.convertToInt(commandPayload.transactionId);
    for (const connector in this._connectors) {
      if (this.getConnector(Utils.convertToInt(connector)).transactionId === transactionId) {
        await this.sendStopTransaction(transactionId);
        return Constants.OCPP_RESPONSE_ACCEPTED;
      }
    }
    logger.info(this._logPrefix() + ' Try to stop remotely a non existing transaction ' + transactionId.toString());
    return Constants.OCPP_RESPONSE_REJECTED;
  }
}

