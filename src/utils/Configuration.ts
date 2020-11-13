import ConfigurationData, { StationTemplateURL } from '../types/ConfigurationData';

import Utils from './Utils';
import fs from 'fs';

export default class Configuration {
  static configuration: ConfigurationData;

  // Read the config file
  static getConfig(): ConfigurationData {
    if (!Configuration.configuration) {
      Configuration.configuration = JSON.parse(fs.readFileSync('./src/assets/config.json', 'utf8')) as ConfigurationData;
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

  static getStationTemplateURLs(): StationTemplateURL[] {
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
    return Utils.objectHasOwnProperty(Configuration.getConfig(), 'logErrorFile') ? Configuration.getConfig().logErrorFile : 'error.log';
  }

  static getSupervisionURLs(): string[] {
    // Read conf
    return Configuration.getConfig().supervisionURLs;
  }

  static getDistributeStationsToTenantsEqually(): boolean {
    return Utils.objectHasOwnProperty(Configuration.getConfig(), 'distributeStationsToTenantsEqually') ? Configuration.getConfig().distributeStationsToTenantsEqually : true;
  }
}
