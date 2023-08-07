import { type FSWatcher, readFileSync, watch } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import chalk from 'chalk';
import merge from 'just-merge';

import { Constants } from './Constants';
import { hasOwnProp, isCFEnvironment, isNotEmptyString, isUndefined } from './Utils';
import {
  ApplicationProtocol,
  type ConfigurationData,
  ConfigurationSection,
  FileType,
  type LogConfiguration,
  type StationTemplateUrl,
  type StorageConfiguration,
  StorageType,
  SupervisionUrlDistribution,
  type UIServerConfiguration,
  type WorkerConfiguration,
} from '../types';
import {
  DEFAULT_ELEMENT_START_DELAY,
  DEFAULT_POOL_MAX_SIZE,
  DEFAULT_POOL_MIN_SIZE,
  DEFAULT_WORKER_START_DELAY,
  WorkerProcessType,
} from '../worker';

type ConfigurationSectionType =
  | LogConfiguration
  | StorageConfiguration
  | WorkerConfiguration
  | UIServerConfiguration;

export class Configuration {
  private static configurationFile = join(
    dirname(fileURLToPath(import.meta.url)),
    'assets',
    'config.json',
  );

  private static configurationFileWatcher?: FSWatcher;
  private static configurationData?: ConfigurationData;
  private static configurationSectionCache = new Map<
    ConfigurationSection,
    ConfigurationSectionType
  >([
    [ConfigurationSection.log, Configuration.buildLogSection()],
    [ConfigurationSection.performanceStorage, Configuration.buildPerformanceStorageSection()],
    [ConfigurationSection.worker, Configuration.buildWorkerSection()],
    [ConfigurationSection.uiServer, Configuration.buildUIServerSection()],
  ]);

  private static configurationChangeCallback?: () => Promise<void>;

  private constructor() {
    // This is intentional
  }

  public static setConfigurationChangeCallback(cb: () => Promise<void>): void {
    Configuration.configurationChangeCallback = cb;
  }

  public static getConfigurationSection<T extends ConfigurationSectionType>(
    sectionName: ConfigurationSection,
  ): T {
    if (!Configuration.isConfigurationSectionCached(sectionName)) {
      Configuration.cacheConfigurationSection(sectionName);
    }
    return Configuration.configurationSectionCache.get(sectionName) as T;
  }

  public static getAutoReconnectMaxRetries(): number | undefined {
    Configuration.warnDeprecatedConfigurationKey(
      'autoReconnectTimeout',
      undefined,
      "Use 'ConnectionTimeOut' OCPP parameter in charging station template instead",
    );
    Configuration.warnDeprecatedConfigurationKey(
      'connectionTimeout',
      undefined,
      "Use 'ConnectionTimeOut' OCPP parameter in charging station template instead",
    );
    Configuration.warnDeprecatedConfigurationKey(
      'autoReconnectMaxRetries',
      undefined,
      'Use it in charging station template instead',
    );
    if (hasOwnProp(Configuration.getConfigurationData(), 'autoReconnectMaxRetries')) {
      return Configuration.getConfigurationData()?.autoReconnectMaxRetries;
    }
  }

  public static getStationTemplateUrls(): StationTemplateUrl[] | undefined {
    Configuration.warnDeprecatedConfigurationKey(
      'stationTemplateURLs',
      undefined,
      "Use 'stationTemplateUrls' instead",
    );
    // eslint-disable-next-line @typescript-eslint/dot-notation
    !isUndefined(
      Configuration.getConfigurationData()!['stationTemplateURLs' as keyof ConfigurationData],
    ) &&
      (Configuration.getConfigurationData()!.stationTemplateUrls =
        Configuration.getConfigurationData()![
          // eslint-disable-next-line @typescript-eslint/dot-notation
          'stationTemplateURLs' as keyof ConfigurationData
        ] as StationTemplateUrl[]);
    Configuration.getConfigurationData()!.stationTemplateUrls.forEach(
      (stationTemplateUrl: StationTemplateUrl) => {
        // eslint-disable-next-line @typescript-eslint/dot-notation
        if (!isUndefined(stationTemplateUrl['numberOfStation' as keyof StationTemplateUrl])) {
          console.error(
            `${chalk.green(Configuration.logPrefix())} ${chalk.red(
              `Deprecated configuration key 'numberOfStation' usage for template file '${stationTemplateUrl.file}' in 'stationTemplateUrls'. Use 'numberOfStations' instead`,
            )}`,
          );
        }
      },
    );
    return Configuration.getConfigurationData()?.stationTemplateUrls;
  }

  public static getSupervisionUrls(): string | string[] | undefined {
    Configuration.warnDeprecatedConfigurationKey(
      'supervisionURLs',
      undefined,
      "Use 'supervisionUrls' instead",
    );
    // eslint-disable-next-line @typescript-eslint/dot-notation
    if (
      !isUndefined(
        Configuration.getConfigurationData()!['supervisionURLs' as keyof ConfigurationData],
      )
    ) {
      Configuration.getConfigurationData()!.supervisionUrls = Configuration.getConfigurationData()![
        // eslint-disable-next-line @typescript-eslint/dot-notation
        'supervisionURLs' as keyof ConfigurationData
      ] as string | string[];
    }
    return Configuration.getConfigurationData()?.supervisionUrls;
  }

  public static getSupervisionUrlDistribution(): SupervisionUrlDistribution | undefined {
    Configuration.warnDeprecatedConfigurationKey(
      'distributeStationToTenantEqually',
      undefined,
      "Use 'supervisionUrlDistribution' instead",
    );
    Configuration.warnDeprecatedConfigurationKey(
      'distributeStationsToTenantsEqually',
      undefined,
      "Use 'supervisionUrlDistribution' instead",
    );
    return hasOwnProp(Configuration.getConfigurationData(), 'supervisionUrlDistribution')
      ? Configuration.getConfigurationData()?.supervisionUrlDistribution
      : SupervisionUrlDistribution.ROUND_ROBIN;
  }

  public static workerPoolInUse(): boolean {
    return [WorkerProcessType.dynamicPool, WorkerProcessType.staticPool].includes(
      Configuration.getConfigurationSection<WorkerConfiguration>(ConfigurationSection.worker)
        .processType!,
    );
  }

  public static workerDynamicPoolInUse(): boolean {
    return (
      Configuration.getConfigurationSection<WorkerConfiguration>(ConfigurationSection.worker)
        .processType === WorkerProcessType.dynamicPool
    );
  }

  private static isConfigurationSectionCached(sectionName: ConfigurationSection): boolean {
    return Configuration.configurationSectionCache.has(sectionName);
  }

  private static cacheConfigurationSection(sectionName: ConfigurationSection): void {
    switch (sectionName) {
      case ConfigurationSection.log:
        Configuration.configurationSectionCache.set(sectionName, Configuration.buildLogSection());
        break;
      case ConfigurationSection.performanceStorage:
        Configuration.configurationSectionCache.set(
          sectionName,
          Configuration.buildPerformanceStorageSection(),
        );
        break;
      case ConfigurationSection.worker:
        Configuration.configurationSectionCache.set(
          sectionName,
          Configuration.buildWorkerSection(),
        );
        break;
      case ConfigurationSection.uiServer:
        Configuration.configurationSectionCache.set(
          sectionName,
          Configuration.buildUIServerSection(),
        );
        break;
      default:
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        throw new Error(`Unknown configuration section '${sectionName}'`);
    }
  }

  private static buildUIServerSection(): UIServerConfiguration {
    if (hasOwnProp(Configuration.getConfigurationData(), 'uiWebSocketServer')) {
      console.error(
        `${chalk.green(Configuration.logPrefix())} ${chalk.red(
          `Deprecated configuration section 'uiWebSocketServer' usage. Use '${ConfigurationSection.uiServer}' instead`,
        )}`,
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
    if (hasOwnProp(Configuration.getConfigurationData(), ConfigurationSection.uiServer)) {
      uiServerConfiguration = merge<UIServerConfiguration>(
        uiServerConfiguration,
        Configuration.getConfigurationData()!.uiServer!,
      );
    }
    if (isCFEnvironment() === true) {
      delete uiServerConfiguration.options?.host;
      uiServerConfiguration.options!.port = parseInt(process.env.PORT!);
    }
    return uiServerConfiguration;
  }

  private static buildPerformanceStorageSection(): StorageConfiguration {
    Configuration.warnDeprecatedConfigurationKey(
      'URI',
      ConfigurationSection.performanceStorage,
      "Use 'uri' instead",
    );
    let storageConfiguration: StorageConfiguration = {
      enabled: false,
      type: StorageType.JSON_FILE,
      uri: Configuration.getDefaultPerformanceStorageUri(StorageType.JSON_FILE),
    };
    if (hasOwnProp(Configuration.getConfigurationData(), ConfigurationSection.performanceStorage)) {
      storageConfiguration = {
        ...storageConfiguration,
        ...Configuration.getConfigurationData()?.performanceStorage,
        ...(Configuration.getConfigurationData()?.performanceStorage?.type ===
          StorageType.JSON_FILE &&
          Configuration.getConfigurationData()?.performanceStorage?.uri && {
            uri: Configuration.buildPerformanceUriFilePath(
              new URL(Configuration.getConfigurationData()!.performanceStorage!.uri!).pathname,
            ),
          }),
      };
    }
    return storageConfiguration;
  }

  private static buildLogSection(): LogConfiguration {
    Configuration.warnDeprecatedConfigurationKey(
      'logEnabled',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the logging enablement instead`,
    );
    Configuration.warnDeprecatedConfigurationKey(
      'logFile',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the log file instead`,
    );
    Configuration.warnDeprecatedConfigurationKey(
      'logErrorFile',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the log error file instead`,
    );
    Configuration.warnDeprecatedConfigurationKey(
      'logConsole',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the console logging enablement instead`,
    );
    Configuration.warnDeprecatedConfigurationKey(
      'logStatisticsInterval',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the log statistics interval instead`,
    );
    Configuration.warnDeprecatedConfigurationKey(
      'logLevel',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the log level instead`,
    );
    Configuration.warnDeprecatedConfigurationKey(
      'logFormat',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the log format instead`,
    );
    Configuration.warnDeprecatedConfigurationKey(
      'logRotate',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the log rotation enablement instead`,
    );
    Configuration.warnDeprecatedConfigurationKey(
      'logMaxFiles',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the log maximum files instead`,
    );
    Configuration.warnDeprecatedConfigurationKey(
      'logMaxSize',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the log maximum size instead`,
    );
    const defaultLogConfiguration: LogConfiguration = {
      enabled: true,
      file: 'logs/combined.log',
      errorFile: 'logs/error.log',
      statisticsInterval: Constants.DEFAULT_LOG_STATISTICS_INTERVAL,
      level: 'info',
      format: 'simple',
      rotate: true,
    };
    const deprecatedLogConfiguration: LogConfiguration = {
      ...(hasOwnProp(Configuration.getConfigurationData(), 'logEnabled') && {
        enabled: Configuration.getConfigurationData()?.logEnabled,
      }),
      ...(hasOwnProp(Configuration.getConfigurationData(), 'logFile') && {
        file: Configuration.getConfigurationData()?.logFile,
      }),
      ...(hasOwnProp(Configuration.getConfigurationData(), 'logErrorFile') && {
        errorFile: Configuration.getConfigurationData()?.logErrorFile,
      }),
      ...(hasOwnProp(Configuration.getConfigurationData(), 'logStatisticsInterval') && {
        statisticsInterval: Configuration.getConfigurationData()?.logStatisticsInterval,
      }),
      ...(hasOwnProp(Configuration.getConfigurationData(), 'logLevel') && {
        level: Configuration.getConfigurationData()?.logLevel,
      }),
      ...(hasOwnProp(Configuration.getConfigurationData(), 'logConsole') && {
        console: Configuration.getConfigurationData()?.logConsole,
      }),
      ...(hasOwnProp(Configuration.getConfigurationData(), 'logFormat') && {
        format: Configuration.getConfigurationData()?.logFormat,
      }),
      ...(hasOwnProp(Configuration.getConfigurationData(), 'logRotate') && {
        rotate: Configuration.getConfigurationData()?.logRotate,
      }),
      ...(hasOwnProp(Configuration.getConfigurationData(), 'logMaxFiles') && {
        maxFiles: Configuration.getConfigurationData()?.logMaxFiles,
      }),
      ...(hasOwnProp(Configuration.getConfigurationData(), 'logMaxSize') && {
        maxSize: Configuration.getConfigurationData()?.logMaxSize,
      }),
    };
    const logConfiguration: LogConfiguration = {
      ...defaultLogConfiguration,
      ...deprecatedLogConfiguration,
      ...(hasOwnProp(Configuration.getConfigurationData(), ConfigurationSection.log) &&
        Configuration.getConfigurationData()?.log),
    };
    return logConfiguration;
  }

  private static buildWorkerSection(): WorkerConfiguration {
    Configuration.warnDeprecatedConfigurationKey(
      'useWorkerPool',
      undefined,
      `Use '${ConfigurationSection.worker}' section to define the type of worker process model instead`,
    );
    Configuration.warnDeprecatedConfigurationKey(
      'workerProcess',
      undefined,
      `Use '${ConfigurationSection.worker}' section to define the type of worker process model instead`,
    );
    Configuration.warnDeprecatedConfigurationKey(
      'workerStartDelay',
      undefined,
      `Use '${ConfigurationSection.worker}' section to define the worker start delay instead`,
    );
    Configuration.warnDeprecatedConfigurationKey(
      'chargingStationsPerWorker',
      undefined,
      `Use '${ConfigurationSection.worker}' section to define the number of element(s) per worker instead`,
    );
    Configuration.warnDeprecatedConfigurationKey(
      'elementStartDelay',
      undefined,
      `Use '${ConfigurationSection.worker}' section to define the worker's element start delay instead`,
    );
    Configuration.warnDeprecatedConfigurationKey(
      'workerPoolMinSize',
      undefined,
      `Use '${ConfigurationSection.worker}' section to define the worker pool minimum size instead`,
    );
    Configuration.warnDeprecatedConfigurationKey(
      'workerPoolSize;',
      undefined,
      `Use '${ConfigurationSection.worker}' section to define the worker pool maximum size instead`,
    );
    Configuration.warnDeprecatedConfigurationKey(
      'workerPoolMaxSize;',
      undefined,
      `Use '${ConfigurationSection.worker}' section to define the worker pool maximum size instead`,
    );
    Configuration.warnDeprecatedConfigurationKey(
      'workerPoolStrategy;',
      undefined,
      `Use '${ConfigurationSection.worker}' section to define the worker pool strategy instead`,
    );
    const defaultWorkerConfiguration: WorkerConfiguration = {
      processType: WorkerProcessType.workerSet,
      startDelay: DEFAULT_WORKER_START_DELAY,
      elementsPerWorker: 'auto',
      elementStartDelay: DEFAULT_ELEMENT_START_DELAY,
      poolMinSize: DEFAULT_POOL_MIN_SIZE,
      poolMaxSize: DEFAULT_POOL_MAX_SIZE,
    };
    hasOwnProp(Configuration.getConfigurationData(), 'workerPoolStrategy') &&
      delete Configuration.getConfigurationData()?.workerPoolStrategy;
    const deprecatedWorkerConfiguration: WorkerConfiguration = {
      ...(hasOwnProp(Configuration.getConfigurationData(), 'workerProcess') && {
        processType: Configuration.getConfigurationData()?.workerProcess,
      }),
      ...(hasOwnProp(Configuration.getConfigurationData(), 'workerStartDelay') && {
        startDelay: Configuration.getConfigurationData()?.workerStartDelay,
      }),
      ...(hasOwnProp(Configuration.getConfigurationData(), 'chargingStationsPerWorker') && {
        elementsPerWorker: Configuration.getConfigurationData()?.chargingStationsPerWorker,
      }),
      ...(hasOwnProp(Configuration.getConfigurationData(), 'elementStartDelay') && {
        elementStartDelay: Configuration.getConfigurationData()?.elementStartDelay,
      }),
      ...(hasOwnProp(Configuration.getConfigurationData(), 'workerPoolMinSize') && {
        poolMinSize: Configuration.getConfigurationData()?.workerPoolMinSize,
      }),
      ...(hasOwnProp(Configuration.getConfigurationData(), 'workerPoolMaxSize') && {
        poolMaxSize: Configuration.getConfigurationData()?.workerPoolMaxSize,
      }),
    };
    Configuration.warnDeprecatedConfigurationKey(
      'poolStrategy',
      ConfigurationSection.worker,
      'Not publicly exposed to end users',
    );
    const workerConfiguration: WorkerConfiguration = {
      ...defaultWorkerConfiguration,
      ...deprecatedWorkerConfiguration,
      ...(hasOwnProp(Configuration.getConfigurationData(), ConfigurationSection.worker) &&
        Configuration.getConfigurationData()?.worker),
    };
    if (!Object.values(WorkerProcessType).includes(workerConfiguration.processType!)) {
      throw new SyntaxError(
        `Invalid worker process type '${workerConfiguration.processType}' defined in configuration`,
      );
    }
    return workerConfiguration;
  }

  private static logPrefix = (): string => {
    return `${new Date().toLocaleString()} Simulator configuration |`;
  };

  private static warnDeprecatedConfigurationKey(
    key: string,
    sectionName?: string,
    logMsgToAppend = '',
  ) {
    if (
      sectionName &&
      !isUndefined(Configuration.getConfigurationData()![sectionName as keyof ConfigurationData]) &&
      !isUndefined(
        (
          Configuration.getConfigurationData()![sectionName as keyof ConfigurationData] as Record<
            string,
            unknown
          >
        )[key],
      )
    ) {
      console.error(
        `${chalk.green(Configuration.logPrefix())} ${chalk.red(
          `Deprecated configuration key '${key}' usage in section '${sectionName}'${
            logMsgToAppend.trim().length > 0 ? `. ${logMsgToAppend}` : ''
          }`,
        )}`,
      );
    } else if (
      !isUndefined(Configuration.getConfigurationData()![key as keyof ConfigurationData])
    ) {
      console.error(
        `${chalk.green(Configuration.logPrefix())} ${chalk.red(
          `Deprecated configuration key '${key}' usage${
            logMsgToAppend.trim().length > 0 ? `. ${logMsgToAppend}` : ''
          }`,
        )}`,
      );
    }
  }

  private static getConfigurationData(): ConfigurationData | undefined {
    if (!Configuration.configurationData) {
      try {
        Configuration.configurationData = JSON.parse(
          readFileSync(Configuration.configurationFile, 'utf8'),
        ) as ConfigurationData;
        if (!Configuration.configurationFileWatcher) {
          Configuration.configurationFileWatcher = Configuration.getConfigurationFileWatcher();
        }
      } catch (error) {
        Configuration.handleFileException(
          Configuration.configurationFile,
          FileType.Configuration,
          error as NodeJS.ErrnoException,
          Configuration.logPrefix(),
        );
      }
    }
    return Configuration.configurationData;
  }

  private static getConfigurationFileWatcher(): FSWatcher | undefined {
    try {
      return watch(Configuration.configurationFile, (event, filename): void => {
        if (filename!.trim()!.length > 0 && event === 'change') {
          delete Configuration.configurationData;
          Configuration.configurationSectionCache.clear();
          if (!isUndefined(Configuration.configurationChangeCallback)) {
            Configuration.configurationChangeCallback!().catch((error) => {
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
        Configuration.logPrefix(),
      );
    }
  }

  private static handleFileException(
    file: string,
    fileType: FileType,
    error: NodeJS.ErrnoException,
    logPrefix: string,
  ): void {
    const prefix = isNotEmptyString(logPrefix) ? `${logPrefix} ` : '';
    let logMsg: string;
    switch (error.code) {
      case 'ENOENT':
        logMsg = `${fileType} file ${file} not found:`;
        break;
      case 'EEXIST':
        logMsg = `${fileType} file ${file} already exists:`;
        break;
      case 'EACCES':
        logMsg = `${fileType} file ${file} access denied:`;
        break;
      case 'EPERM':
        logMsg = `${fileType} file ${file} permission denied:`;
        break;
      default:
        logMsg = `${fileType} file ${file} error:`;
    }
    console.error(`${chalk.green(prefix)}${chalk.red(`${logMsg} `)}`, error);
    throw error;
  }

  private static getDefaultPerformanceStorageUri(storageType: StorageType) {
    switch (storageType) {
      case StorageType.JSON_FILE:
        return Configuration.buildPerformanceUriFilePath(
          `${Constants.DEFAULT_PERFORMANCE_DIRECTORY}/${Constants.DEFAULT_PERFORMANCE_RECORDS_FILENAME}`,
        );
      case StorageType.SQLITE:
        return Configuration.buildPerformanceUriFilePath(
          `${Constants.DEFAULT_PERFORMANCE_DIRECTORY}/${Constants.DEFAULT_PERFORMANCE_RECORDS_DB_NAME}.db`,
        );
      default:
        throw new Error(`Unsupported storage type '${storageType}'`);
    }
  }

  private static buildPerformanceUriFilePath(file: string) {
    return `file://${join(resolve(dirname(fileURLToPath(import.meta.url)), '../'), file)}`;
  }
}
