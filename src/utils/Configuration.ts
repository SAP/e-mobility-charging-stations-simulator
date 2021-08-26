import ConfigurationData, { StationTemplateURL, StorageConfiguration } from '../types/ConfigurationData';

import Constants from './Constants';
import { StorageType } from '../types/Storage';
import type { WorkerChoiceStrategy } from 'poolifier';
import { WorkerProcessType } from '../types/Worker';
import fs from 'fs';
import path from 'path';

export default class Configuration {
  private static configurationFilePath = path.join(path.resolve(__dirname, '../'), 'assets', 'config.json');
  private static configurationFileWatcher: fs.FSWatcher;
  private static configuration: ConfigurationData | null = null;
  private static configurationChangeCallback: () => Promise<void>;

  static setConfigurationChangeCallback(cb: () => Promise<void>): void {
    Configuration.configurationChangeCallback = cb;
  }

  static getLogStatisticsInterval(): number {
    Configuration.warnDeprecatedConfigurationKey('statisticsDisplayInterval', 'Use \'logStatisticsInterval\' instead');
    // Read conf
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'logStatisticsInterval') ? Configuration.getConfig().logStatisticsInterval : 60;
  }

  static getPerformanceStorage(): StorageConfiguration {
    let storageConfiguration: StorageConfiguration;
    if (Configuration.objectHasOwnProperty(Configuration.getConfig(), 'performanceStorage')) {
      storageConfiguration =
      {
        ...Configuration.objectHasOwnProperty(Configuration.getConfig().performanceStorage, 'enabled') ? { enabled: Configuration.getConfig().performanceStorage.enabled } : { enabled: false },
        ...Configuration.objectHasOwnProperty(Configuration.getConfig().performanceStorage, 'type') ? { type: Configuration.getConfig().performanceStorage.type } : { type: StorageType.JSON_FILE },
        ...Configuration.objectHasOwnProperty(Configuration.getConfig().performanceStorage, 'URI') ? { URI: Configuration.getConfig().performanceStorage.URI } : { URI: 'file:///performanceMeasurements.json' }
      };
    } else {
      storageConfiguration =
      {
        enabled: false,
        type: StorageType.JSON_FILE,
        URI: 'file:///performanceMeasurements.json'
      };
    }
    return storageConfiguration;
  }

  static getAutoReconnectMaxRetries(): number {
    Configuration.warnDeprecatedConfigurationKey('autoReconnectTimeout', 'Use \'ConnectionTimeOut\' OCPP parameter in charging station template instead');
    Configuration.warnDeprecatedConfigurationKey('connectionTimeout', 'Use \'ConnectionTimeOut\' OCPP parameter in charging station template instead');
    Configuration.warnDeprecatedConfigurationKey('autoReconnectMaxRetries', 'Use it in charging station template instead');
    // Read conf
    if (Configuration.objectHasOwnProperty(Configuration.getConfig(), 'autoReconnectMaxRetries')) {
      return Configuration.getConfig().autoReconnectMaxRetries;
    }
  }

  static getStationTemplateURLs(): StationTemplateURL[] {
    Configuration.getConfig().stationTemplateURLs.forEach((stationURL: StationTemplateURL) => {
      if (!Configuration.isUndefined(stationURL['numberOfStation'])) {
        console.error(`${Configuration.logPrefix()} Deprecated configuration key 'numberOfStation' usage for template file '${stationURL.file}' in 'stationTemplateURLs'. Use 'numberOfStations' instead`);
      }
    });
    // Read conf
    return Configuration.getConfig().stationTemplateURLs;
  }

  static getWorkerProcess(): WorkerProcessType {
    Configuration.warnDeprecatedConfigurationKey('useWorkerPool;', 'Use \'workerProcess\' to define the type of worker process to use instead');
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'workerProcess') ? Configuration.getConfig().workerProcess : WorkerProcessType.WORKER_SET;
  }

  static getWorkerStartDelay(): number {
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'workerStartDelay') ? Configuration.getConfig().workerStartDelay : Constants.WORKER_START_DELAY;
  }

  static getWorkerPoolMinSize(): number {
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'workerPoolMinSize') ? Configuration.getConfig().workerPoolMinSize : Constants.DEFAULT_WORKER_POOL_MIN_SIZE;
  }

  static getWorkerPoolMaxSize(): number {
    Configuration.warnDeprecatedConfigurationKey('workerPoolSize;', 'Use \'workerPoolMaxSize\' instead');
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'workerPoolMaxSize') ? Configuration.getConfig().workerPoolMaxSize : Constants.DEFAULT_WORKER_POOL_MAX_SIZE;
  }

  static getWorkerPoolStrategy(): WorkerChoiceStrategy {
    return Configuration.getConfig().workerPoolStrategy;
  }

  static getChargingStationsPerWorker(): number {
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'chargingStationsPerWorker') ? Configuration.getConfig().chargingStationsPerWorker : Constants.DEFAULT_CHARGING_STATIONS_PER_WORKER;
  }

  static getLogConsole(): boolean {
    Configuration.warnDeprecatedConfigurationKey('consoleLog', 'Use \'logConsole\' instead');
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
    Configuration.warnDeprecatedConfigurationKey('errorFile', 'Use \'logErrorFile\' instead');
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'logErrorFile') ? Configuration.getConfig().logErrorFile : 'error.log';
  }

  static getSupervisionURLs(): string[] {
    // Read conf
    return Configuration.getConfig().supervisionURLs;
  }

  static getDistributeStationsToTenantsEqually(): boolean {
    Configuration.warnDeprecatedConfigurationKey('distributeStationToTenantEqually', 'Use \'distributeStationsToTenantsEqually\' instead');
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'distributeStationsToTenantsEqually') ? Configuration.getConfig().distributeStationsToTenantsEqually : true;
  }

  private static logPrefix(): string {
    return new Date().toLocaleString() + ' Simulator configuration |';
  }

  private static warnDeprecatedConfigurationKey(key: string, sectionName?: string, logMsgToAppend = '') {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (sectionName && !Configuration.isUndefined(Configuration.getConfig()[sectionName]) && !Configuration.isUndefined(Configuration.getConfig()[sectionName][key])) {
      console.error(`${Configuration.logPrefix()} Deprecated configuration key '${key}' usage in section '${sectionName}'${logMsgToAppend && '. ' + logMsgToAppend}`);
    } else if (!Configuration.isUndefined(Configuration.getConfig()[key])) {
      console.error(`${Configuration.logPrefix()} Deprecated configuration key '${key}' usage${logMsgToAppend && '. ' + logMsgToAppend}`);
    }
  }

  // Read the config file
  private static getConfig(): ConfigurationData {
    if (!Configuration.configuration) {
      try {
        Configuration.configuration = JSON.parse(fs.readFileSync(Configuration.configurationFilePath, 'utf8')) as ConfigurationData;
      } catch (error) {
        Configuration.handleFileException(Configuration.logPrefix(), 'Configuration', Configuration.configurationFilePath, error);
      }
      if (!Configuration.configurationFileWatcher) {
        Configuration.configurationFileWatcher = Configuration.getConfigurationFileWatcher();
      }
    }
    return Configuration.configuration;
  }

  private static getConfigurationFileWatcher(): fs.FSWatcher {
    try {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      return fs.watch(Configuration.configurationFilePath).on('change', async (): Promise<void> => {
        // Nullify to force configuration file reading
        Configuration.configuration = null;
        if (!Configuration.isUndefined(Configuration.configurationChangeCallback)) {
          await Configuration.configurationChangeCallback();
        }
      });
    } catch (error) {
      Configuration.handleFileException(Configuration.logPrefix(), 'Configuration', Configuration.configurationFilePath, error);
    }
  }

  private static objectHasOwnProperty(object: any, property: string): boolean {
    return Object.prototype.hasOwnProperty.call(object, property) as boolean;
  }

  private static isUndefined(obj: any): boolean {
    return typeof obj === 'undefined';
  }

  private static handleFileException(logPrefix: string, fileType: string, filePath: string, error: NodeJS.ErrnoException): void {
    const prefix = logPrefix.length !== 0 ? logPrefix + ' ' : '';
    if (error.code === 'ENOENT') {
      console.error(prefix + fileType + ' file ' + filePath + ' not found: ', error);
    } else if (error.code === 'EEXIST') {
      console.error(prefix + fileType + ' file ' + filePath + ' already exists: ', error);
    } else if (error.code === 'EACCES') {
      console.error(prefix + fileType + ' file ' + filePath + ' access denied: ', error);
    } else {
      console.error(prefix + fileType + ' file ' + filePath + ' error: ', error);
    }
    throw error;
  }
}
