import { PerformanceObserver, performance } from 'perf_hooks';

import AutomaticTransactionGenerator from './AutomaticTransactionGenerator';
import Configuration from '../utils/Configuration';
import Constants from '../utils/Constants.js';
import ElectricUtils from '../utils/ElectricUtils';
import { MeasurandValues } from '../types/MeasurandValues';
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
  private _stationInfo;
  private _bootNotificationMessage;
  private _connectors;
  private _configuration;
  private _connectorsConfigurationHash: string;
  private _supervisionUrl;
  private _wsConnectionUrl;
  private _wsConnection: WebSocket;
  private _isSocketRestart;
  private _autoReconnectRetryCount: number;
  private _autoReconnectMaxRetries: number;
  private _autoReconnectTimeout: number;
  private _requests;
  private _messageQueue: any[];
  private _automaticTransactionGeneration: AutomaticTransactionGenerator;
  private _authorizedTags: string[];
  private _heartbeatInterval: number;
  private _heartbeatSetInterval;
  private _statistics: Statistics;
  private _performanceObserver: PerformanceObserver;

  constructor(index: number, stationTemplateFile: string) {
    this._index = index;
    this._stationTemplateFile = stationTemplateFile;
    this._connectors = {};
    this._initialize();

    this._isSocketRestart = false;
    this._autoReconnectRetryCount = 0;
    this._autoReconnectMaxRetries = Configuration.getAutoReconnectMaxRetries(); // -1 for unlimited
    this._autoReconnectTimeout = Configuration.getAutoReconnectTimeout() * 1000; // Ms, zero for disabling

    this._requests = {};
    this._messageQueue = [];

    this._authorizedTags = this._loadAndGetAuthorizedTags();
  }

  _getStationName(stationTemplate): string {
    return stationTemplate.fixedName ? stationTemplate.baseName : stationTemplate.baseName + '-' + ('000000000' + this._index).substr(('000000000' + this._index).length - 4);
  }

  _buildStationInfo() {
    let stationTemplateFromFile;
    try {
      // Load template file
      const fileDescriptor = fs.openSync(this._stationTemplateFile, 'r');
      stationTemplateFromFile = JSON.parse(fs.readFileSync(fileDescriptor, 'utf8'));
      fs.closeSync(fileDescriptor);
    } catch (error) {
      logger.error('Template file ' + this._stationTemplateFile + ' loading error: ' + error);
      throw error;
    }
    const stationTemplate = stationTemplateFromFile || {};
    if (!Utils.isEmptyArray(stationTemplateFromFile.power)) {
      stationTemplate.maxPower = stationTemplateFromFile.power[Math.floor(Math.random() * stationTemplateFromFile.power.length)];
    } else {
      stationTemplate.maxPower = stationTemplateFromFile.power;
    }
    stationTemplate.name = this._getStationName(stationTemplateFromFile);
    stationTemplate.resetTime = stationTemplateFromFile.resetTime ? stationTemplateFromFile.resetTime * 1000 : Constants.CHARGING_STATION_DEFAULT_RESET_TIME;
    return stationTemplate;
  }

  get stationInfo() {
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
    if (maxConnectors > (this._stationInfo.Connectors[0] ? templateMaxConnectors - 1 : templateMaxConnectors) && !Utils.convertToBoolean(this._stationInfo.randomConnectors)) {
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
        if (Utils.convertToInt(lastConnector) === 0 && Utils.convertToBoolean(this._stationInfo.useConnectorId0) && this._stationInfo.Connectors[lastConnector]) {
          this._connectors[lastConnector] = Utils.cloneObject(this._stationInfo.Connectors[lastConnector]);
        }
      }
      // Generate all connectors
      if ((this._stationInfo.Connectors[0] ? templateMaxConnectors - 1 : templateMaxConnectors) > 0) {
        for (let index = 1; index <= maxConnectors; index++) {
          const randConnectorID = Utils.convertToBoolean(this._stationInfo.randomConnectors) ? Utils.getRandomInt(Utils.convertToInt(lastConnector), 1) : index;
          this._connectors[index] = Utils.cloneObject(this._stationInfo.Connectors[randConnectorID]);
        }
      }
    }
    // Avoid duplication of connectors related information
    delete this._stationInfo.Connectors;
    // Initialize transaction attributes on connectors
    for (const connector in this._connectors) {
      if (!this.getConnector(Utils.convertToInt(connector)).transactionStarted) {
        this._initTransactionOnConnector(connector);
      }
    }
    // OCPP parameters
    this._addConfigurationKey('NumberOfConnectors', this._getNumberOfConnectors(), true);
    if (!this._getConfigurationKey('MeterValuesSampledData')) {
      this._addConfigurationKey('MeterValuesSampledData', 'Energy.Active.Import.Register');
    }
    this._stationInfo.powerDivider = this._getPowerDivider();
    if (this.getEnableStatistics()) {
      this._statistics = Statistics.getInstance();
      this._statistics.objName = this._stationInfo.name;
      this._performanceObserver = new PerformanceObserver((list) => {
        const entry = list.getEntries()[0];
        this._statistics.logPerformance(entry, 'ChargingStation');
        this._performanceObserver.disconnect();
      });
    }
  }

  get connectors() {
    return this._connectors;
  }

  get statistics(): Statistics {
    return this._statistics;
  }

  _logPrefix(): string {
    return Utils.logPrefix(` ${this._stationInfo.name}:`);
  }

  _getConfiguration() {
    return this._stationInfo.Configuration ? this._stationInfo.Configuration : {};
  }

  _getAuthorizationFile() : string {
    return this._stationInfo.authorizationFile && this._stationInfo.authorizationFile;
  }

  _loadAndGetAuthorizedTags(): string[] {
    let authorizedTags: string[] = [];
    const authorizationFile = this._getAuthorizationFile();
    if (authorizationFile) {
      try {
        // Load authorization file
        const fileDescriptor = fs.openSync(authorizationFile, 'r');
        authorizedTags = JSON.parse(fs.readFileSync(fileDescriptor, 'utf8'));
        fs.closeSync(fileDescriptor);
      } catch (error) {
        logger.error(this._logPrefix() + ' Authorization file ' + authorizationFile + ' loading error: ' + error);
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
    return !Utils.isUndefined(this._stationInfo.enableStatistics) ? Utils.convertToBoolean(this._stationInfo.enableStatistics) : true;
  }

  _getNumberOfPhases(): number {
    switch (this._getPowerOutType()) {
      case 'AC':
        return !Utils.isUndefined(this._stationInfo.numberOfPhases) ? Utils.convertToInt(this._stationInfo.numberOfPhases) : 3;
      case 'DC':
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

  getConnector(id: number) {
    return this._connectors[id];
  }

  _getTemplateMaxNumberOfConnectors(): number {
    return Object.keys(this._stationInfo.Connectors).length;
  }

  _getMaxNumberOfConnectors(): number {
    let maxConnectors = 0;
    if (!Utils.isEmptyArray(this._stationInfo.numberOfConnectors)) {
      // Distribute evenly the number of connectors
      maxConnectors = this._stationInfo.numberOfConnectors[(this._index - 1) % this._stationInfo.numberOfConnectors.length];
    } else if (!Utils.isUndefined(this._stationInfo.numberOfConnectors)) {
      maxConnectors = this._stationInfo.numberOfConnectors;
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
    let defaultVoltageOut;
    switch (this._getPowerOutType()) {
      case 'AC':
        defaultVoltageOut = 230;
        break;
      case 'DC':
        defaultVoltageOut = 400;
        break;
      default:
        logger.error(errMsg);
        throw Error(errMsg);
    }
    return !Utils.isUndefined(this._stationInfo.voltageOut) ? Utils.convertToInt(this._stationInfo.voltageOut) : defaultVoltageOut;
  }

  _getPowerOutType(): string {
    return !Utils.isUndefined(this._stationInfo.powerOutType) ? this._stationInfo.powerOutType : 'AC';
  }

  _getSupervisionURL(): string {
    const supervisionUrls = Utils.cloneObject(this._stationInfo.supervisionURL ? this._stationInfo.supervisionURL : Configuration.getSupervisionURLs());
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
    return supervisionUrls;
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
        if (this.getConnector(Utils.convertToInt(connector)).bootStatus) {
          this.sendStatusNotification(Utils.convertToInt(connector), this.getConnector(Utils.convertToInt(connector)).bootStatus);
        } else {
          this.sendStatusNotification(Utils.convertToInt(connector), 'Available');
        }
      } else {
        this.sendStatusNotification(Utils.convertToInt(connector), 'Charging');
      }
    }
    // Start the ATG
    if (Utils.convertToBoolean(this._stationInfo.AutomaticTransactionGenerator.enable)) {
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

  async _stopMessageSequence(reason = ''): Promise<void> {
    // Stop heartbeat
    this._stopHeartbeat();
    // Stop the ATG
    if (Utils.convertToBoolean(this._stationInfo.AutomaticTransactionGenerator.enable) &&
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
      logger.info(this._logPrefix() + ' Heartbeat started every ' + this._heartbeatInterval.toString() + 'ms');
    } else {
      logger.error(`${this._logPrefix()} Heartbeat interval set to ${this._heartbeatInterval}ms, not starting the heartbeat`);
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
        logger.error(this._logPrefix() + ' Authorization file monitoring error: ' + error);
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
        if (!Utils.convertToBoolean(this._stationInfo.AutomaticTransactionGenerator.enable) &&
        this._automaticTransactionGeneration) {
          this._automaticTransactionGeneration.stop().catch(() => {});
        }
      } catch (error) {
        logger.error(this._logPrefix() + ' Charging station template file monitoring error: ' + error);
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
      this.getConnector(connectorId).transactionSetInterval = setInterval(async (): Promise<void> => {
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
      logger.error(`${this._logPrefix()} Charging station MeterValueSampleInterval configuration set to ${interval}ms, not sending MeterValues`);
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

  async stop(reason = ''): Promise<void> {
    // Stop
    await this._stopMessageSequence();
    // eslint-disable-next-line guard-for-in
    for (const connector in this._connectors) {
      await this.sendStatusNotification(Utils.convertToInt(connector), 'Unavailable');
    }
    if (this._wsConnection && this._wsConnection.readyState === WebSocket.OPEN) {
      this._wsConnection.close();
    }
  }

  _reconnect(error): void {
    logger.error(this._logPrefix() + ' Socket: abnormally closed', error);
    // Stop the ATG if needed
    if (Utils.convertToBoolean(this._stationInfo.AutomaticTransactionGenerator.enable) &&
      Utils.convertToBoolean(this._stationInfo.AutomaticTransactionGenerator.stopOnConnectionFailure) &&
      this._automaticTransactionGeneration &&
      !this._automaticTransactionGeneration.timeToStop) {
      this._automaticTransactionGeneration.stop();
    }
    // Stop heartbeat
    this._stopHeartbeat();
    if (this._autoReconnectTimeout !== 0 &&
      (this._autoReconnectRetryCount < this._autoReconnectMaxRetries || this._autoReconnectMaxRetries === -1)) {
      logger.error(`${this._logPrefix()} Socket: connection retry with timeout ${this._autoReconnectTimeout}ms`);
      this._autoReconnectRetryCount++;
      setTimeout(() => {
        logger.error(this._logPrefix() + ' Socket: reconnecting try #' + this._autoReconnectRetryCount);
        this.start();
      }, this._autoReconnectTimeout);
    } else if (this._autoReconnectTimeout !== 0 || this._autoReconnectMaxRetries !== -1) {
      logger.error(`${this._logPrefix()} Socket: max retries reached (${this._autoReconnectRetryCount}) or retry disabled (${this._autoReconnectTimeout})`);
    }
  }

  onOpen() {
    logger.info(`${this._logPrefix()} Is connected to server through ${this._wsConnectionUrl}`);
    if (!this._isSocketRestart) {
      // Send BootNotification
      this.sendBootNotification();
    }
    if (this._isSocketRestart) {
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
    this._isSocketRestart = false;
  }

  onError(error) {
    switch (error) {
      case 'ECONNREFUSED':
        this._isSocketRestart = true;
        this._reconnect(error);
        break;
      default:
        logger.error(this._logPrefix() + ' Socket error: ' + error);
        break;
    }
  }

  onClose(error) {
    switch (error) {
      case 1000: // Normal close
      case 1005:
        logger.info(this._logPrefix() + ' Socket normally closed ' + error);
        this._autoReconnectRetryCount = 0;
        break;
      default: // Abnormal close
        this._isSocketRestart = true;
        this._reconnect(error);
        break;
    }
  }

  onPing() {
    logger.debug(this._logPrefix() + ' Has received a WS ping (rfc6455) from the server');
  }

  async onMessage(message) {
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

  async sendHeartbeat() {
    try {
      const payload = {
        currentTime: new Date().toISOString(),
      };
      await this.sendMessage(Utils.generateUUID(), payload, Constants.OCPP_JSON_CALL_MESSAGE, 'Heartbeat');
    } catch (error) {
      logger.error(this._logPrefix() + ' Send Heartbeat error: ' + error);
      throw error;
    }
  }

  async sendBootNotification() {
    try {
      await this.sendMessage(Utils.generateUUID(), this._bootNotificationMessage, Constants.OCPP_JSON_CALL_MESSAGE, 'BootNotification');
    } catch (error) {
      logger.error(this._logPrefix() + ' Send BootNotification error: ' + error);
      throw error;
    }
  }

  async sendStatusNotification(connectorId: number, status: string, errorCode = 'NoError') {
    try {
      const payload = {
        connectorId,
        errorCode,
        status,
      };
      await this.sendMessage(Utils.generateUUID(), payload, Constants.OCPP_JSON_CALL_MESSAGE, 'StatusNotification');
    } catch (error) {
      logger.error(this._logPrefix() + ' Send StatusNotification error: ' + error);
      throw error;
    }
  }

  async sendStartTransaction(connectorId: number, idTag?: string): Promise<unknown> {
    try {
      const payload = {
        connectorId,
        ...!Utils.isUndefined(idTag) ? { idTag } : { idTag: '' },
        meterStart: 0,
        timestamp: new Date().toISOString(),
      };
      return await this.sendMessage(Utils.generateUUID(), payload, Constants.OCPP_JSON_CALL_MESSAGE, 'StartTransaction');
    } catch (error) {
      logger.error(this._logPrefix() + ' Send StartTransaction error: ' + error);
      throw error;
    }
  }

  async sendStopTransaction(transactionId: string, reason = ''): Promise<void> {
    try {
      const payload = {
        transactionId,
        meterStop: 0,
        timestamp: new Date().toISOString(),
        ...reason && { reason },
      };
      await this.sendMessage(Utils.generateUUID(), payload, Constants.OCPP_JSON_CALL_MESSAGE, 'StopTransaction');
    } catch (error) {
      logger.error(this._logPrefix() + ' Send StopTransaction error: ' + error);
      throw error;
    }
  }

  // eslint-disable-next-line consistent-this
  async sendMeterValues(connectorId: number, interval: number, self: ChargingStation, debug = false): Promise<void> {
    try {
      const sampledValues = {
        timestamp: new Date().toISOString(),
        sampledValue: [],
      };
      const meterValuesTemplate = self.getConnector(connectorId).MeterValues;
      for (let index = 0; index < meterValuesTemplate.length; index++) {
        const connector = self.getConnector(connectorId);
        // SoC measurand
        if (meterValuesTemplate[index].measurand && meterValuesTemplate[index].measurand === 'SoC' && self._getConfigurationKey('MeterValuesSampledData').value.includes('SoC')) {
          sampledValues.sampledValue.push({
            ...!Utils.isUndefined(meterValuesTemplate[index].unit) ? { unit: meterValuesTemplate[index].unit } : { unit: 'Percent' },
            ...!Utils.isUndefined(meterValuesTemplate[index].context) && { context: meterValuesTemplate[index].context },
            measurand: meterValuesTemplate[index].measurand,
            ...!Utils.isUndefined(meterValuesTemplate[index].location) ? { location: meterValuesTemplate[index].location } : { location: 'EV' },
            ...!Utils.isUndefined(meterValuesTemplate[index].value) ? { value: meterValuesTemplate[index].value } : { value: Utils.getRandomInt(100) },
          });
          const sampledValuesIndex = sampledValues.sampledValue.length - 1;
          if (sampledValues.sampledValue[sampledValuesIndex].value > 100 || debug) {
            logger.error(`${self._logPrefix()} MeterValues measurand ${sampledValues.sampledValue[sampledValuesIndex].measurand ? sampledValues.sampledValue[sampledValuesIndex].measurand : 'Energy.Active.Import.Register'}: connectorId ${connectorId}, transaction ${connector.transactionId}, value: ${sampledValues.sampledValue[sampledValuesIndex].value}/100`);
          }
        // Voltage measurand
        } else if (meterValuesTemplate[index].measurand && meterValuesTemplate[index].measurand === 'Voltage' && self._getConfigurationKey('MeterValuesSampledData').value.includes('Voltage')) {
          const voltageMeasurandValue = Utils.getRandomFloatRounded(self._getVoltageOut() + self._getVoltageOut() * 0.1, self._getVoltageOut() - self._getVoltageOut() * 0.1);
          sampledValues.sampledValue.push({
            ...!Utils.isUndefined(meterValuesTemplate[index].unit) ? { unit: meterValuesTemplate[index].unit } : { unit: 'V' },
            ...!Utils.isUndefined(meterValuesTemplate[index].context) && { context: meterValuesTemplate[index].context },
            measurand: meterValuesTemplate[index].measurand,
            ...!Utils.isUndefined(meterValuesTemplate[index].location) && { location: meterValuesTemplate[index].location },
            ...!Utils.isUndefined(meterValuesTemplate[index].value) ? { value: meterValuesTemplate[index].value } : { value: voltageMeasurandValue },
          });
          for (let phase = 1; self._getNumberOfPhases() === 3 && phase <= self._getNumberOfPhases(); phase++) {
            const voltageValue = sampledValues.sampledValue[sampledValues.sampledValue.length - 1].value;
            let phaseValue;
            if (voltageValue >= 0 && voltageValue <= 250) {
              phaseValue = `L${phase}-N`;
            } else if (voltageValue > 250) {
              phaseValue = `L${phase}-L${(phase + 1) % self._getNumberOfPhases() !== 0 ? (phase + 1) % self._getNumberOfPhases() : self._getNumberOfPhases()}`;
            }
            sampledValues.sampledValue.push({
              ...!Utils.isUndefined(meterValuesTemplate[index].unit) ? { unit: meterValuesTemplate[index].unit } : { unit: 'V' },
              ...!Utils.isUndefined(meterValuesTemplate[index].context) && { context: meterValuesTemplate[index].context },
              measurand: meterValuesTemplate[index].measurand,
              ...!Utils.isUndefined(meterValuesTemplate[index].location) && { location: meterValuesTemplate[index].location },
              ...!Utils.isUndefined(meterValuesTemplate[index].value) ? { value: meterValuesTemplate[index].value } : { value: voltageMeasurandValue },
              phase: phaseValue,
            });
          }
        // Power.Active.Import measurand
        } else if (meterValuesTemplate[index].measurand && meterValuesTemplate[index].measurand === 'Power.Active.Import' && self._getConfigurationKey('MeterValuesSampledData').value.includes('Power.Active.Import')) {
          // FIXME: factor out powerDivider checks
          if (Utils.isUndefined(self._stationInfo.powerDivider)) {
            const errMsg = `${self._logPrefix()} MeterValues measurand ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : 'Energy.Active.Import.Register'}: powerDivider is undefined`;
            logger.error(errMsg);
            throw Error(errMsg);
          } else if (self._stationInfo.powerDivider && self._stationInfo.powerDivider <= 0) {
            const errMsg = `${self._logPrefix()} MeterValues measurand ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : 'Energy.Active.Import.Register'}: powerDivider have zero or below value ${self._stationInfo.powerDivider}`;
            logger.error(errMsg);
            throw Error(errMsg);
          }
          const errMsg = `${self._logPrefix()} MeterValues measurand ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : 'Energy.Active.Import.Register'}: Unknown ${self._getPowerOutType()} powerOutType in template file ${self._stationTemplateFile}, cannot calculate ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : 'Energy.Active.Import.Register'} measurand value`;
          const powerMeasurandValues = {} as MeasurandValues ;
          const maxPower = Math.round(self._stationInfo.maxPower / self._stationInfo.powerDivider);
          const maxPowerPerPhase = Math.round((self._stationInfo.maxPower / self._stationInfo.powerDivider) / self._getNumberOfPhases());
          switch (self._getPowerOutType()) {
            case 'AC':
              if (Utils.isUndefined(meterValuesTemplate[index].value)) {
                powerMeasurandValues.L1 = Utils.getRandomFloatRounded(maxPowerPerPhase);
                powerMeasurandValues.L2 = 0;
                powerMeasurandValues.L3 = 0;
                if (self._getNumberOfPhases() === 3) {
                  powerMeasurandValues.L2 = Utils.getRandomFloatRounded(maxPowerPerPhase);
                  powerMeasurandValues.L3 = Utils.getRandomFloatRounded(maxPowerPerPhase);
                }
                powerMeasurandValues.all = Utils.roundTo(powerMeasurandValues.L1 + powerMeasurandValues.L2 + powerMeasurandValues.L3, 2);
              }
              break;
            case 'DC':
              if (Utils.isUndefined(meterValuesTemplate[index].value)) {
                powerMeasurandValues.all = Utils.getRandomFloatRounded(maxPower);
              }
              break;
            default:
              logger.error(errMsg);
              throw Error(errMsg);
          }
          sampledValues.sampledValue.push({
            ...!Utils.isUndefined(meterValuesTemplate[index].unit) ? { unit: meterValuesTemplate[index].unit } : { unit: 'W' },
            ...!Utils.isUndefined(meterValuesTemplate[index].context) && { context: meterValuesTemplate[index].context },
            measurand: meterValuesTemplate[index].measurand,
            ...!Utils.isUndefined(meterValuesTemplate[index].location) && { location: meterValuesTemplate[index].location },
            ...!Utils.isUndefined(meterValuesTemplate[index].value) ? { value: meterValuesTemplate[index].value } : { value: powerMeasurandValues.all },
          });
          const sampledValuesIndex = sampledValues.sampledValue.length - 1;
          if (sampledValues.sampledValue[sampledValuesIndex].value > maxPower || debug) {
            logger.error(`${self._logPrefix()} MeterValues measurand ${sampledValues.sampledValue[sampledValuesIndex].measurand ? sampledValues.sampledValue[sampledValuesIndex].measurand : 'Energy.Active.Import.Register'}: connectorId ${connectorId}, transaction ${connector.transactionId}, value: ${sampledValues.sampledValue[sampledValuesIndex].value}/${maxPower}`);
          }
          for (let phase = 1; self._getNumberOfPhases() === 3 && phase <= self._getNumberOfPhases(); phase++) {
            const phaseValue = `L${phase}-N`;
            sampledValues.sampledValue.push({
              ...!Utils.isUndefined(meterValuesTemplate[index].unit) ? { unit: meterValuesTemplate[index].unit } : { unit: 'W' },
              ...!Utils.isUndefined(meterValuesTemplate[index].context) && { context: meterValuesTemplate[index].context },
              ...!Utils.isUndefined(meterValuesTemplate[index].measurand) && { measurand: meterValuesTemplate[index].measurand },
              ...!Utils.isUndefined(meterValuesTemplate[index].location) && { location: meterValuesTemplate[index].location },
              ...!Utils.isUndefined(meterValuesTemplate[index].value) ? { value: meterValuesTemplate[index].value } : { value: powerMeasurandValues[`L${phase}`] },
              phase: phaseValue,
            });
          }
        // Current.Import measurand
        } else if (meterValuesTemplate[index].measurand && meterValuesTemplate[index].measurand === 'Current.Import' && self._getConfigurationKey('MeterValuesSampledData').value.includes('Current.Import')) {
          // FIXME: factor out powerDivider checks
          if (Utils.isUndefined(self._stationInfo.powerDivider)) {
            const errMsg = `${self._logPrefix()} MeterValues measurand ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : 'Energy.Active.Import.Register'}: powerDivider is undefined`;
            logger.error(errMsg);
            throw Error(errMsg);
          } else if (self._stationInfo.powerDivider && self._stationInfo.powerDivider <= 0) {
            const errMsg = `${self._logPrefix()} MeterValues measurand ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : 'Energy.Active.Import.Register'}: powerDivider have zero or below value ${self._stationInfo.powerDivider}`;
            logger.error(errMsg);
            throw Error(errMsg);
          }
          const errMsg = `${self._logPrefix()} MeterValues measurand ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : 'Energy.Active.Import.Register'}: Unknown ${self._getPowerOutType()} powerOutType in template file ${self._stationTemplateFile}, cannot calculate ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : 'Energy.Active.Import.Register'} measurand value`;
          const currentMeasurandValues = {} as MeasurandValues;
          let maxAmperage;
          switch (self._getPowerOutType()) {
            case 'AC':
              maxAmperage = ElectricUtils.ampPerPhaseFromPower(self._getNumberOfPhases(), self._stationInfo.maxPower / self._stationInfo.powerDivider, self._getVoltageOut());
              if (Utils.isUndefined(meterValuesTemplate[index].value)) {
                currentMeasurandValues.L1 = Utils.getRandomFloatRounded(maxAmperage);
                currentMeasurandValues.L2 = 0;
                currentMeasurandValues.L3 = 0;
                if (self._getNumberOfPhases() === 3) {
                  currentMeasurandValues.L2 = Utils.getRandomFloatRounded(maxAmperage);
                  currentMeasurandValues.L3 = Utils.getRandomFloatRounded(maxAmperage);
                }
                currentMeasurandValues.all = Utils.roundTo((currentMeasurandValues.L1 + currentMeasurandValues.L2 + currentMeasurandValues.L3) / self._getNumberOfPhases(), 2);
              }
              break;
            case 'DC':
              maxAmperage = ElectricUtils.ampTotalFromPower(self._stationInfo.maxPower / self._stationInfo.powerDivider, self._getVoltageOut());
              if (Utils.isUndefined(meterValuesTemplate[index].value)) {
                currentMeasurandValues.all = Utils.getRandomFloatRounded(maxAmperage);
              }
              break;
            default:
              logger.error(errMsg);
              throw Error(errMsg);
          }
          sampledValues.sampledValue.push({
            ...!Utils.isUndefined(meterValuesTemplate[index].unit) ? { unit: meterValuesTemplate[index].unit } : { unit: 'A' },
            ...!Utils.isUndefined(meterValuesTemplate[index].context) && { context: meterValuesTemplate[index].context },
            measurand: meterValuesTemplate[index].measurand,
            ...!Utils.isUndefined(meterValuesTemplate[index].location) && { location: meterValuesTemplate[index].location },
            ...!Utils.isUndefined(meterValuesTemplate[index].value) ? { value: meterValuesTemplate[index].value } : { value: currentMeasurandValues.all },
          });
          const sampledValuesIndex = sampledValues.sampledValue.length - 1;
          if (sampledValues.sampledValue[sampledValuesIndex].value > maxAmperage || debug) {
            logger.error(`${self._logPrefix()} MeterValues measurand ${sampledValues.sampledValue[sampledValuesIndex].measurand ? sampledValues.sampledValue[sampledValuesIndex].measurand : 'Energy.Active.Import.Register'}: connectorId ${connectorId}, transaction ${connector.transactionId}, value: ${sampledValues.sampledValue[sampledValuesIndex].value}/${maxAmperage}`);
          }
          for (let phase = 1; self._getNumberOfPhases() === 3 && phase <= self._getNumberOfPhases(); phase++) {
            const phaseValue = `L${phase}`;
            sampledValues.sampledValue.push({
              ...!Utils.isUndefined(meterValuesTemplate[index].unit) ? { unit: meterValuesTemplate[index].unit } : { unit: 'A' },
              ...!Utils.isUndefined(meterValuesTemplate[index].context) && { context: meterValuesTemplate[index].context },
              ...!Utils.isUndefined(meterValuesTemplate[index].measurand) && { measurand: meterValuesTemplate[index].measurand },
              ...!Utils.isUndefined(meterValuesTemplate[index].location) && { location: meterValuesTemplate[index].location },
              ...!Utils.isUndefined(meterValuesTemplate[index].value) ? { value: meterValuesTemplate[index].value } : { value: currentMeasurandValues[phaseValue] },
              phase: phaseValue,
            });
          }
        // Energy.Active.Import.Register measurand (default)
        } else if (!meterValuesTemplate[index].measurand || meterValuesTemplate[index].measurand === 'Energy.Active.Import.Register') {
          // FIXME: factor out powerDivider checks
          if (Utils.isUndefined(self._stationInfo.powerDivider)) {
            const errMsg = `${self._logPrefix()} MeterValues measurand ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : 'Energy.Active.Import.Register'}: powerDivider is undefined`;
            logger.error(errMsg);
            throw Error(errMsg);
          } else if (self._stationInfo.powerDivider && self._stationInfo.powerDivider <= 0) {
            const errMsg = `${self._logPrefix()} MeterValues measurand ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : 'Energy.Active.Import.Register'}: powerDivider have zero or below value ${self._stationInfo.powerDivider}`;
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
            ...!Utils.isUndefined(meterValuesTemplate[index].unit) ? { unit: meterValuesTemplate[index].unit } : { unit: 'Wh' },
            ...!Utils.isUndefined(meterValuesTemplate[index].context) && { context: meterValuesTemplate[index].context },
            ...!Utils.isUndefined(meterValuesTemplate[index].measurand) && { measurand: meterValuesTemplate[index].measurand },
            ...!Utils.isUndefined(meterValuesTemplate[index].location) && { location: meterValuesTemplate[index].location },
            ...!Utils.isUndefined(meterValuesTemplate[index].value) ? { value: meterValuesTemplate[index].value } : { value: connector.lastEnergyActiveImportRegisterValue },
          });
          const sampledValuesIndex = sampledValues.sampledValue.length - 1;
          const maxConsumption = Math.round(self._stationInfo.maxPower * 3600 / (self._stationInfo.powerDivider * interval));
          if (sampledValues.sampledValue[sampledValuesIndex].value > maxConsumption || debug) {
            logger.error(`${self._logPrefix()} MeterValues measurand ${sampledValues.sampledValue[sampledValuesIndex].measurand ? sampledValues.sampledValue[sampledValuesIndex].measurand : 'Energy.Active.Import.Register'}: connectorId ${connectorId}, transaction ${connector.transactionId}, value: ${sampledValues.sampledValue[sampledValuesIndex].value}/${maxConsumption}`);
          }
        // Unsupported measurand
        } else {
          logger.info(`${self._logPrefix()} Unsupported MeterValues measurand ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : 'Energy.Active.Import.Register'} on connectorId ${connectorId}`);
        }
      }

      const payload = {
        connectorId,
        transactionId: self.getConnector(connectorId).transactionId,
        meterValue: sampledValues,
      };
      await self.sendMessage(Utils.generateUUID(), payload, Constants.OCPP_JSON_CALL_MESSAGE, 'MeterValues');
    } catch (error) {
      logger.error(self._logPrefix() + ' Send MeterValues error: ' + error);
      throw error;
    }
  }

  async sendError(messageId, err: Error|OCPPError, commandName) {
    // Check exception type: only OCPP error are accepted
    const error = err instanceof OCPPError ? err : new OCPPError(Constants.OCPP_ERROR_INTERNAL_ERROR, err.message, err.stack && err.stack);
    // Send error
    return this.sendMessage(messageId, error, Constants.OCPP_JSON_CALL_ERROR_MESSAGE, commandName);
  }

  async sendMessage(messageId, commandParams, messageType = Constants.OCPP_JSON_CALL_RESULT_MESSAGE, commandName: string) {
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
        self._requests[messageId] = [() => { }, () => { }, '']; // Properly format the request
        // Send error
        reject(error);
      }
    });
  }

  handleResponse(commandName: string, payload, requestPayload) {
    const responseCallbackFn = 'handleResponse' + commandName;
    if (typeof this[responseCallbackFn] === 'function') {
      this[responseCallbackFn](payload, requestPayload);
    } else {
      logger.error(this._logPrefix() + ' Trying to call an undefined response callback function: ' + responseCallbackFn);
    }
  }

  handleResponseBootNotification(payload, requestPayload) {
    if (payload.status === 'Accepted') {
      this._heartbeatInterval = payload.interval * 1000;
      this._addConfigurationKey('HeartBeatInterval', Utils.convertToInt(payload.interval));
      this._addConfigurationKey('HeartbeatInterval', Utils.convertToInt(payload.interval), false, false);
      this._startMessageSequence();
    } else if (payload.status === 'Pending') {
      logger.info(this._logPrefix() + ' Charging station in pending state on the central server');
    } else {
      logger.info(this._logPrefix() + ' Charging station rejected by the central server');
    }
  }

  _initTransactionOnConnector(connectorId) {
    this.getConnector(connectorId).transactionStarted = false;
    this.getConnector(connectorId).transactionId = null;
    this.getConnector(connectorId).idTag = null;
    this.getConnector(connectorId).lastEnergyActiveImportRegisterValue = -1;
  }

  _resetTransactionOnConnector(connectorId) {
    this._initTransactionOnConnector(connectorId);
    if (this.getConnector(connectorId).transactionSetInterval) {
      clearInterval(this.getConnector(connectorId).transactionSetInterval);
    }
  }

  handleResponseStartTransaction(payload, requestPayload) {
    if (this.getConnector(requestPayload.connectorId).transactionStarted) {
      logger.debug(this._logPrefix() + ' Try to start a transaction on an already used connector ' + requestPayload.connectorId + ': %s', this.getConnector(requestPayload.connectorId));
      return;
    }

    let transactionConnectorId;
    for (const connector in this._connectors) {
      if (Utils.convertToInt(connector) === Utils.convertToInt(requestPayload.connectorId)) {
        transactionConnectorId = connector;
        break;
      }
    }
    if (!transactionConnectorId) {
      logger.error(this._logPrefix() + ' Try to start a transaction on a non existing connector Id ' + requestPayload.connectorId);
      return;
    }
    if (payload.idTagInfo && payload.idTagInfo.status === 'Accepted') {
      this.getConnector(requestPayload.connectorId).transactionStarted = true;
      this.getConnector(requestPayload.connectorId).transactionId = payload.transactionId;
      this.getConnector(requestPayload.connectorId).idTag = requestPayload.idTag;
      this.getConnector(requestPayload.connectorId).lastEnergyActiveImportRegisterValue = 0;
      this.sendStatusNotification(requestPayload.connectorId, 'Charging');
      logger.info(this._logPrefix() + ' Transaction ' + payload.transactionId + ' STARTED on ' + this._stationInfo.name + '#' + requestPayload.connectorId + ' for idTag ' + requestPayload.idTag);
      if (this._stationInfo.powerSharedByConnectors) {
        this._stationInfo.powerDivider++;
      }
      const configuredMeterValueSampleInterval = this._getConfigurationKey('MeterValueSampleInterval');
      this._startMeterValues(requestPayload.connectorId,
        configuredMeterValueSampleInterval ? configuredMeterValueSampleInterval.value * 1000 : 60000);
    } else {
      logger.error(this._logPrefix() + ' Starting transaction id ' + payload.transactionId + ' REJECTED with status ' + payload.idTagInfo.status + ', idTag ' + requestPayload.idTag);
      this._resetTransactionOnConnector(requestPayload.connectorId);
      this.sendStatusNotification(requestPayload.connectorId, 'Available');
    }
  }

  handleResponseStopTransaction(payload, requestPayload) {
    let transactionConnectorId;
    for (const connector in this._connectors) {
      if (this.getConnector(Utils.convertToInt(connector)).transactionId === requestPayload.transactionId) {
        transactionConnectorId = connector;
        break;
      }
    }
    if (!transactionConnectorId) {
      logger.error(this._logPrefix() + ' Try to stop a non existing transaction ' + requestPayload.transactionId);
      return;
    }
    if (payload.idTagInfo && payload.idTagInfo.status === 'Accepted') {
      this.sendStatusNotification(transactionConnectorId, 'Available');
      if (this._stationInfo.powerSharedByConnectors) {
        this._stationInfo.powerDivider--;
      }
      logger.info(this._logPrefix() + ' Transaction ' + requestPayload.transactionId + ' STOPPED on ' + this._stationInfo.name + '#' + transactionConnectorId);
      this._resetTransactionOnConnector(transactionConnectorId);
    } else {
      logger.error(this._logPrefix() + ' Stopping transaction id ' + requestPayload.transactionId + ' REJECTED with status ' + payload.idTagInfo.status);
    }
  }

  handleResponseStatusNotification(payload, requestPayload) {
    logger.debug(this._logPrefix() + ' Status notification response received: %j to StatusNotification request: %j', payload, requestPayload);
  }

  handleResponseMeterValues(payload, requestPayload) {
    logger.debug(this._logPrefix() + ' MeterValues response received: %j to MeterValues request: %j', payload, requestPayload);
  }

  handleResponseHeartbeat(payload, requestPayload) {
    logger.debug(this._logPrefix() + ' Heartbeat response received: %j to Heartbeat request: %j', payload, requestPayload);
  }

  async handleRequest(messageId, commandName, commandPayload) {
    let response;
    // Call
    if (typeof this['handleRequest' + commandName] === 'function') {
      try {
        // Call the method to build the response
        response = await this['handleRequest' + commandName](commandPayload);
      } catch (error) {
        // Log
        logger.error(this._logPrefix() + ' Handle request error: ' + error);
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
  async handleRequestReset(commandPayload) {
    setImmediate(async () => {
      await this.stop(commandPayload.type + 'Reset');
      await Utils.sleep(this._stationInfo.resetTime);
      await this.start();
    });
    logger.info(`${this._logPrefix()} ${commandPayload.type} reset command received, simulating it. The station will be back online in ${this._stationInfo.resetTime}ms`);
    return Constants.OCPP_RESPONSE_ACCEPTED;
  }

  _getConfigurationKey(key) {
    return this._configuration.configurationKey.find((configElement) => configElement.key === key);
  }

  _addConfigurationKey(key, value, readonly = false, visible = true, reboot = false) {
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

  _setConfigurationKeyValue(key, value) {
    const keyFound = this._getConfigurationKey(key);
    if (keyFound) {
      const keyIndex = this._configuration.configurationKey.indexOf(keyFound);
      this._configuration.configurationKey[keyIndex].value = value;
    }
  }

  async handleRequestGetConfiguration(commandPayload) {
    const configurationKey = [];
    const unknownKey = [];
    if (Utils.isEmptyArray(commandPayload.key)) {
      for (const configuration of this._configuration.configurationKey) {
        if (Utils.isUndefined(configuration.visible)) {
          configuration.visible = true;
        } else {
          configuration.visible = Utils.convertToBoolean(configuration.visible);
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
      for (const configurationKey of commandPayload.key) {
        const keyFound = this._getConfigurationKey(configurationKey);
        if (keyFound) {
          if (Utils.isUndefined(keyFound.visible)) {
            keyFound.visible = true;
          } else {
            keyFound.visible = Utils.convertToBoolean(configurationKey.visible);
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
          unknownKey.push(configurationKey);
        }
      }
    }
    return {
      configurationKey,
      unknownKey,
    };
  }

  async handleRequestChangeConfiguration(commandPayload) {
    const keyToChange = this._getConfigurationKey(commandPayload.key);
    if (!keyToChange) {
      return { status: Constants.OCPP_ERROR_NOT_SUPPORTED };
    } else if (keyToChange && Utils.convertToBoolean(keyToChange.readonly)) {
      return Constants.OCPP_RESPONSE_REJECTED;
    } else if (keyToChange && !Utils.convertToBoolean(keyToChange.readonly)) {
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
      if (Utils.convertToBoolean(keyToChange.reboot)) {
        return Constants.OCPP_RESPONSE_REBOOT_REQUIRED;
      }
      return Constants.OCPP_RESPONSE_ACCEPTED;
    }
  }

  async handleRequestRemoteStartTransaction(commandPayload) {
    const transactionConnectorID = commandPayload.connectorId ? commandPayload.connectorId : '1';
    if (this._getAuthorizeRemoteTxRequests() && this._getLocalAuthListEnabled() && this.hasAuthorizedTags()) {
      // Check if authorized
      if (this._authorizedTags.find((value) => value === commandPayload.idTag)) {
        // Authorization successful start transaction
        await this.sendStartTransaction(transactionConnectorID, commandPayload.idTag);
        logger.debug(this._logPrefix() + ' Transaction remotely STARTED on ' + this._stationInfo.name + '#' + transactionConnectorID + ' for idTag ' + commandPayload.idTag);
        return Constants.OCPP_RESPONSE_ACCEPTED;
      }
      logger.error(this._logPrefix() + ' Remote starting transaction REJECTED with status ' + commandPayload.idTagInfo.status + ', idTag ' + commandPayload.idTag);
      return Constants.OCPP_RESPONSE_REJECTED;
    }
    // No local authorization check required => start transaction
    await this.sendStartTransaction(transactionConnectorID, commandPayload.idTag);
    logger.debug(this._logPrefix() + ' Transaction remotely STARTED on ' + this._stationInfo.name + '#' + transactionConnectorID + ' for idTag ' + commandPayload.idTag);
    return Constants.OCPP_RESPONSE_ACCEPTED;
  }

  async handleRequestRemoteStopTransaction(commandPayload) {
    for (const connector in this._connectors) {
      if (this.getConnector(Utils.convertToInt(connector)).transactionId === commandPayload.transactionId) {
        await this.sendStopTransaction(commandPayload.transactionId);
        return Constants.OCPP_RESPONSE_ACCEPTED;
      }
    }
    logger.info(this._logPrefix() + ' Try to stop remotely a non existing transaction ' + commandPayload.transactionId);
    return Constants.OCPP_RESPONSE_REJECTED;
  }
}

