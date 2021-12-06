import ConfigurationData, { StationTemplateUrl, StorageConfiguration, UIWebSocketServerConfiguration } from '../types/ConfigurationData';

import Constants from './Constants';
import { ServerOptions } from 'ws';
import { StorageType } from '../types/Storage';
import type { WorkerChoiceStrategy } from 'poolifier';
import { WorkerProcessType } from '../types/Worker';
import chalk from 'chalk';
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
    Configuration.warnDeprecatedConfigurationKey('statisticsDisplayInterval', null, 'Use \'logStatisticsInterval\' instead');
    // Read conf
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'logStatisticsInterval') ? Configuration.getConfig().logStatisticsInterval : 60;
  }

  static getUIWebSocketServer(): UIWebSocketServerConfiguration {
    let options: ServerOptions = {
      host: Constants.DEFAULT_UI_WEBSOCKET_SERVER_HOST,
      port: Constants.DEFAULT_UI_WEBSOCKET_SERVER_PORT
    };
    let uiWebSocketServerConfiguration: UIWebSocketServerConfiguration = {
      enabled: true,
      options
    };
    if (Configuration.objectHasOwnProperty(Configuration.getConfig(), 'uiWebSocketServer')) {
      if (Configuration.objectHasOwnProperty(Configuration.getConfig().uiWebSocketServer, 'options')) {
        options = {
          ...Configuration.objectHasOwnProperty(Configuration.getConfig().uiWebSocketServer.options, 'host') && { host: Configuration.getConfig().uiWebSocketServer.options.host },
          ...Configuration.objectHasOwnProperty(Configuration.getConfig().uiWebSocketServer.options, 'port') && { port: Configuration.getConfig().uiWebSocketServer.options.port }
        };
      }
      uiWebSocketServerConfiguration =
      {
        ...Configuration.objectHasOwnProperty(Configuration.getConfig().uiWebSocketServer, 'enabled') && { enabled: Configuration.getConfig().uiWebSocketServer.enabled },
        options
      };
    }
    return uiWebSocketServerConfiguration;
  }

  static getPerformanceStorage(): StorageConfiguration {
    Configuration.warnDeprecatedConfigurationKey('URI', 'performanceStorage', 'Use \'uri\' instead');
    let storageConfiguration: StorageConfiguration = {
      enabled: false,
      type: StorageType.JSON_FILE,
      uri: this.getDefaultPerformanceStorageUri(StorageType.JSON_FILE)
    };
    if (Configuration.objectHasOwnProperty(Configuration.getConfig(), 'performanceStorage')) {
      storageConfiguration =
      {
        ...Configuration.objectHasOwnProperty(Configuration.getConfig().performanceStorage, 'enabled') && { enabled: Configuration.getConfig().performanceStorage.enabled },
        ...Configuration.objectHasOwnProperty(Configuration.getConfig().performanceStorage, 'type') && { type: Configuration.getConfig().performanceStorage.type },
        ...Configuration.objectHasOwnProperty(Configuration.getConfig().performanceStorage, 'uri')
          ? { uri: Configuration.getConfig().performanceStorage.uri }
          : { uri: this.getDefaultPerformanceStorageUri(Configuration.getConfig()?.performanceStorage?.type ?? StorageType.JSON_FILE) }
      };
    }
    return storageConfiguration;
  }

  static getAutoReconnectMaxRetries(): number {
    Configuration.warnDeprecatedConfigurationKey('autoReconnectTimeout', null, 'Use \'ConnectionTimeOut\' OCPP parameter in charging station template instead');
    Configuration.warnDeprecatedConfigurationKey('connectionTimeout', null, 'Use \'ConnectionTimeOut\' OCPP parameter in charging station template instead');
    Configuration.warnDeprecatedConfigurationKey('autoReconnectMaxRetries', null, 'Use it in charging station template instead');
    // Read conf
    if (Configuration.objectHasOwnProperty(Configuration.getConfig(), 'autoReconnectMaxRetries')) {
      return Configuration.getConfig().autoReconnectMaxRetries;
    }
  }

  static getStationTemplateUrls(): StationTemplateUrl[] {
    Configuration.warnDeprecatedConfigurationKey('stationTemplateURLs', null, 'Use \'stationTemplateUrls\' instead');
    !Configuration.isUndefined(Configuration.getConfig()['stationTemplateURLs']) && (Configuration.getConfig().stationTemplateUrls = Configuration.getConfig()['stationTemplateURLs'] as StationTemplateUrl[]);
    Configuration.getConfig().stationTemplateUrls.forEach((stationUrl: StationTemplateUrl) => {
      if (!Configuration.isUndefined(stationUrl['numberOfStation'])) {
        console.error(chalk`{green ${Configuration.logPrefix()}} {red Deprecated configuration key 'numberOfStation' usage for template file '${stationUrl.file}' in 'stationTemplateUrls'. Use 'numberOfStations' instead}`);
      }
    });
    // Read conf
    return Configuration.getConfig().stationTemplateUrls;
  }

  static getWorkerProcess(): WorkerProcessType {
    Configuration.warnDeprecatedConfigurationKey('useWorkerPool;', null, 'Use \'workerProcess\' to define the type of worker process to use instead');
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'workerProcess') ? Configuration.getConfig().workerProcess : WorkerProcessType.WORKER_SET;
  }

  static getWorkerStartDelay(): number {
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'workerStartDelay') ? Configuration.getConfig().workerStartDelay : Constants.WORKER_START_DELAY;
  }

  static getWorkerPoolMinSize(): number {
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'workerPoolMinSize') ? Configuration.getConfig().workerPoolMinSize : Constants.DEFAULT_WORKER_POOL_MIN_SIZE;
  }

  static getWorkerPoolMaxSize(): number {
    Configuration.warnDeprecatedConfigurationKey('workerPoolSize;', null, 'Use \'workerPoolMaxSize\' instead');
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'workerPoolMaxSize') ? Configuration.getConfig().workerPoolMaxSize : Constants.DEFAULT_WORKER_POOL_MAX_SIZE;
  }

  static getWorkerPoolStrategy(): WorkerChoiceStrategy {
    return Configuration.getConfig().workerPoolStrategy;
  }

  static getChargingStationsPerWorker(): number {
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'chargingStationsPerWorker') ? Configuration.getConfig().chargingStationsPerWorker : Constants.DEFAULT_CHARGING_STATIONS_PER_WORKER;
  }

  static getLogConsole(): boolean {
    Configuration.warnDeprecatedConfigurationKey('consoleLog', null, 'Use \'logConsole\' instead');
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
    Configuration.warnDeprecatedConfigurationKey('errorFile', null, 'Use \'logErrorFile\' instead');
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'logErrorFile') ? Configuration.getConfig().logErrorFile : 'error.log';
  }

  static getSupervisionUrls(): string[] {
    Configuration.warnDeprecatedConfigurationKey('supervisionURLs', null, 'Use \'supervisionUrls\' instead');
    !Configuration.isUndefined(Configuration.getConfig()['supervisionURLs']) && (Configuration.getConfig().supervisionUrls = Configuration.getConfig()['supervisionURLs'] as string[]);
    // Read conf
    return Configuration.getConfig().supervisionUrls;
  }

  static getDistributeStationsToTenantsEqually(): boolean {
    Configuration.warnDeprecatedConfigurationKey('distributeStationToTenantEqually', null, 'Use \'distributeStationsToTenantsEqually\' instead');
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'distributeStationsToTenantsEqually') ? Configuration.getConfig().distributeStationsToTenantsEqually : true;
  }

  private static logPrefix(): string {
    return new Date().toLocaleString() + ' Simulator configuration |';
  }

  private static warnDeprecatedConfigurationKey(key: string, sectionName?: string, logMsgToAppend = '') {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (sectionName && !Configuration.isUndefined(Configuration.getConfig()[sectionName]) && !Configuration.isUndefined(Configuration.getConfig()[sectionName][key])) {
      console.error(chalk`{green ${Configuration.logPrefix()}} {red Deprecated configuration key '${key}' usage in section '${sectionName}'${logMsgToAppend && '. ' + logMsgToAppend}}`);
    } else if (!Configuration.isUndefined(Configuration.getConfig()[key])) {
      console.error(chalk`{green ${Configuration.logPrefix()}} {red Deprecated configuration key '${key}' usage${logMsgToAppend && '. ' + logMsgToAppend}}`);
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
      return fs.watch(Configuration.configurationFilePath, async (event, filename): Promise<void> => {
        if (filename && event === 'change') {
          // Nullify to force configuration file reading
          Configuration.configuration = null;
          if (!Configuration.isUndefined(Configuration.configurationChangeCallback)) {
            await Configuration.configurationChangeCallback();
          }
        }
      });
    } catch (error) {
      Configuration.handleFileException(Configuration.logPrefix(), 'Configuration', Configuration.configurationFilePath, error);
    }
  }

  private static getDefaultPerformanceStorageUri(storageType: StorageType) {
    const SQLiteFileName = `${Constants.DEFAULT_PERFORMANCE_RECORDS_DB_NAME}.db`;
    switch (storageType) {
      case StorageType.JSON_FILE:
        return `file://${path.join(path.resolve(__dirname, '../../'), Constants.DEFAULT_PERFORMANCE_RECORDS_FILENAME)}`;
      case StorageType.SQLITE:
        return `file://${path.join(path.resolve(__dirname, '../../'), SQLiteFileName)}`;
      default:
        throw new Error(`Performance storage URI is mandatory with storage type '${storageType}'`);
    }
  }

  private static objectHasOwnProperty(object: unknown, property: string): boolean {
    return Object.prototype.hasOwnProperty.call(object, property) as boolean;
  }

  private static isUndefined(obj: unknown): boolean {
    return typeof obj === 'undefined';
  }

  private static handleFileException(logPrefix: string, fileType: string, filePath: string, error: NodeJS.ErrnoException): void {
    const prefix = logPrefix.length !== 0 ? logPrefix + ' ' : '';
    if (error.code === 'ENOENT') {
      console.error(chalk.green(prefix) + chalk.red(fileType + ' file ' + filePath + ' not found: '), error);
    } else if (error.code === 'EEXIST') {
      console.error(chalk.green(prefix) + chalk.red(fileType + ' file ' + filePath + ' already exists: '), error);
    } else if (error.code === 'EACCES') {
      console.error(chalk.green(prefix) + chalk.red(fileType + ' file ' + filePath + ' access denied: '), error);
    } else {
      console.error(chalk.green(prefix) + chalk.red(fileType + ' file ' + filePath + ' error: '), error);
    }
    throw error;
  }
}
