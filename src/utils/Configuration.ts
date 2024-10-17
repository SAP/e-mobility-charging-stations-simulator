import chalk from 'chalk'
import { existsSync, type FSWatcher, readFileSync, watch } from 'node:fs'
import { dirname, join } from 'node:path'
import { env } from 'node:process'
import { fileURLToPath } from 'node:url'
import { has, mergeDeepRight, once } from 'rambda'

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
import { isCFEnvironment } from './Utils.js'

type ConfigurationSectionType =
  | LogConfiguration
  | StorageConfiguration
  | UIServerConfiguration
  | WorkerConfiguration

const defaultUIServerConfiguration: UIServerConfiguration = {
  enabled: false,
  options: {
    host: Constants.DEFAULT_UI_SERVER_HOST,
    port: Constants.DEFAULT_UI_SERVER_PORT,
  },
  type: ApplicationProtocol.WS,
  version: ApplicationProtocolVersion.VERSION_11,
}

const defaultStorageConfiguration: StorageConfiguration = {
  enabled: true,
  type: StorageType.NONE,
}

const defaultLogConfiguration: LogConfiguration = {
  enabled: true,
  errorFile: 'logs/error.log',
  file: 'logs/combined.log',
  format: 'simple',
  level: 'info',
  rotate: true,
  statisticsInterval: Constants.DEFAULT_LOG_STATISTICS_INTERVAL,
}

const defaultWorkerConfiguration: WorkerConfiguration = {
  elementAddDelay: DEFAULT_ELEMENT_ADD_DELAY,
  elementsPerWorker: 'auto',
  poolMaxSize: DEFAULT_POOL_MAX_SIZE,
  poolMinSize: DEFAULT_POOL_MIN_SIZE,
  processType: WorkerProcessType.workerSet,
  startDelay: DEFAULT_WORKER_START_DELAY,
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Configuration {
  public static configurationChangeCallback?: () => Promise<void>

  private static configurationData?: ConfigurationData
  private static configurationFile: string | undefined
  private static configurationFileReloading = false
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
        log: defaultLogConfiguration,
        performanceStorage: defaultStorageConfiguration,
        stationTemplateUrls: [
          {
            file: 'siemens.station-template.json',
            numberOfStations: 1,
          },
        ],
        supervisionUrlDistribution: SupervisionUrlDistribution.ROUND_ROBIN,
        supervisionUrls: 'ws://localhost:8180/steve/websocket/CentralSystemService',
        uiServer: defaultUIServerConfiguration,
        worker: defaultWorkerConfiguration,
      }
    }
    Configuration.configurationSectionCache = new Map<
      ConfigurationSection,
      ConfigurationSectionType
    >([
      [ConfigurationSection.log, Configuration.buildLogSection()],
      [ConfigurationSection.performanceStorage, Configuration.buildPerformanceStorageSection()],
      [ConfigurationSection.uiServer, Configuration.buildUIServerSection()],
      [ConfigurationSection.worker, Configuration.buildWorkerSection()],
    ])
  }

  private constructor () {
    // This is intentional
  }

  private static buildLogSection (): LogConfiguration {
    const deprecatedLogConfiguration: LogConfiguration = {
      ...(has('logEnabled', Configuration.getConfigurationData()) && {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        enabled: Configuration.getConfigurationData()?.logEnabled,
      }),
      ...(has('logFile', Configuration.getConfigurationData()) && {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        file: Configuration.getConfigurationData()?.logFile,
      }),
      ...(has('logErrorFile', Configuration.getConfigurationData()) && {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        errorFile: Configuration.getConfigurationData()?.logErrorFile,
      }),
      ...(has('logStatisticsInterval', Configuration.getConfigurationData()) && {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        statisticsInterval: Configuration.getConfigurationData()?.logStatisticsInterval,
      }),
      ...(has('logLevel', Configuration.getConfigurationData()) && {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        level: Configuration.getConfigurationData()?.logLevel,
      }),
      ...(has('logConsole', Configuration.getConfigurationData()) && {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        console: Configuration.getConfigurationData()?.logConsole,
      }),
      ...(has('logFormat', Configuration.getConfigurationData()) && {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        format: Configuration.getConfigurationData()?.logFormat,
      }),
      ...(has('logRotate', Configuration.getConfigurationData()) && {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        rotate: Configuration.getConfigurationData()?.logRotate,
      }),
      ...(has('logMaxFiles', Configuration.getConfigurationData()) && {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        maxFiles: Configuration.getConfigurationData()?.logMaxFiles,
      }),
      ...(has('logMaxSize', Configuration.getConfigurationData()) && {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        maxSize: Configuration.getConfigurationData()?.logMaxSize,
      }),
    }
    const logConfiguration: LogConfiguration = {
      ...defaultLogConfiguration,
      ...deprecatedLogConfiguration,
      ...(has(ConfigurationSection.log, Configuration.getConfigurationData()) &&
        Configuration.getConfigurationData()?.log),
    }
    return logConfiguration
  }

  private static buildPerformanceStorageSection (): StorageConfiguration {
    let storageConfiguration: StorageConfiguration
    switch (Configuration.getConfigurationData()?.performanceStorage?.type) {
      case StorageType.JSON_FILE:
        storageConfiguration = {
          enabled: false,
          type: StorageType.JSON_FILE,
          uri: getDefaultPerformanceStorageUri(StorageType.JSON_FILE),
        }
        break
      case StorageType.SQLITE:
        storageConfiguration = {
          enabled: false,
          type: StorageType.SQLITE,
          uri: getDefaultPerformanceStorageUri(StorageType.SQLITE),
        }
        break
      case StorageType.NONE:
      default:
        storageConfiguration = defaultStorageConfiguration
        break
    }
    if (has(ConfigurationSection.performanceStorage, Configuration.getConfigurationData())) {
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

  private static buildUIServerSection (): UIServerConfiguration {
    let uiServerConfiguration: UIServerConfiguration = defaultUIServerConfiguration
    if (has(ConfigurationSection.uiServer, Configuration.getConfigurationData())) {
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

  private static buildWorkerSection (): WorkerConfiguration {
    const deprecatedWorkerConfiguration: WorkerConfiguration = {
      ...(has('workerProcess', Configuration.getConfigurationData()) && {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        processType: Configuration.getConfigurationData()?.workerProcess,
      }),
      ...(has('workerStartDelay', Configuration.getConfigurationData()) && {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        startDelay: Configuration.getConfigurationData()?.workerStartDelay,
      }),
      ...(has('chargingStationsPerWorker', Configuration.getConfigurationData()) && {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        elementsPerWorker: Configuration.getConfigurationData()?.chargingStationsPerWorker,
      }),
      ...(has('elementAddDelay', Configuration.getConfigurationData()) && {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        elementAddDelay: Configuration.getConfigurationData()?.elementAddDelay,
      }),
      ...(has('elementStartDelay', Configuration.getConfigurationData()?.worker) && {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        elementAddDelay: Configuration.getConfigurationData()?.worker?.elementStartDelay,
      }),
      ...(has('workerPoolMinSize', Configuration.getConfigurationData()) && {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        poolMinSize: Configuration.getConfigurationData()?.workerPoolMinSize,
      }),
      ...(has('workerPoolMaxSize', Configuration.getConfigurationData()) && {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        poolMaxSize: Configuration.getConfigurationData()?.workerPoolMaxSize,
      }),
    }
    has('workerPoolStrategy', Configuration.getConfigurationData()) &&
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      delete Configuration.getConfigurationData()?.workerPoolStrategy
    const workerConfiguration: WorkerConfiguration = {
      ...defaultWorkerConfiguration,
      ...deprecatedWorkerConfiguration,
      ...(has(ConfigurationSection.worker, Configuration.getConfigurationData()) &&
        Configuration.getConfigurationData()?.worker),
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    checkWorkerProcessType(workerConfiguration.processType!)
    checkWorkerElementsPerWorker(workerConfiguration.elementsPerWorker)
    return workerConfiguration
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
      case ConfigurationSection.uiServer:
        Configuration.configurationSectionCache.set(
          sectionName,
          Configuration.buildUIServerSection()
        )
        break
      case ConfigurationSection.worker:
        Configuration.configurationSectionCache.set(sectionName, Configuration.buildWorkerSection())
        break
      default:
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        throw new Error(`Unknown configuration section '${sectionName}'`)
    }
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
    if (has(Configuration.getConfigurationData(), 'uiWebSocketServer')) {
      console.error(
        `${chalk.green(logPrefix())} ${chalk.red(
          `Deprecated configuration section 'uiWebSocketServer' usage. Use '${ConfigurationSection.uiServer}' instead`
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

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
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

  public static getSupervisionUrlDistribution (): SupervisionUrlDistribution | undefined {
    return has(Configuration.getConfigurationData(), 'supervisionUrlDistribution')
      ? Configuration.getConfigurationData()?.supervisionUrlDistribution
      : SupervisionUrlDistribution.ROUND_ROBIN
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

  private static isConfigurationSectionCached (sectionName: ConfigurationSection): boolean {
    return Configuration.configurationSectionCache.has(sectionName)
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

  public static workerDynamicPoolInUse (): boolean {
    return (
      Configuration.getConfigurationSection<WorkerConfiguration>(ConfigurationSection.worker)
        .processType === WorkerProcessType.dynamicPool
    )
  }

  public static workerPoolInUse (): boolean {
    return [WorkerProcessType.dynamicPool, WorkerProcessType.fixedPool].includes(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      Configuration.getConfigurationSection<WorkerConfiguration>(ConfigurationSection.worker)
        .processType!
    )
  }
}
