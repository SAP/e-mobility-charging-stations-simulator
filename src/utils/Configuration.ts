import Utils from './Utils';
import fs from 'fs';

export default class Configuration {
  static configuration;

  // Read the config file
  static getConfig() {
    if (!Configuration.configuration) {
      Configuration.configuration = JSON.parse(fs.readFileSync('./src/assets/config.json', 'utf8'));
    }
    return Configuration.configuration;
  }

  static getStatisticsDisplayInterval(): number {
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

  static getStationTemplateURLs(): any[] {
    // Read conf
    return Configuration.getConfig().stationTemplateURLs;
  }

  static useWorkerPool(): boolean {
    return Configuration.getConfig().useWorkerPool;
  }

  static getWorkerPoolSize(): number {
    return Configuration.getConfig().workerPoolSize;
  }

  static getConsoleLog(): boolean {
    return Utils.objectHasOwnProperty(Configuration.getConfig(), 'consoleLog') ? Configuration.getConfig().consoleLog : false;
  }

  static getLogFormat(): string {
    return Utils.objectHasOwnProperty(Configuration.getConfig(), 'logFormat') ? Configuration.getConfig().logFormat : 'simple';
  }

  static getLogLevel(): string {
    return Utils.objectHasOwnProperty(Configuration.getConfig(), 'logLevel') ? Configuration.getConfig().logLevel : 'info';
  }

  static getLogFile(): string {
    return Utils.objectHasOwnProperty(Configuration.getConfig(), 'logFile') ? Configuration.getConfig().logFile : 'combined.log';
  }

  static getErrorFile(): string {
    return Utils.objectHasOwnProperty(Configuration.getConfig(), 'errorFile') ? Configuration.getConfig().errorFile : 'error.log';
  }

  static getSupervisionURLs(): string {
    // Read conf
    return Configuration.getConfig().supervisionURLs;
  }

  static getDistributeStationToTenantEqually(): boolean {
    return Utils.objectHasOwnProperty(Configuration.getConfig(), 'distributeStationToTenantEqually') ? Configuration.getConfig().distributeStationToTenantEqually : true;
  }
}
