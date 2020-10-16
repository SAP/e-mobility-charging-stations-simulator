const fs = require('fs');
const Utils = require('./Utils');

class Configuration {
  static configurationFile;

  // Read the config file
  static getConfig() {
    if (!Configuration.configurationFile) {
      Configuration.configurationFile = JSON.parse(fs.readFileSync('./src/assets/config.json', 'utf8'));
    }
    return Configuration.configurationFile;
  }

  static getStatisticsDisplayInterval() {
    // Read conf
    return Configuration.getConfig().statisticsDisplayInterval;
  }

  static getAutoReconnectTimeout() {
    // Read conf
    return Utils.objectHasOwnProperty(Configuration.getConfig(), 'autoReconnectTimeout') ? Configuration.getConfig().autoReconnectTimeout : 10;
  }

  static getAutoReconnectMaxRetries() {
    // Read conf
    return Utils.objectHasOwnProperty(Configuration.getConfig(), 'autoReconnectMaxRetries') ? Configuration.getConfig().autoReconnectMaxRetries : -1;
  }

  static getChargingStationTemplateURLs() {
    // Read conf
    return Configuration.getConfig().stationTemplateURLs;
  }

  static getChargingStationTemplate() {
    // Read conf
    return Configuration.getConfig().stationTemplate;
  }

  static getNumberofChargingStation() {
    // Read conf
    return Configuration.getConfig().numberOfStation ? Configuration.getConfig().numberOfStation : 0;
  }

  static useWorkerPool() {
    return Configuration.getConfig().useWorkerPool;
  }

  static getWorkerPoolSize() {
    return Configuration.getConfig().workerPoolSize;
  }

  static getConsoleLog() {
    return Utils.objectHasOwnProperty(Configuration.getConfig(), 'consoleLog') ? Configuration.getConfig().consoleLog : false;
  }

  static getLogFile() {
    return Utils.objectHasOwnProperty(Configuration.getConfig(), 'logFile') ? Configuration.getConfig().logFile : 'combined.log';
  }

  static getErrorFile() {
    return Utils.objectHasOwnProperty(Configuration.getConfig(), 'errorFile') ? Configuration.getConfig().errorFile : 'error.log';
  }

  static getAutomaticTransactionConfiguration() {
    // Read conf
    return Configuration.getChargingStationTemplate().AutomaticTransactionGenerator;
  }

  static getSupervisionURLs() {
    // Read conf
    return Configuration.getConfig().supervisionURLs;
  }

  static getEquallySupervisionDistribution() {
    return Configuration.getConfig().distributeStationToTenantEqually;
  }

  static getChargingStationConfiguration() {
    return Utils.objectHasOwnProperty(Configuration.getChargingStationTemplate(), 'Configuration') ? Configuration.getChargingStationTemplate().Configuration : {};
  }

  static getChargingStationAuthorizationFile() {
    return Utils.objectHasOwnProperty(Configuration.getChargingStationTemplate(), 'authorizationFile') ? Configuration.getChargingStationTemplate().authorizationFile : '';
  }

  static getChargingStationConnectors() {
    return Configuration.getChargingStationTemplate().Connectors;
  }

  static getChargingStationConnector(number) {
    return Configuration.getChargingStationTemplate().Connectors[number];
  }
}

module.exports = Configuration;
