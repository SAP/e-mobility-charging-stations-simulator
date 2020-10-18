const Configuration = require('../utils/Configuration');
const logger = require('../utils/Logger');
const WebSocket = require('ws');
const Constants = require('../utils/Constants');
const Utils = require('../utils/Utils');
const OCPPError = require('./OcppError');
const AutomaticTransactionGenerator = require('./AutomaticTransactionGenerator');
const Statistics = require('../utils/Statistics');
const fs = require('fs');
const {performance, PerformanceObserver} = require('perf_hooks');

class ChargingStation {
  constructor(index, stationTemplateFile) {
    this._index = index;
    this._stationTemplateFile = stationTemplateFile;
    this._initialize();

    this._autoReconnectRetryCount = 0;
    this._autoReconnectMaxRetries = Configuration.getAutoReconnectMaxRetries(); // -1 for unlimited
    this._autoReconnectTimeout = Configuration.getAutoReconnectTimeout() * 1000; // ms, zero for disabling

    this._requests = {};
    this._messageQueue = [];

    this._isSocketRestart = false;

    this._authorizedTags = this._loadAndGetAuthorizedTags();
  }

  _initialize() {
    this._stationInfo = this._buildStationInfo();
    this._bootNotificationMessage = {
      chargePointModel: this._stationInfo.chargePointModel,
      chargePointVendor: this._stationInfo.chargePointVendor,
      chargePointSerialNumber: this._stationInfo.chargePointSerialNumberPrefix ? this._stationInfo.chargePointSerialNumberPrefix : '',
      firmwareVersion: this._stationInfo.firmwareVersion ? this._stationInfo.firmwareVersion : '',
    };
    this._configuration = this._getConfiguration();
    this._supervisionUrl = this._getSupervisionURL();
    this._statistics = new Statistics(this._stationInfo.name);
    this._performanceObserver = new PerformanceObserver((list) => {
      const entry = list.getEntries()[0];
      this._statistics.logPerformance(entry, 'ChargingStation');
      this._performanceObserver.disconnect();
    });
  }

  _basicFormatLog() {
    return Utils.basicFormatLog(` ${this._stationInfo.name}:`);
  }

  _getConfiguration() {
    return this._stationInfo.Configuration ? this._stationInfo.Configuration : {};
  }

  _getAuthorizationFile() {
    return this._stationInfo.authorizationFile ? this._stationInfo.authorizationFile : '';
  }

  _loadAndGetAuthorizedTags() {
    let authorizedTags = [];
    const authorizationFile = this._getAuthorizationFile();
    if (authorizationFile) {
      try {
        // Load authorization file
        const fileDescriptor = fs.openSync(authorizationFile, 'r');
        authorizedTags = JSON.parse(fs.readFileSync(fileDescriptor, 'utf8'));
        fs.closeSync(fileDescriptor);
      } catch (error) {
        logger.error(this._basicFormatLog() + ' Authorization file loading error: ' + error);
      }
    } else {
      logger.info(this._basicFormatLog() + ' No authorization file given in template file ' + this._stationTemplateFile);
    }
    return authorizedTags;
  }

  _startAuthorizationFileMonitoring() {
    // eslint-disable-next-line no-unused-vars
    fs.watchFile(this._getAuthorizationFile(), (current, previous) => {
      try {
        logger.debug(this._basicFormatLog() + ' Authorization file ' + this._getAuthorizationFile() + ' have changed, reload');
        // Initialize _authorizedTags
        this._authorizedTags = this._loadAndGetAuthorizedTags();
      } catch (error) {
        logger.error(this._basicFormatLog() + ' Authorization file monitoring error: ' + error);
      }
    });
  }

  _startStationTemplateFileMonitoring() {
    // eslint-disable-next-line no-unused-vars
    fs.watchFile(this._stationTemplateFile, (current, previous) => {
      try {
        logger.debug(this._basicFormatLog() + ' Template file ' + this._stationTemplateFile + ' have changed, reload');
        // Initialize
        this._initialize();
      } catch (error) {
        logger.error(this._basicFormatLog() + ' Charging station template file monitoring error: ' + error);
      }
    });
  }

  _getSupervisionURL() {
    const supervisionUrls = Utils.cloneJSonDocument(this._stationInfo.supervisionURL ? this._stationInfo.supervisionURL : Configuration.getSupervisionURLs());
    let indexUrl = 0;
    if (Array.isArray(supervisionUrls)) {
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

  _getStationName(stationTemplate) {
    return stationTemplate.fixedName ? stationTemplate.baseName : stationTemplate.baseName + '-' + ('000000000' + this._index).substr(('000000000' + this._index).length - 4);
  }

  _getAuthorizeRemoteTxRequests() {
    const authorizeRemoteTxRequests = this._getConfigurationKey('AuthorizeRemoteTxRequests');
    return authorizeRemoteTxRequests ? Utils.convertToBoolean(authorizeRemoteTxRequests.value) : false;
  }

  _getLocalAuthListEnabled() {
    const localAuthListEnabled = this._getConfigurationKey('LocalAuthListEnabled');
    return localAuthListEnabled ? Utils.convertToBoolean(localAuthListEnabled.value) : false;
  }

  _buildStationInfo() {
    let stationTemplateFromFile;
    try {
      // Load template file
      const fileDescriptor = fs.openSync(this._stationTemplateFile, 'r');
      stationTemplateFromFile = JSON.parse(fs.readFileSync(fileDescriptor, 'utf8'));
      fs.closeSync(fileDescriptor);
    } catch (error) {
      logger.error(this._basicFormatLog() + ' Template file loading error: ' + error);
    }
    const stationTemplate = stationTemplateFromFile || {};
    if (Array.isArray(stationTemplateFromFile.power)) {
      stationTemplate.maxPower = stationTemplateFromFile.power[Math.floor(Math.random() * stationTemplateFromFile.power.length)];
    } else {
      stationTemplate.maxPower = stationTemplateFromFile.power;
    }
    stationTemplate.name = this._getStationName(stationTemplateFromFile);
    return stationTemplate;
  }

  async start() {
    this._url = this._supervisionUrl + '/' + this._stationInfo.name;
    this._wsConnection = new WebSocket(this._url, 'ocpp1.6');
    logger.info(this._basicFormatLog() + ' Will communicate with ' + this._supervisionUrl);
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

  onOpen() {
    logger.info(`${this._basicFormatLog()} Is connected to server through ${this._url}`);
    if (!this._heartbeatInterval) {
      // Send BootNotification
      try {
        this.sendMessage(Utils.generateUUID(), this._bootNotificationMessage, Constants.OCPP_JSON_CALL_MESSAGE, 'BootNotification');
      } catch (error) {
        logger.error(this._basicFormatLog() + ' Send boot notification error: ' + error);
      }
    }
    if (this._isSocketRestart) {
      this._basicStartMessageSequence();
      if (this._messageQueue.length > 0) {
        this._messageQueue.forEach((message) => {
          if (this._wsConnection.readyState === WebSocket.OPEN) {
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
        logger.error(this._basicFormatLog() + ' Socket error: ' + error);
        break;
    }
  }

  onClose(error) {
    switch (error) {
      case 1000: // Normal close
      case 1005:
        logger.info(this._basicFormatLog() + ' Socket normally closed ' + error);
        this._autoReconnectRetryCount = 0;
        break;
      default: // Abnormal close
        this._isSocketRestart = true;
        this._reconnect(error);
        break;
    }
  }

  onPing() {
    logger.debug(this._basicFormatLog() + ' Has received a WS ping (rfc6455) from the server');
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
          // Process the call
          this._statistics.addMessage(commandName);
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
            throw new Error(`Response request for unknown message id ${messageId} is not iterable`);
          }
          if (!responseCallback) {
            // Error
            throw new Error(`Response for unknown message id ${messageId}`);
          }
          delete this._requests[messageId];
          // this._statistics.addMessage(commandName)
          responseCallback(commandName, requestPayload);
          break;
        // Error Message
        case Constants.OCPP_JSON_CALL_ERROR_MESSAGE:
          if (!this._requests[messageId]) {
            // Error
            throw new Error(`Error for unknown message id ${messageId}`);
          }
          // eslint-disable-next-line no-case-declarations
          let rejectCallback;
          if (Utils.isIterable(this._requests[messageId])) {
            [, rejectCallback] = this._requests[messageId];
          } else {
            throw new Error(`Error request for unknown message id ${messageId} is not iterable`);
          }
          delete this._requests[messageId];
          rejectCallback(new OCPPError(commandName, commandPayload, errorDetails));
          break;
        // Error
        default:
          throw new Error(`Wrong message type ${messageType}`);
      }
    } catch (error) {
      // Log
      logger.error('%s Incoming message %j processing error %s on request content %s', this._basicFormatLog(), message, error, this._requests[messageId]);
      // Send error
      // await this.sendError(messageId, error);
    }
  }

  // eslint-disable-next-line class-methods-use-this
  async _startHeartbeat(self) {
    if (self._heartbeatInterval && !self._heartbeatSetInterval) {
      self._heartbeatSetInterval = setInterval(() => {
        try {
          const payload = {
            currentTime: new Date().toISOString(),
          };
          self.sendMessage(Utils.generateUUID(), payload, Constants.OCPP_JSON_CALL_MESSAGE, 'Heartbeat');
        } catch (error) {
          logger.error(self._basicFormatLog() + ' Send heartbeat error: ' + error);
        }
      }, self._heartbeatInterval);
      logger.info(self._basicFormatLog() + ' Heartbeat started every ' + self._heartbeatInterval + 'ms');
    } else {
      logger.error(self._basicFormatLog() + ' Heartbeat interval undefined, not starting the heartbeat');
    }
  }

  _reconnect(error) {
    logger.error(this._basicFormatLog() + ' Socket: abnormally closed', error);
    // Stop heartbeat
    if (this._heartbeatSetInterval) {
      clearInterval(this._heartbeatSetInterval);
      this._heartbeatSetInterval = null;
    }
    // Stop the ATG if needed
    if (Utils.convertToBoolean(this._stationInfo.AutomaticTransactionGenerator.enable) &&
      Utils.convertToBoolean(this._stationInfo.AutomaticTransactionGenerator.stopOnConnectionFailure) &&
      this._automaticTransactionGeneration &&
      !this._automaticTransactionGeneration.timeToStop) {
      this._automaticTransactionGeneration.stop();
    }
    if (this._autoReconnectTimeout !== 0 &&
      (this._autoReconnectRetryCount < this._autoReconnectMaxRetries || this._autoReconnectMaxRetries === -1)) {
      logger.error(`${this._basicFormatLog()} Socket: connection retry with timeout ${this._autoReconnectTimeout}ms`);
      this._autoReconnectRetryCount++;
      setTimeout(() => {
        logger.error(this._basicFormatLog() + ' Socket: reconnecting try #' + this._autoReconnectRetryCount);
        this.start();
      }, this._autoReconnectTimeout);
    } else if (this._autoReconnectTimeout !== 0 || this._autoReconnectMaxRetries !== -1) {
      logger.error(`${this._basicFormatLog()} Socket: max retries reached (${this._autoReconnectRetryCount}) or retry disabled (${this._autoReconnectTimeout})`);
    }
  }

  send(command, messageType = Constants.OCPP_JSON_CALL_MESSAGE) {
    // Send Message
    return this.sendMessage(Utils.generateUUID(), command, messageType);
  }

  sendError(messageId, err) {
    // Check exception: only OCPP error are accepted
    const error = err instanceof OCPPError ? err : new OCPPError(Constants.OCPP_ERROR_INTERNAL_ERROR, err.message);
    // Send error
    return this.sendMessage(messageId, error, Constants.OCPP_JSON_CALL_ERROR_MESSAGE);
  }

  async sendStatusNotification(connectorId, status, errorCode = 'NoError') {
    try {
      const payload = {
        connectorId,
        errorCode,
        status,
      };
      await this.sendMessage(Utils.generateUUID(), payload, Constants.OCPP_JSON_CALL_MESSAGE, 'StatusNotification');
    } catch (error) {
      logger.error(this._basicFormatLog() + ' Send status error: ' + error);
    }
  }

  async sendStatusNotificationWithTimeout(connectorId, status, errorCode = 'NoError', timeout = Constants.STATUS_NOTIFICATION_TIMEOUT) {
    setTimeout(() => this.sendStatusNotification(connectorId, status, errorCode), timeout);
  }

  sendMessage(messageId, command, messageType = Constants.OCPP_JSON_CALL_RESULT_MESSAGE, commandName = '') {
    // Send a message through wsConnection
    const self = this;
    // Create a promise
    return new Promise((resolve, reject) => {
      let messageToSend;
      // Type of message
      switch (messageType) {
        // Request
        case Constants.OCPP_JSON_CALL_MESSAGE:
          this._statistics.addMessage(commandName);
          // Build request
          this._requests[messageId] = [responseCallback, rejectCallback, command];
          messageToSend = JSON.stringify([messageType, messageId, commandName, command]);
          break;
        // Response
        case Constants.OCPP_JSON_CALL_RESULT_MESSAGE:
          // Build response
          messageToSend = JSON.stringify([messageType, messageId, command]);
          break;
        // Error Message
        case Constants.OCPP_JSON_CALL_ERROR_MESSAGE:
          // Build Message
          this._statistics.addMessage(`Error ${command.code}`);
          messageToSend = JSON.stringify([messageType, messageId, command.code ? command.code : Constants.OCPP_ERROR_GENERIC_ERROR, command.message ? command.message : '', command.details ? command.details : {}]);
          break;
      }
      // Check if wsConnection is ready
      if (this._wsConnection.readyState === WebSocket.OPEN) {
        // Yes: Send Message
        this._wsConnection.send(messageToSend);
      } else {
        // Buffer message until connection is back
        this._messageQueue.push(messageToSend);
      }
      // Request?
      if (messageType !== Constants.OCPP_JSON_CALL_MESSAGE) {
        // Yes: send Ok
        resolve();
      } else if (this._wsConnection.readyState === WebSocket.OPEN) {
        // Send timeout in case connection is open otherwise wait for ever
        // FIXME: Handle message on timeout
        setTimeout(() => rejectCallback(`Timeout for message ${messageId}`), Constants.OCPP_SOCKET_TIMEOUT);
      }

      // Function that will receive the request's response
      function responseCallback(payload, requestPayload) {
        self._statistics.addMessage(commandName, true);
        const responseCallbackFn = 'handleResponse' + commandName;
        if (typeof self[responseCallbackFn] === 'function') {
          self[responseCallbackFn](payload, requestPayload, self);
        } else {
          logger.debug(self._basicFormatLog() + ' Trying to call an undefined response callback function: ' + responseCallbackFn);
        }
        // Send the response
        resolve(payload);
      }

      // Function that will receive the request's rejection
      function rejectCallback(reason) {
        // Build Exception
        // eslint-disable-next-line no-empty-function
        self._requests[messageId] = [() => { }, () => { }, '']; // Properly format the request
        const error = reason instanceof OCPPError ? reason : new Error(reason);
        // Send error
        reject(error);
      }
    });
  }

  async _basicStartMessageSequence() {
    // Start heartbeat
    this._startHeartbeat(this);
    // Build connectors
    if (!this._connectors) {
      this._connectors = {};
      const connectorsConfig = Utils.cloneJSonDocument(this._stationInfo.Connectors);
      // Determine number of customized connectors
      let lastConnector;
      for (lastConnector in connectorsConfig) {
        // Add connector 0, OCPP specification violation that for example KEBA have
        if (Utils.convertToInt(lastConnector) === 0 && Utils.convertToBoolean(this._stationInfo.useConnectorId0) &&
            connectorsConfig[lastConnector]) {
          this._connectors[lastConnector] = connectorsConfig[lastConnector];
        }
      }
      let maxConnectors = 0;
      if (Array.isArray(this._stationInfo.numberOfConnectors)) {
        // Generate some connectors
        maxConnectors = this._stationInfo.numberOfConnectors[(this._index - 1) % this._stationInfo.numberOfConnectors.length];
      } else {
        maxConnectors = this._stationInfo.numberOfConnectors;
      }
      this._addConfigurationKey('NumberOfConnectors', maxConnectors, true);
      // Generate all connectors
      for (let index = 1; index <= maxConnectors; index++) {
        const randConnectorID = Utils.convertToBoolean(this._stationInfo.randomConnectors) ? Utils.getRandomInt(lastConnector, 1) : index;
        this._connectors[index] = connectorsConfig[randConnectorID];
      }
    }

    for (const connector in this._connectors) {
      if (!this._connectors[connector].transactionStarted) {
        if (this._connectors[connector].bootStatus) {
          this.sendStatusNotificationWithTimeout(connector, this._connectors[connector].bootStatus);
        } else {
          this.sendStatusNotificationWithTimeout(connector, 'Available');
        }
      } else {
        this.sendStatusNotificationWithTimeout(connector, 'Charging');
      }
    }

    if (Utils.convertToBoolean(this._stationInfo.AutomaticTransactionGenerator.enable)) {
      if (!this._automaticTransactionGeneration) {
        this._automaticTransactionGeneration = new AutomaticTransactionGenerator(this);
      }
      if (this._automaticTransactionGeneration.timeToStop) {
        this._automaticTransactionGeneration.start();
      }
    }
    this._statistics.start();
  }

  _resetTransactionOnConnector(connectorID) {
    this._connectors[connectorID].transactionStarted = false;
    this._connectors[connectorID].transactionId = null;
    this._connectors[connectorID].lastConsumptionValue = -1;
    this._connectors[connectorID].lastSoC = -1;
    if (this._connectors[connectorID].transactionInterval) {
      clearInterval(this._connectors[connectorID].transactionInterval);
    }
  }

  handleResponseBootNotification(payload) {
    if (payload.status === 'Accepted') {
      this._heartbeatInterval = payload.interval * 1000;
      this._addConfigurationKey('HeartBeatInterval', Utils.convertToInt(payload.interval));
      this._addConfigurationKey('HeartbeatInterval', Utils.convertToInt(payload.interval), false, false);
      this._basicStartMessageSequence();
    } else {
      logger.info(this._basicFormatLog() + ' Boot Notification rejected');
    }
  }

  handleResponseStartTransaction(payload, requestPayload) {
    // Set connector transaction related attributes
    this._connectors[requestPayload.connectorId].transactionStarted = false;
    this._connectors[requestPayload.connectorId].idTag = requestPayload.idTag;

    if (payload.idTagInfo.status === 'Accepted') {
      for (const connector in this._connectors) {
        if (Utils.convertToInt(connector) === Utils.convertToInt(requestPayload.connectorId)) {
          this._connectors[connector].transactionStarted = true;
          this._connectors[connector].transactionId = payload.transactionId;
          this._connectors[connector].lastConsumptionValue = 0;
          this._connectors[connector].lastSoC = 0;
          logger.info(this._basicFormatLog() + ' Transaction ' + this._connectors[connector].transactionId + ' STARTED on ' + this._stationInfo.name + '#' + requestPayload.connectorId + ' for idTag ' + requestPayload.idTag);
          this.sendStatusNotification(requestPayload.connectorId, 'Charging');
          const configuredMeterValueSampleInterval = this._getConfigurationKey('MeterValueSampleInterval');
          this.startMeterValues(requestPayload.connectorId,
            configuredMeterValueSampleInterval ? configuredMeterValueSampleInterval.value * 1000 : 60000,
            this);
        }
      }
    } else {
      logger.error(this._basicFormatLog() + ' Starting transaction id ' + payload.transactionId + ' REJECTED with status ' + payload.idTagInfo.status + ', idTag ' + requestPayload.idTag);
      for (const connector in this._connectors) {
        if (Utils.convertToInt(connector) === Utils.convertToInt(requestPayload.connectorId)) {
          this._resetTransactionOnConnector(connector);
        }
      }
      this.sendStatusNotification(requestPayload.connectorId, 'Available');
    }
  }

  handleResponseStopTransaction(payload, requestPayload) {
    if (payload.idTagInfo && payload.idTagInfo.status) {
      logger.debug(this._basicFormatLog() + ' Stop transaction ' + requestPayload.transactionId + ' response status: ' + payload.idTagInfo.status);
    } else {
      logger.debug(this._basicFormatLog() + ' Stop transaction ' + requestPayload.transactionId + ' response status: Unknown');
    }
  }

  handleResponseStatusNotification(payload, requestPayload) {
    logger.debug(this._basicFormatLog() + ' Status notification response received: %j to status notification request: %j', payload, requestPayload);
  }

  handleResponseMeterValues(payload, requestPayload) {
    logger.debug(this._basicFormatLog() + ' MeterValues response received: %j to MeterValues request: %j', payload, requestPayload);
  }

  handleResponseHeartbeat(payload, requestPayload) {
    logger.debug(this._basicFormatLog() + ' Heartbeat response received: %j to Heartbeat request: %j', payload, requestPayload);
  }

  async handleRequest(messageId, commandName, commandPayload) {
    let result;
    this._statistics.addMessage(commandName, true);
    // Call
    if (typeof this['handle' + commandName] === 'function') {
      try {
        // Call the method
        result = await this['handle' + commandName](commandPayload);
      } catch (error) {
        // Log
        logger.error(this._basicFormatLog() + ' Handle request error: ' + error);
        // Send back response to inform backend
        await this.sendError(messageId, error);
      }
    } else {
      // Throw exception
      await this.sendError(messageId, new OCPPError(Constants.OCPP_ERROR_NOT_IMPLEMENTED, 'Not implemented', {}));
      throw new Error(`${commandName} is not implemented ${JSON.stringify(commandPayload, null, ' ')}`);
    }
    // Send response
    await this.sendMessage(messageId, result, Constants.OCPP_JSON_CALL_RESULT_MESSAGE);
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
      this._configuration.configurationKey.key = value;
    }
  }

  async handleGetConfiguration(commandPayload) {
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
      for (const configuration of commandPayload.key) {
        const keyFound = this._getConfigurationKey(configuration);
        if (keyFound) {
          if (Utils.isUndefined(keyFound.visible)) {
            keyFound.visible = true;
          } else {
            keyFound.visible = Utils.convertToBoolean(configuration.visible);
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
          unknownKey.push(configuration);
        }
      }
    }
    return {
      configurationKey,
      unknownKey,
    };
  }

  async handleChangeConfiguration(commandPayload) {
    const keyToChange = this._getConfigurationKey(commandPayload.key);
    if (!keyToChange) {
      return {status: Constants.OCPP_ERROR_NOT_SUPPORTED};
    } else if (keyToChange && Utils.convertToBoolean(keyToChange.readonly)) {
      return Constants.OCPP_RESPONSE_REJECTED;
    } else if (keyToChange && !Utils.convertToBoolean(keyToChange.readonly)) {
      const keyIndex = this._configuration.configurationKey.indexOf(keyToChange);
      this._configuration.configurationKey[keyIndex].value = commandPayload.value;
      if (keyToChange.key === 'HeartBeatInterval' || keyToChange === 'HeartbeatInterval') {
        this._heartbeatInterval = Utils.convertToInt(commandPayload.value) * 1000;
        // Stop heartbeat
        if (this._heartbeatSetInterval) {
          clearInterval(this._heartbeatSetInterval);
          this._heartbeatSetInterval = null;
        }
        // Start heartbeat
        this._startHeartbeat(this);
      }
      if (Utils.convertToBoolean(keyToChange.reboot)) {
        return Constants.OCPP_RESPONSE_REBOOT_REQUIRED;
      }
      return Constants.OCPP_RESPONSE_ACCEPTED;
    }
  }

  async handleRemoteStartTransaction(commandPayload) {
    const transactionConnectorID = commandPayload.connectorId ? commandPayload.connectorId : '1';
    if (this.hasAuthorizedTags() && this._getLocalAuthListEnabled() && this._getAuthorizeRemoteTxRequests()) {
      // Check if authorized
      if (this._authorizedTags.find((value) => value === commandPayload.idTag)) {
        // Authorization successful start transaction
        this.sendStartTransactionWithTimeout(transactionConnectorID, commandPayload.idTag, Constants.START_TRANSACTION_TIMEOUT);
        logger.debug(this._basicFormatLog() + ' Transaction remotely STARTED on ' + this._stationInfo.name + '#' + transactionConnectorID + ' for idTag ' + commandPayload.idTag);
        return Constants.OCPP_RESPONSE_ACCEPTED;
      }
      logger.error(this._basicFormatLog() + ' Remote starting transaction REJECTED with status ' + commandPayload.idTagInfo.status + ', idTag ' + commandPayload.idTag);
      return Constants.OCPP_RESPONSE_REJECTED;
    }
    // No local authorization check required => start transaction
    this.sendStartTransactionWithTimeout(transactionConnectorID, commandPayload.idTag, Constants.START_TRANSACTION_TIMEOUT);
    logger.debug(this._basicFormatLog() + ' Transaction remotely STARTED on ' + this._stationInfo.name + '#' + transactionConnectorID + ' for idTag ' + commandPayload.idTag);
    return Constants.OCPP_RESPONSE_ACCEPTED;
  }

  async handleRemoteStopTransaction(commandPayload) {
    for (const connector in this._connectors) {
      if (this._connectors[connector].transactionId === commandPayload.transactionId) {
        this.sendStopTransaction(commandPayload.transactionId, connector);
      }
    }
    return Constants.OCPP_RESPONSE_ACCEPTED;
  }

  async sendStartTransaction(connectorID, idTag) {
    try {
      const payload = {
        connectorId: connectorID,
        idTag,
        meterStart: 0,
        timestamp: new Date().toISOString(),
      };
      return await this.sendMessage(Utils.generateUUID(), payload, Constants.OCPP_JSON_CALL_MESSAGE, 'StartTransaction');
    } catch (error) {
      logger.error(this._basicFormatLog() + ' Send start transaction error: ' + error);
      this._resetTransactionOnConnector(connectorID);
      throw error;
    }
  }
  async sendStartTransactionWithTimeout(connectorID, idTag, timeout) {
    setTimeout(() => this.sendStartTransaction(connectorID, idTag), timeout);
  }

  async sendStopTransaction(transactionId, connectorID) {
    try {
      const payload = {
        transactionId,
        meterStop: 0,
        timestamp: new Date().toISOString(),
      };
      await this.sendMessage(Utils.generateUUID(), payload, Constants.OCPP_JSON_CALL_MESSAGE, 'StopTransaction');
      logger.info(this._basicFormatLog() + ' Transaction ' + this._connectors[connectorID].transactionId + ' STOPPED on ' + this._stationInfo.name + '#' + connectorID);
      this.sendStatusNotification(connectorID, 'Available');
    } catch (error) {
      logger.error(this._basicFormatLog() + ' Send stop transaction error: ' + error);
      throw error;
    } finally {
      this._resetTransactionOnConnector(connectorID);
    }
  }

  // eslint-disable-next-line class-methods-use-this
  async sendMeterValues(connectorID, interval, self) {
    try {
      const sampledValueLcl = {
        timestamp: new Date().toISOString(),
      };
      const meterValuesClone = Utils.cloneJSonDocument(self._getConnector(connectorID).MeterValues);
      if (Array.isArray(meterValuesClone)) {
        sampledValueLcl.sampledValue = meterValuesClone;
      } else {
        sampledValueLcl.sampledValue = [meterValuesClone];
      }
      for (let index = 0; index < sampledValueLcl.sampledValue.length; index++) {
        if (sampledValueLcl.sampledValue[index].measurand && sampledValueLcl.sampledValue[index].measurand === 'SoC') {
          sampledValueLcl.sampledValue[index].value = Utils.getRandomInt(100);
          if (sampledValueLcl.sampledValue[index].value > 100) {
            logger.info(self._basicFormatLog() + ' MeterValues measurand: ' +
              sampledValueLcl.sampledValue[index].measurand ? sampledValueLcl.sampledValue[index].measurand : 'Energy.Active.Import.Register' +
              ', value: ' + sampledValueLcl.sampledValue[index].value);
          }
        } else {
          // Persist previous value in connector
          const connector = self._connectors[connectorID];
          let consumption;
          consumption = Utils.getRandomInt(self._stationInfo.maxPower / 3600000 * interval);
          if (connector && connector.lastConsumptionValue >= 0) {
            connector.lastConsumptionValue += consumption;
          } else {
            connector.lastConsumptionValue = 0;
          }
          consumption = Math.round(connector.lastConsumptionValue * 3600 / interval);
          logger.info(self._basicFormatLog() + ' MeterValues: connectorID ' + connectorID + ', transaction ' + connector.transactionId + ', value ' + connector.lastConsumptionValue);
          sampledValueLcl.sampledValue[index].value = connector.lastConsumptionValue;
          if (sampledValueLcl.sampledValue[index].value > (self._stationInfo.maxPower * 3600 / interval) || sampledValueLcl.sampledValue[index].value < 500) {
            logger.info(self._basicFormatLog() + ' MeterValues measurand: ' +
              sampledValueLcl.sampledValue[index].measurand ? sampledValueLcl.sampledValue[index].measurand : 'Energy.Active.Import.Register' +
              ', value: ' + sampledValueLcl.sampledValue[index].value + '/' + (self._stationInfo.maxPower * 3600 / interval));
          }
        }
      }

      const payload = {
        connectorId: connectorID,
        transactionId: self._connectors[connectorID].transactionId,
        meterValue: [sampledValueLcl],
      };
      await self.sendMessage(Utils.generateUUID(), payload, Constants.OCPP_JSON_CALL_MESSAGE, 'MeterValues');
    } catch (error) {
      logger.error(self._basicFormatLog() + ' Send MeterValues error: ' + error);
    }
  }

  async startMeterValues(connectorID, interval, self) {
    if (!this._connectors[connectorID].transactionStarted) {
      logger.debug(`${self._basicFormatLog()} Trying to start MeterValues on connector ID ${connectorID} with no transaction started`);
    } else if (this._connectors[connectorID].transactionStarted && !this._connectors[connectorID].transactionId) {
      logger.debug(`${self._basicFormatLog()} Trying to start MeterValues on connector ID ${connectorID} with no transaction id`);
    }
    this._connectors[connectorID].transactionInterval = setInterval(async () => {
      const sendMeterValues = performance.timerify(this.sendMeterValues);
      this._performanceObserver.observe({
        entryTypes: ['function'],
      });
      await sendMeterValues(connectorID, interval, self);
    }, interval);
  }

  hasAuthorizedTags() {
    return !Utils.isEmptyArray(this._authorizedTags);
  }

  getRandomTagId() {
    const index = Math.floor(Math.random() * this._authorizedTags.length);
    return this._authorizedTags[index];
  }

  _getConnector(number) {
    return this._stationInfo.Connectors[number];
  }
}

module.exports = ChargingStation;
