import ConfigurationData, { StationTemplateURL } from '../types/ConfigurationData';

import fs from 'fs';

export default class Configuration {
  private static configuration: ConfigurationData;

  static getStatisticsDisplayInterval(): number {
    // Read conf
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'statisticsDisplayInterval') ? Configuration.getConfig().statisticsDisplayInterval : 60;
  }

  static getConnectionTimeout(): number {
    Configuration.deprecateConfigurationKey('autoReconnectTimeout', 'Use \'connectionTimeout\' in charging station instead');
    Configuration.deprecateConfigurationKey('connectionTimeout', 'Use it in charging station template instead');
    // Read conf
    if (Configuration.objectHasOwnProperty(Configuration.getConfig(), 'connectionTimeout')) {
      return Configuration.getConfig().connectionTimeout;
    }
  }

  static getAutoReconnectMaxRetries(): number {
    Configuration.deprecateConfigurationKey('autoReconnectMaxRetries', 'Use it in charging station template instead');
    // Read conf
    if (Configuration.objectHasOwnProperty(Configuration.getConfig(), 'autoReconnectMaxRetries')) {
      return Configuration.getConfig().autoReconnectMaxRetries;
    }
  }

  static getStationTemplateURLs(): StationTemplateURL[] {
    Configuration.getConfig().stationTemplateURLs.forEach((stationURL: StationTemplateURL) => {
      if (!Configuration.isUndefined(stationURL['numberOfStation'])) {
        console.error(`Deprecated configuration key 'numberOfStation' usage for template file '${stationURL.file}' in 'stationTemplateURLs'. Use 'numberOfStations' instead`);
      }
    });
    // Read conf
    return Configuration.getConfig().stationTemplateURLs;
  }

  static useWorkerPool(): boolean {
    return Configuration.getConfig().useWorkerPool;
  }

  static getWorkerPoolSize(): number {
    return Configuration.getConfig().workerPoolSize;
  }

  static getChargingStationsPerWorker(): number {
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'chargingStationsPerWorker') ? Configuration.getConfig().chargingStationsPerWorker : 1;
  }

  static getLogConsole(): boolean {
    Configuration.deprecateConfigurationKey('consoleLog', 'Use \'logConsole\' instead');
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'logConsole') ? Configuration.getConfig().logConsole : false;
  }

  static getLogFormat(): string {
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'logFormat') ? Configuration.getConfig().logFormat : 'simple';
  }

  static getLogRotate(): boolean {
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'logRotate') ? Configuration.getConfig().logRotate : true;
  }

  static getLogMaxFiles(): number {
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'logMaxFiles') ? Configuration.getConfig().logMaxFiles : 7;
  }

  static getLogLevel(): string {
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'logLevel') ? Configuration.getConfig().logLevel : 'info';
  }

  static getLogFile(): string {
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'logFile') ? Configuration.getConfig().logFile : 'combined.log';
  }

  static getLogErrorFile(): string {
    Configuration.deprecateConfigurationKey('errorFile', 'Use \'logErrorFile\' instead');
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'logErrorFile') ? Configuration.getConfig().logErrorFile : 'error.log';
  }

  static getSupervisionURLs(): string[] {
    // Read conf
    return Configuration.getConfig().supervisionURLs;
  }

  static getDistributeStationsToTenantsEqually(): boolean {
    Configuration.deprecateConfigurationKey('distributeStationToTenantEqually', 'Use \'distributeStationsToTenantsEqually\' instead');
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'distributeStationsToTenantsEqually') ? Configuration.getConfig().distributeStationsToTenantsEqually : true;
  }

  private static deprecateConfigurationKey(key: string, logMsgToAppend = '') {
    if (!Configuration.isUndefined(Configuration.getConfig()[key])) {
      console.error(`Deprecated configuration key '${key}' usage${logMsgToAppend && '. ' + logMsgToAppend}`);
    }
  }

  // Read the config file
  private static getConfig(): ConfigurationData {
    if (!Configuration.configuration) {
      Configuration.configuration = JSON.parse(fs.readFileSync('./src/assets/config.json', 'utf8')) as ConfigurationData;
    }
    return Configuration.configuration;
  }

  private static objectHasOwnProperty(object: any, property: string): boolean {
    return Object.prototype.hasOwnProperty.call(object, property) as boolean;
  }

  private static isUndefined(obj: any): boolean {
    return typeof obj === 'undefined';
  }
}
