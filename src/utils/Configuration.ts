import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import chalk from 'chalk';
import merge from 'just-merge';
import { WorkerChoiceStrategies } from 'poolifier';

import Constants from './Constants';
import {
  type ConfigurationData,
  type StationTemplateUrl,
  type StorageConfiguration,
  SupervisionUrlDistribution,
  type UIServerConfiguration,
  type WorkerConfiguration,
} from '../types/ConfigurationData';
import type { EmptyObject } from '../types/EmptyObject';
import type { HandleErrorParams } from '../types/Error';
import { FileType } from '../types/FileType';
import { StorageType } from '../types/Storage';
import { ApplicationProtocol } from '../types/UIProtocol';
import { WorkerProcessType } from '../types/Worker';
import WorkerConstants from '../worker/WorkerConstants';

export default class Configuration {
  private static configurationFile = path.join(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../'),
    'assets',
    'config.json'
  );

  private static configurationFileWatcher: fs.FSWatcher | undefined;
  private static configuration: ConfigurationData | null = null;
  private static configurationChangeCallback: () => Promise<void>;

  private constructor() {
    // This is intentional
  }

  static setConfigurationChangeCallback(cb: () => Promise<void>): void {
    Configuration.configurationChangeCallback = cb;
  }

  static getLogStatisticsInterval(): number | undefined {
    Configuration.warnDeprecatedConfigurationKey(
      'statisticsDisplayInterval',
      undefined,
      "Use 'logStatisticsInterval' instead"
    );
    // Read conf
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'logStatisticsInterval')
      ? Configuration.getConfig()?.logStatisticsInterval
      : Constants.DEFAULT_LOG_STATISTICS_INTERVAL;
  }

  static getUIServer(): UIServerConfiguration {
    if (Configuration.objectHasOwnProperty(Configuration.getConfig(), 'uiWebSocketServer')) {
      console.error(
        chalk`{green ${Configuration.logPrefix()}} {red Deprecated configuration section 'uiWebSocketServer' usage. Use 'uiServer' instead}`
      );
    }
    let uiServerConfiguration: UIServerConfiguration = {
      enabled: false,
      type: ApplicationProtocol.WS,
      options: {
        host: Constants.DEFAULT_UI_SERVER_HOST,
        port: Constants.DEFAULT_UI_SERVER_PORT,
      },
    };
    if (Configuration.objectHasOwnProperty(Configuration.getConfig(), 'uiServer')) {
      uiServerConfiguration = merge<UIServerConfiguration>(
        uiServerConfiguration,
        Configuration.getConfig()?.uiServer
      );
    }
    if (Configuration.isCFEnvironment() === true) {
      delete uiServerConfiguration.options?.host;
      uiServerConfiguration.options.port = parseInt(process.env.PORT);
    }
    return uiServerConfiguration;
  }

  static getPerformanceStorage(): StorageConfiguration {
    Configuration.warnDeprecatedConfigurationKey('URI', 'performanceStorage', "Use 'uri' instead");
    let storageConfiguration: StorageConfiguration = {
      enabled: false,
      type: StorageType.JSON_FILE,
      uri: this.getDefaultPerformanceStorageUri(StorageType.JSON_FILE),
    };
    if (Configuration.objectHasOwnProperty(Configuration.getConfig(), 'performanceStorage')) {
      storageConfiguration = {
        ...storageConfiguration,
        ...Configuration.getConfig()?.performanceStorage,
      };
    }
    return storageConfiguration;
  }

  static getAutoReconnectMaxRetries(): number | undefined {
    Configuration.warnDeprecatedConfigurationKey(
      'autoReconnectTimeout',
      undefined,
      "Use 'ConnectionTimeOut' OCPP parameter in charging station template instead"
    );
    Configuration.warnDeprecatedConfigurationKey(
      'connectionTimeout',
      undefined,
      "Use 'ConnectionTimeOut' OCPP parameter in charging station template instead"
    );
    Configuration.warnDeprecatedConfigurationKey(
      'autoReconnectMaxRetries',
      undefined,
      'Use it in charging station template instead'
    );
    // Read conf
    if (Configuration.objectHasOwnProperty(Configuration.getConfig(), 'autoReconnectMaxRetries')) {
      return Configuration.getConfig()?.autoReconnectMaxRetries;
    }
  }

  static getStationTemplateUrls(): StationTemplateUrl[] | undefined {
    Configuration.warnDeprecatedConfigurationKey(
      'stationTemplateURLs',
      undefined,
      "Use 'stationTemplateUrls' instead"
    );
    !Configuration.isUndefined(Configuration.getConfig()['stationTemplateURLs']) &&
      (Configuration.getConfig().stationTemplateUrls = Configuration.getConfig()[
        'stationTemplateURLs'
      ] as unknown as StationTemplateUrl[]);
    Configuration.getConfig().stationTemplateUrls.forEach((stationUrl: StationTemplateUrl) => {
      if (!Configuration.isUndefined(stationUrl['numberOfStation'])) {
        console.error(
          chalk`{green ${Configuration.logPrefix()}} {red Deprecated configuration key 'numberOfStation' usage for template file '${
            stationUrl.file
          }' in 'stationTemplateUrls'. Use 'numberOfStations' instead}`
        );
      }
    });
    // Read conf
    return Configuration.getConfig()?.stationTemplateUrls;
  }

  static getWorker(): WorkerConfiguration {
    Configuration.warnDeprecatedConfigurationKey(
      'useWorkerPool',
      undefined,
      "Use 'worker' section to define the type of worker process model instead"
    );
    Configuration.warnDeprecatedConfigurationKey(
      'workerProcess',
      undefined,
      "Use 'worker' section to define the type of worker process model instead"
    );
    Configuration.warnDeprecatedConfigurationKey(
      'workerStartDelay',
      undefined,
      "Use 'worker' section to define the worker start delay instead"
    );
    Configuration.warnDeprecatedConfigurationKey(
      'chargingStationsPerWorker',
      undefined,
      "Use 'worker' section to define the number of element(s) per worker instead"
    );
    Configuration.warnDeprecatedConfigurationKey(
      'elementStartDelay',
      undefined,
      "Use 'worker' section to define the worker's element start delay instead"
    );
    Configuration.warnDeprecatedConfigurationKey(
      'workerPoolMinSize',
      undefined,
      "Use 'worker' section to define the worker pool minimum size instead"
    );
    Configuration.warnDeprecatedConfigurationKey(
      'workerPoolSize;',
      undefined,
      "Use 'worker' section to define the worker pool maximum size instead"
    );
    Configuration.warnDeprecatedConfigurationKey(
      'workerPoolMaxSize;',
      undefined,
      "Use 'worker' section to define the worker pool maximum size instead"
    );
    Configuration.warnDeprecatedConfigurationKey(
      'workerPoolStrategy;',
      undefined,
      "Use 'worker' section to define the worker pool strategy instead"
    );
    let workerConfiguration: WorkerConfiguration = {
      processType: Configuration.objectHasOwnProperty(Configuration.getConfig(), 'workerProcess')
        ? Configuration.getConfig()?.workerProcess
        : WorkerProcessType.WORKER_SET,
      startDelay: Configuration.objectHasOwnProperty(Configuration.getConfig(), 'workerStartDelay')
        ? Configuration.getConfig()?.workerStartDelay
        : WorkerConstants.DEFAULT_WORKER_START_DELAY,
      elementsPerWorker: Configuration.objectHasOwnProperty(
        Configuration.getConfig(),
        'chargingStationsPerWorker'
      )
        ? Configuration.getConfig()?.chargingStationsPerWorker
        : WorkerConstants.DEFAULT_ELEMENTS_PER_WORKER,
      elementStartDelay: Configuration.objectHasOwnProperty(
        Configuration.getConfig(),
        'elementStartDelay'
      )
        ? Configuration.getConfig()?.elementStartDelay
        : WorkerConstants.DEFAULT_ELEMENT_START_DELAY,
      poolMinSize: Configuration.objectHasOwnProperty(
        Configuration.getConfig(),
        'workerPoolMinSize'
      )
        ? Configuration.getConfig()?.workerPoolMinSize
        : WorkerConstants.DEFAULT_POOL_MIN_SIZE,
      poolMaxSize: Configuration.objectHasOwnProperty(
        Configuration.getConfig(),
        'workerPoolMaxSize'
      )
        ? Configuration.getConfig()?.workerPoolMaxSize
        : WorkerConstants.DEFAULT_POOL_MAX_SIZE,
      poolStrategy:
        Configuration.getConfig()?.workerPoolStrategy ?? WorkerChoiceStrategies.ROUND_ROBIN,
    };
    if (Configuration.objectHasOwnProperty(Configuration.getConfig(), 'worker')) {
      workerConfiguration = { ...workerConfiguration, ...Configuration.getConfig()?.worker };
    }
    return workerConfiguration;
  }

  static getLogConsole(): boolean | undefined {
    Configuration.warnDeprecatedConfigurationKey(
      'consoleLog',
      undefined,
      "Use 'logConsole' instead"
    );
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'logConsole')
      ? Configuration.getConfig()?.logConsole
      : false;
  }

  static getLogFormat(): string | undefined {
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'logFormat')
      ? Configuration.getConfig()?.logFormat
      : 'simple';
  }

  static getLogRotate(): boolean | undefined {
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'logRotate')
      ? Configuration.getConfig()?.logRotate
      : true;
  }

  static getLogMaxFiles(): number | string | false | undefined {
    return (
      Configuration.objectHasOwnProperty(Configuration.getConfig(), 'logMaxFiles') &&
      Configuration.getConfig()?.logMaxFiles
    );
  }

  static getLogMaxSize(): number | string | false | undefined {
    return (
      Configuration.objectHasOwnProperty(Configuration.getConfig(), 'logMaxFiles') &&
      Configuration.getConfig()?.logMaxSize
    );
  }

  static getLogLevel(): string | undefined {
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'logLevel')
      ? Configuration.getConfig()?.logLevel?.toLowerCase()
      : 'info';
  }

  static getLogFile(): string | undefined {
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'logFile')
      ? Configuration.getConfig()?.logFile
      : 'combined.log';
  }

  static getLogErrorFile(): string | undefined {
    Configuration.warnDeprecatedConfigurationKey(
      'errorFile',
      undefined,
      "Use 'logErrorFile' instead"
    );
    return Configuration.objectHasOwnProperty(Configuration.getConfig(), 'logErrorFile')
      ? Configuration.getConfig()?.logErrorFile
      : 'error.log';
  }

  static getSupervisionUrls(): string | string[] | undefined {
    Configuration.warnDeprecatedConfigurationKey(
      'supervisionURLs',
      undefined,
      "Use 'supervisionUrls' instead"
    );
    !Configuration.isUndefined(Configuration.getConfig()['supervisionURLs']) &&
      (Configuration.getConfig().supervisionUrls = Configuration.getConfig()['supervisionURLs'] as
        | string
        | string[]);
    // Read conf
    return Configuration.getConfig()?.supervisionUrls;
  }

  static getSupervisionUrlDistribution(): SupervisionUrlDistribution | undefined {
    Configuration.warnDeprecatedConfigurationKey(
      'distributeStationToTenantEqually',
      undefined,
      "Use 'supervisionUrlDistribution' instead"
    );
    Configuration.warnDeprecatedConfigurationKey(
      'distributeStationsToTenantsEqually',
      undefined,
      "Use 'supervisionUrlDistribution' instead"
    );
    return Configuration.objectHasOwnProperty(
      Configuration.getConfig(),
      'supervisionUrlDistribution'
    )
      ? Configuration.getConfig()?.supervisionUrlDistribution
      : SupervisionUrlDistribution.ROUND_ROBIN;
  }

  private static logPrefix = (): string => {
    return `${new Date().toLocaleString()} Simulator configuration |`;
  };

  private static warnDeprecatedConfigurationKey(
    key: string,
    sectionName?: string,
    logMsgToAppend = ''
  ) {
    if (
      sectionName &&
      !Configuration.isUndefined(Configuration.getConfig()[sectionName]) &&
      !Configuration.isUndefined(
        (Configuration.getConfig()[sectionName] as Record<string, unknown>)[key]
      )
    ) {
      console.error(
        chalk`{green ${Configuration.logPrefix()}} {red Deprecated configuration key '${key}' usage in section '${sectionName}'${
          logMsgToAppend.trim().length > 0 && `. ${logMsgToAppend}`
        }}`
      );
    } else if (!Configuration.isUndefined(Configuration.getConfig()[key])) {
      console.error(
        chalk`{green ${Configuration.logPrefix()}} {red Deprecated configuration key '${key}' usage${
          logMsgToAppend.trim().length > 0 && `. ${logMsgToAppend}`
        }}`
      );
    }
  }

  // Read the config file
  private static getConfig(): ConfigurationData | null {
    if (!Configuration.configuration) {
      try {
        Configuration.configuration = JSON.parse(
          fs.readFileSync(Configuration.configurationFile, 'utf8')
        ) as ConfigurationData;
      } catch (error) {
        Configuration.handleFileException(
          Configuration.configurationFile,
          FileType.Configuration,
          error as NodeJS.ErrnoException,
          Configuration.logPrefix()
        );
      }
      if (!Configuration.configurationFileWatcher) {
        Configuration.configurationFileWatcher = Configuration.getConfigurationFileWatcher();
      }
    }
    return Configuration.configuration;
  }

  private static getConfigurationFileWatcher(): fs.FSWatcher | undefined {
    try {
      return fs.watch(Configuration.configurationFile, (event, filename): void => {
        if (filename?.trim().length > 0 && event === 'change') {
          // Nullify to force configuration file reading
          Configuration.configuration = null;
          if (!Configuration.isUndefined(Configuration.configurationChangeCallback)) {
            Configuration.configurationChangeCallback().catch((error) => {
              throw typeof error === 'string' ? new Error(error) : error;
            });
          }
        }
      });
    } catch (error) {
      Configuration.handleFileException(
        Configuration.configurationFile,
        FileType.Configuration,
        error as NodeJS.ErrnoException,
        Configuration.logPrefix()
      );
    }
  }

  private static isCFEnvironment(): boolean {
    return process.env.VCAP_APPLICATION !== undefined;
  }

  private static getDefaultPerformanceStorageUri(storageType: StorageType) {
    switch (storageType) {
      case StorageType.JSON_FILE:
        return `file://${path.join(
          path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../'),
          Constants.DEFAULT_PERFORMANCE_RECORDS_FILENAME
        )}`;
      case StorageType.SQLITE:
        return `file://${path.join(
          path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../'),
          `${Constants.DEFAULT_PERFORMANCE_RECORDS_DB_NAME}.db`
        )}`;
      default:
        throw new Error(`Performance storage URI is mandatory with storage type '${storageType}'`);
    }
  }

  private static objectHasOwnProperty(object: unknown, property: string): boolean {
    return Object.prototype.hasOwnProperty.call(object, property) as boolean;
  }

  private static isUndefined(obj: unknown): boolean {
    return obj === undefined;
  }

  private static handleFileException(
    filePath: string,
    fileType: FileType,
    error: NodeJS.ErrnoException,
    logPrefix: string,
    params: HandleErrorParams<EmptyObject> = { throwError: true }
  ): void {
    const prefix = logPrefix?.trim().length > 0 ? `${logPrefix} ` : '';
    let logMsg: string;
    switch (error.code) {
      case 'ENOENT':
        logMsg = `${fileType} file ${filePath} not found: `;
        break;
      case 'EEXIST':
        logMsg = `${fileType} file ${filePath} already exists: `;
        break;
      case 'EACCES':
        logMsg = `${fileType} file ${filePath} access denied: `;
        break;
      default:
        logMsg = `${fileType} file ${filePath} error: `;
    }
    console.error(`${chalk.green(prefix)}${chalk.red(logMsg)}`, error);
    if (params?.throwError) {
      throw error;
    }
  }
}
