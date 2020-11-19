import ConfigurationData, { StationTemplateURL } from '../types/ConfigurationData';

import Utils from './Utils';
import fs from 'fs';

export default class Configuration {
  private static configuration: ConfigurationData;

  static getStatisticsDisplayInterval(): number {
    Configuration.deprecateConfigurationKey('');
    // Read conf
    return Utils.objectHasOwnProperty(Configuration.getConfig(), 'statisticsDisplayInterval') ? Configuration.getConfig().statisticsDisplayInterval : 60;
  }

  static getAutoReconnectTimeout(): number {
    // Read conf
    return Utils.objectHasOwnProperty(Configuration.getConfig(), 'autoReconnectTimeout') ? Configuration.getConfig().autoReconnectTimeout : 10;
  }

  static getAutoReconnectMaxRetries(): number {
    // Read conf
    return Utils.objectHasOwnProperty(Configuration.getConfig(), 'autoReconnectMaxRetries') ? Configuration.getConfig().autoReconnectMaxRetries : -1;
  }

  static getStationTemplateURLs(): StationTemplateURL[] {
    Configuration.getConfig().stationTemplateURLs.forEach((stationURL: StationTemplateURL) => {
      if (!Utils.isUndefined(stationURL['numberOfStation'])) {
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

  static getLogConsole(): boolean {
    Configuration.deprecateConfigurationKey('consoleLog', 'Use \'logConsole\' instead');
    return Utils.objectHasOwnProperty(Configuration.getConfig(), 'logConsole') ? Configuration.getConfig().logConsole : false;
  }

  static getLogFormat(): string {
    return Utils.objectHasOwnProperty(Configuration.getConfig(), 'logFormat') ? Configuration.getConfig().logFormat : 'simple';
  }

  static getLogRotate(): boolean {
    return Utils.objectHasOwnProperty(Configuration.getConfig(), 'logRotate') ? Configuration.getConfig().logRotate : true;
  }

  static getLogMaxFiles(): number {
    return Utils.objectHasOwnProperty(Configuration.getConfig(), 'logMaxFiles') ? Configuration.getConfig().logMaxFiles : 7;
  }

  static getLogLevel(): string {
    return Utils.objectHasOwnProperty(Configuration.getConfig(), 'logLevel') ? Configuration.getConfig().logLevel : 'info';
  }

  static getLogFile(): string {
    return Utils.objectHasOwnProperty(Configuration.getConfig(), 'logFile') ? Configuration.getConfig().logFile : 'combined.log';
  }

  static getLogErrorFile(): string {
    Configuration.deprecateConfigurationKey('errorFile', 'Use \'logErrorFile\' instead');
    return Utils.objectHasOwnProperty(Configuration.getConfig(), 'logErrorFile') ? Configuration.getConfig().logErrorFile : 'error.log';
  }

  static getSupervisionURLs(): string[] {
    // Read conf
    return Configuration.getConfig().supervisionURLs;
  }

  static getDistributeStationsToTenantsEqually(): boolean {
    Configuration.deprecateConfigurationKey('distributeStationToTenantEqually', 'Use \'distributeStationsToTenantsEqually\' instead');
    return Utils.objectHasOwnProperty(Configuration.getConfig(), 'distributeStationsToTenantsEqually') ? Configuration.getConfig().distributeStationsToTenantsEqually : true;
  }

  private static deprecateConfigurationKey(key: string, logMsgToAppend = '') {
    if (!Utils.isUndefined(Configuration.getConfig()[key])) {
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
}
