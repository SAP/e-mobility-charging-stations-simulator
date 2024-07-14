import { existsSync, type FSWatcher, readFileSync, watch } from 'node:fs'
import { dirname, join } from 'node:path'
import { env } from 'node:process'
import { fileURLToPath } from 'node:url'

import chalk from 'chalk'
import { mergeDeepRight, once } from 'rambda'

import {
  ApplicationProtocol,
  ApplicationProtocolVersion,
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
} from '../types/index.js'
import {
  DEFAULT_ELEMENT_ADD_DELAY,
  DEFAULT_POOL_MAX_SIZE,
  DEFAULT_POOL_MIN_SIZE,
  DEFAULT_WORKER_START_DELAY,
  WorkerProcessType,
} from '../worker/index.js'
import {
  buildPerformanceUriFilePath,
  checkWorkerElementsPerWorker,
  checkWorkerProcessType,
  getDefaultPerformanceStorageUri,
  handleFileException,
  logPrefix,
} from './ConfigurationUtils.js'
import { Constants } from './Constants.js'
import { hasOwnProp, isCFEnvironment } from './Utils.js'

type ConfigurationSectionType =
  | LogConfiguration
  | StorageConfiguration
  | WorkerConfiguration
  | UIServerConfiguration

const defaultUIServerConfiguration: UIServerConfiguration = {
  enabled: false,
  type: ApplicationProtocol.WS,
  version: ApplicationProtocolVersion.VERSION_11,
  options: {
    host: Constants.DEFAULT_UI_SERVER_HOST,
    port: Constants.DEFAULT_UI_SERVER_PORT,
  },
}

const defaultStorageConfiguration: StorageConfiguration = {
  enabled: true,
  type: StorageType.NONE,
}

const defaultLogConfiguration: LogConfiguration = {
  enabled: true,
  file: 'logs/combined.log',
  errorFile: 'logs/error.log',
  statisticsInterval: Constants.DEFAULT_LOG_STATISTICS_INTERVAL,
  level: 'info',
  format: 'simple',
  rotate: true,
}

const defaultWorkerConfiguration: WorkerConfiguration = {
  processType: WorkerProcessType.workerSet,
  startDelay: DEFAULT_WORKER_START_DELAY,
  elementsPerWorker: 'auto',
  elementAddDelay: DEFAULT_ELEMENT_ADD_DELAY,
  poolMinSize: DEFAULT_POOL_MIN_SIZE,
  poolMaxSize: DEFAULT_POOL_MAX_SIZE,
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Configuration {
  public static configurationChangeCallback?: () => Promise<void>

  private static configurationFile: string | undefined
  private static configurationFileReloading = false
  private static configurationData?: ConfigurationData
  private static configurationFileWatcher?: FSWatcher
  private static configurationSectionCache: Map<ConfigurationSection, ConfigurationSectionType>

  static {
    const configurationFile = join(dirname(fileURLToPath(import.meta.url)), 'assets', 'config.json')
    if (existsSync(configurationFile)) {
      Configuration.configurationFile = configurationFile
    } else {
      console.error(
        `${chalk.green(logPrefix())} ${chalk.red(
          "Configuration file './src/assets/config.json' not found, using default configuration"
        )}`
      )
      Configuration.configurationData = {
        stationTemplateUrls: [
          {
            file: 'siemens.station-template.json',
            numberOfStations: 1,
          },
        ],
        supervisionUrls: 'ws://localhost:8180/steve/websocket/CentralSystemService',
        supervisionUrlDistribution: SupervisionUrlDistribution.ROUND_ROBIN,
        uiServer: defaultUIServerConfiguration,
        performanceStorage: defaultStorageConfiguration,
        log: defaultLogConfiguration,
        worker: defaultWorkerConfiguration,
      }
    }
    Configuration.configurationSectionCache = new Map<
      ConfigurationSection,
      ConfigurationSectionType
    >([
      [ConfigurationSection.log, Configuration.buildLogSection()],
      [ConfigurationSection.performanceStorage, Configuration.buildPerformanceStorageSection()],
      [ConfigurationSection.worker, Configuration.buildWorkerSection()],
      [ConfigurationSection.uiServer, Configuration.buildUIServerSection()],
    ])
  }

  private constructor () {
    // This is intentional
  }

  public static getConfigurationSection<T extends ConfigurationSectionType>(
    sectionName: ConfigurationSection
  ): T {
    if (!Configuration.isConfigurationSectionCached(sectionName)) {
      Configuration.cacheConfigurationSection(sectionName)
    }
    return Configuration.configurationSectionCache.get(sectionName) as T
  }

  public static getStationTemplateUrls (): StationTemplateUrl[] | undefined {
    const checkDeprecatedConfigurationKeysOnce = once(
      Configuration.checkDeprecatedConfigurationKeys.bind(Configuration)
    )
    checkDeprecatedConfigurationKeysOnce()
    return Configuration.getConfigurationData()?.stationTemplateUrls
  }

  public static getSupervisionUrls (): string | string[] | undefined {
    if (
      Configuration.getConfigurationData()?.['supervisionURLs' as keyof ConfigurationData] != null
    ) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      Configuration.getConfigurationData()!.supervisionUrls = Configuration.getConfigurationData()![
        'supervisionURLs' as keyof ConfigurationData
      ] as string | string[]
    }
    return Configuration.getConfigurationData()?.supervisionUrls
  }

  public static getSupervisionUrlDistribution (): SupervisionUrlDistribution | undefined {
    return hasOwnProp(Configuration.getConfigurationData(), 'supervisionUrlDistribution')
      ? Configuration.getConfigurationData()?.supervisionUrlDistribution
      : SupervisionUrlDistribution.ROUND_ROBIN
  }

  public static workerPoolInUse (): boolean {
    return [WorkerProcessType.dynamicPool, WorkerProcessType.fixedPool].includes(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      Configuration.getConfigurationSection<WorkerConfiguration>(ConfigurationSection.worker)
        .processType!
    )
  }

  public static workerDynamicPoolInUse (): boolean {
    return (
      Configuration.getConfigurationSection<WorkerConfiguration>(ConfigurationSection.worker)
        .processType === WorkerProcessType.dynamicPool
    )
  }

  private static isConfigurationSectionCached (sectionName: ConfigurationSection): boolean {
    return Configuration.configurationSectionCache.has(sectionName)
  }

  private static cacheConfigurationSection (sectionName: ConfigurationSection): void {
    switch (sectionName) {
      case ConfigurationSection.log:
        Configuration.configurationSectionCache.set(sectionName, Configuration.buildLogSection())
        break
      case ConfigurationSection.performanceStorage:
        Configuration.configurationSectionCache.set(
          sectionName,
          Configuration.buildPerformanceStorageSection()
        )
        break
      case ConfigurationSection.worker:
        Configuration.configurationSectionCache.set(sectionName, Configuration.buildWorkerSection())
        break
      case ConfigurationSection.uiServer:
        Configuration.configurationSectionCache.set(
          sectionName,
          Configuration.buildUIServerSection()
        )
        break
      default:
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        throw new Error(`Unknown configuration section '${sectionName}'`)
    }
  }

  private static buildUIServerSection (): UIServerConfiguration {
    let uiServerConfiguration: UIServerConfiguration = defaultUIServerConfiguration
    if (hasOwnProp(Configuration.getConfigurationData(), ConfigurationSection.uiServer)) {
      uiServerConfiguration = mergeDeepRight(
        uiServerConfiguration,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        Configuration.getConfigurationData()!.uiServer!
      )
    }
    if (isCFEnvironment()) {
      delete uiServerConfiguration.options?.host
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      uiServerConfiguration.options!.port = Number.parseInt(env.PORT!)
    }
    return uiServerConfiguration
  }

  private static buildPerformanceStorageSection (): StorageConfiguration {
    let storageConfiguration: StorageConfiguration
    switch (Configuration.getConfigurationData()?.performanceStorage?.type) {
      case StorageType.SQLITE:
        storageConfiguration = {
          enabled: false,
          type: StorageType.SQLITE,
          uri: getDefaultPerformanceStorageUri(StorageType.SQLITE),
        }
        break
      case StorageType.JSON_FILE:
        storageConfiguration = {
          enabled: false,
          type: StorageType.JSON_FILE,
          uri: getDefaultPerformanceStorageUri(StorageType.JSON_FILE),
        }
        break
      case StorageType.NONE:
      default:
        storageConfiguration = defaultStorageConfiguration
        break
    }
    if (hasOwnProp(Configuration.getConfigurationData(), ConfigurationSection.performanceStorage)) {
      storageConfiguration = {
        ...storageConfiguration,
        ...Configuration.getConfigurationData()?.performanceStorage,
        ...((Configuration.getConfigurationData()?.performanceStorage?.type ===
          StorageType.JSON_FILE ||
          Configuration.getConfigurationData()?.performanceStorage?.type === StorageType.SQLITE) &&
          Configuration.getConfigurationData()?.performanceStorage?.uri != null && {
          uri: buildPerformanceUriFilePath(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            new URL(Configuration.getConfigurationData()!.performanceStorage!.uri!).pathname
          ),
        }),
      }
    }
    return storageConfiguration
  }

  private static buildLogSection (): LogConfiguration {
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
    }
    const logConfiguration: LogConfiguration = {
      ...defaultLogConfiguration,
      ...deprecatedLogConfiguration,
      ...(hasOwnProp(Configuration.getConfigurationData(), ConfigurationSection.log) &&
        Configuration.getConfigurationData()?.log),
    }
    return logConfiguration
  }

  private static buildWorkerSection (): WorkerConfiguration {
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
      ...(hasOwnProp(Configuration.getConfigurationData(), 'elementAddDelay') && {
        elementAddDelay: Configuration.getConfigurationData()?.elementAddDelay,
      }),
      ...(hasOwnProp(Configuration.getConfigurationData()?.worker, 'elementStartDelay') && {
        elementAddDelay: Configuration.getConfigurationData()?.worker?.elementStartDelay,
      }),
      ...(hasOwnProp(Configuration.getConfigurationData(), 'workerPoolMinSize') && {
        poolMinSize: Configuration.getConfigurationData()?.workerPoolMinSize,
      }),
      ...(hasOwnProp(Configuration.getConfigurationData(), 'workerPoolMaxSize') && {
        poolMaxSize: Configuration.getConfigurationData()?.workerPoolMaxSize,
      }),
    }
    hasOwnProp(Configuration.getConfigurationData(), 'workerPoolStrategy') &&
      delete Configuration.getConfigurationData()?.workerPoolStrategy
    const workerConfiguration: WorkerConfiguration = {
      ...defaultWorkerConfiguration,
      ...deprecatedWorkerConfiguration,
      ...(hasOwnProp(Configuration.getConfigurationData(), ConfigurationSection.worker) &&
        Configuration.getConfigurationData()?.worker),
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    checkWorkerProcessType(workerConfiguration.processType!)
    checkWorkerElementsPerWorker(workerConfiguration.elementsPerWorker)
    return workerConfiguration
  }

  private static checkDeprecatedConfigurationKeys (): void {
    // connection timeout
    Configuration.warnDeprecatedConfigurationKey(
      'autoReconnectTimeout',
      undefined,
      "Use 'ConnectionTimeOut' OCPP parameter in charging station template instead"
    )
    Configuration.warnDeprecatedConfigurationKey(
      'connectionTimeout',
      undefined,
      "Use 'ConnectionTimeOut' OCPP parameter in charging station template instead"
    )
    // connection retries
    Configuration.warnDeprecatedConfigurationKey(
      'autoReconnectMaxRetries',
      undefined,
      'Use it in charging station template instead'
    )
    // station template url(s)
    Configuration.warnDeprecatedConfigurationKey(
      'stationTemplateURLs',
      undefined,
      "Use 'stationTemplateUrls' instead"
    )
    Configuration.getConfigurationData()?.['stationTemplateURLs' as keyof ConfigurationData] !=
      null &&
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      (Configuration.getConfigurationData()!.stationTemplateUrls =
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        Configuration.getConfigurationData()![
          'stationTemplateURLs' as keyof ConfigurationData
        ] as StationTemplateUrl[])
    Configuration.getConfigurationData()?.stationTemplateUrls.forEach(
      (stationTemplateUrl: StationTemplateUrl) => {
        if (stationTemplateUrl['numberOfStation' as keyof StationTemplateUrl] != null) {
          console.error(
            `${chalk.green(logPrefix())} ${chalk.red(
              `Deprecated configuration key 'numberOfStation' usage for template file '${stationTemplateUrl.file}' in 'stationTemplateUrls'. Use 'numberOfStations' instead`
            )}`
          )
        }
      }
    )
    // supervision url(s)
    Configuration.warnDeprecatedConfigurationKey(
      'supervisionURLs',
      undefined,
      "Use 'supervisionUrls' instead"
    )
    // supervision urls distribution
    Configuration.warnDeprecatedConfigurationKey(
      'distributeStationToTenantEqually',
      undefined,
      "Use 'supervisionUrlDistribution' instead"
    )
    Configuration.warnDeprecatedConfigurationKey(
      'distributeStationsToTenantsEqually',
      undefined,
      "Use 'supervisionUrlDistribution' instead"
    )
    // worker section
    Configuration.warnDeprecatedConfigurationKey(
      'useWorkerPool',
      undefined,
      `Use '${ConfigurationSection.worker}' section to define the type of worker process model instead`
    )
    Configuration.warnDeprecatedConfigurationKey(
      'workerProcess',
      undefined,
      `Use '${ConfigurationSection.worker}' section to define the type of worker process model instead`
    )
    Configuration.warnDeprecatedConfigurationKey(
      'workerStartDelay',
      undefined,
      `Use '${ConfigurationSection.worker}' section to define the worker start delay instead`
    )
    Configuration.warnDeprecatedConfigurationKey(
      'chargingStationsPerWorker',
      undefined,
      `Use '${ConfigurationSection.worker}' section to define the number of element(s) per worker instead`
    )
    Configuration.warnDeprecatedConfigurationKey(
      'elementAddDelay',
      undefined,
      `Use '${ConfigurationSection.worker}' section to define the worker's element add delay instead`
    )
    Configuration.warnDeprecatedConfigurationKey(
      'workerPoolMinSize',
      undefined,
      `Use '${ConfigurationSection.worker}' section to define the worker pool minimum size instead`
    )
    Configuration.warnDeprecatedConfigurationKey(
      'workerPoolSize',
      undefined,
      `Use '${ConfigurationSection.worker}' section to define the worker pool maximum size instead`
    )
    Configuration.warnDeprecatedConfigurationKey(
      'workerPoolMaxSize',
      undefined,
      `Use '${ConfigurationSection.worker}' section to define the worker pool maximum size instead`
    )
    Configuration.warnDeprecatedConfigurationKey(
      'workerPoolStrategy',
      undefined,
      `Use '${ConfigurationSection.worker}' section to define the worker pool strategy instead`
    )
    Configuration.warnDeprecatedConfigurationKey(
      'poolStrategy',
      ConfigurationSection.worker,
      'Not publicly exposed to end users'
    )
    Configuration.warnDeprecatedConfigurationKey(
      'elementStartDelay',
      ConfigurationSection.worker,
      "Use 'elementAddDelay' instead"
    )
    if (
      Configuration.getConfigurationData()?.worker?.processType ===
      ('staticPool' as WorkerProcessType)
    ) {
      console.error(
        `${chalk.green(logPrefix())} ${chalk.red(
          `Deprecated configuration 'staticPool' value usage in worker section 'processType' field. Use '${WorkerProcessType.fixedPool}' value instead`
        )}`
      )
    }
    // log section
    Configuration.warnDeprecatedConfigurationKey(
      'logEnabled',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the logging enablement instead`
    )
    Configuration.warnDeprecatedConfigurationKey(
      'logFile',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the log file instead`
    )
    Configuration.warnDeprecatedConfigurationKey(
      'logErrorFile',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the log error file instead`
    )
    Configuration.warnDeprecatedConfigurationKey(
      'logConsole',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the console logging enablement instead`
    )
    Configuration.warnDeprecatedConfigurationKey(
      'logStatisticsInterval',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the log statistics interval instead`
    )
    Configuration.warnDeprecatedConfigurationKey(
      'logLevel',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the log level instead`
    )
    Configuration.warnDeprecatedConfigurationKey(
      'logFormat',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the log format instead`
    )
    Configuration.warnDeprecatedConfigurationKey(
      'logRotate',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the log rotation enablement instead`
    )
    Configuration.warnDeprecatedConfigurationKey(
      'logMaxFiles',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the log maximum files instead`
    )
    Configuration.warnDeprecatedConfigurationKey(
      'logMaxSize',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the log maximum size instead`
    )
    // performanceStorage section
    Configuration.warnDeprecatedConfigurationKey(
      'URI',
      ConfigurationSection.performanceStorage,
      "Use 'uri' instead"
    )
    // uiServer section
    if (hasOwnProp(Configuration.getConfigurationData(), 'uiWebSocketServer')) {
      console.error(
        `${chalk.green(logPrefix())} ${chalk.red(
          `Deprecated configuration section 'uiWebSocketServer' usage. Use '${ConfigurationSection.uiServer}' instead`
        )}`
      )
    }
  }

  private static warnDeprecatedConfigurationKey (
    key: string,
    configurationSection?: ConfigurationSection,
    logMsgToAppend = ''
  ): void {
    if (
      configurationSection != null &&
      Configuration.getConfigurationData()?.[configurationSection as keyof ConfigurationData] !=
        null &&
      (
        Configuration.getConfigurationData()?.[
          configurationSection as keyof ConfigurationData
        ] as Record<string, unknown>
      )[key] != null
    ) {
      console.error(
        `${chalk.green(logPrefix())} ${chalk.red(
          `Deprecated configuration key '${key}' usage in section '${configurationSection}'${
            logMsgToAppend.trim().length > 0 ? `. ${logMsgToAppend}` : ''
          }`
        )}`
      )
    } else if (Configuration.getConfigurationData()?.[key as keyof ConfigurationData] != null) {
      console.error(
        `${chalk.green(logPrefix())} ${chalk.red(
          `Deprecated configuration key '${key}' usage${
            logMsgToAppend.trim().length > 0 ? `. ${logMsgToAppend}` : ''
          }`
        )}`
      )
    }
  }

  public static getConfigurationData (): ConfigurationData | undefined {
    if (
      Configuration.configurationData == null &&
      Configuration.configurationFile != null &&
      Configuration.configurationFile.length > 0
    ) {
      try {
        Configuration.configurationData = JSON.parse(
          readFileSync(Configuration.configurationFile, 'utf8')
        ) as ConfigurationData
        if (Configuration.configurationFileWatcher == null) {
          Configuration.configurationFileWatcher = Configuration.getConfigurationFileWatcher()
        }
      } catch (error) {
        handleFileException(
          Configuration.configurationFile,
          FileType.Configuration,
          error as NodeJS.ErrnoException,
          logPrefix()
        )
      }
    }
    return Configuration.configurationData
  }

  private static getConfigurationFileWatcher (): FSWatcher | undefined {
    if (Configuration.configurationFile == null || Configuration.configurationFile.length === 0) {
      return
    }
    try {
      return watch(Configuration.configurationFile, (event, filename): void => {
        if (
          !Configuration.configurationFileReloading &&
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          filename!.trim().length > 0 &&
          event === 'change'
        ) {
          Configuration.configurationFileReloading = true
          const consoleWarnOnce = once(console.warn)
          consoleWarnOnce(
            `${chalk.green(logPrefix())} ${chalk.yellow(
              // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
              `${FileType.Configuration} ${this.configurationFile} file have changed, reload`
            )}`
          )
          delete Configuration.configurationData
          Configuration.configurationSectionCache.clear()
          if (Configuration.configurationChangeCallback != null) {
            Configuration.configurationChangeCallback()
              .finally(() => {
                Configuration.configurationFileReloading = false
              })
              .catch((error: unknown) => {
                throw typeof error === 'string' ? new Error(error) : error
              })
          } else {
            Configuration.configurationFileReloading = false
          }
        }
      })
    } catch (error) {
      handleFileException(
        Configuration.configurationFile,
        FileType.Configuration,
        error as NodeJS.ErrnoException,
        logPrefix()
      )
    }
  }
}
