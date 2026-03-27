import chalk from 'chalk'
import { existsSync, type FSWatcher, readFileSync, watch } from 'node:fs'
import { dirname, join } from 'node:path'
import { env } from 'node:process'
import { fileURLToPath } from 'node:url'

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
  checkWorkerProcessType,
  DEFAULT_ELEMENT_ADD_DELAY,
  DEFAULT_POOL_MAX_SIZE,
  DEFAULT_POOL_MIN_SIZE,
  DEFAULT_WORKER_START_DELAY,
  WorkerProcessType,
} from '../worker/index.js'
import {
  buildPerformanceUriFilePath,
  checkWorkerElementsPerWorker,
  getDefaultPerformanceStorageUri,
  logPrefix,
} from './ConfigurationUtils.js'
import { Constants } from './Constants.js'
import { ensureError, handleFileException } from './ErrorUtils.js'
import { has, isCFEnvironment, mergeDeepRight, once } from './Utils.js'

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

  public static getConfigurationData (): ConfigurationData | undefined {
    if (
      Configuration.configurationData == null &&
      Configuration.configurationFile != null &&
      Configuration.configurationFile.trim().length > 0
    ) {
      try {
        Configuration.configurationData = JSON.parse(
          readFileSync(Configuration.configurationFile, 'utf8')
        ) as ConfigurationData
        Configuration.configurationFileWatcher ??= Configuration.getConfigurationFileWatcher()
      } catch (error) {
        handleFileException(
          Configuration.configurationFile,
          FileType.Configuration,
          ensureError(error),
          logPrefix(),
          { consoleOut: true }
        )
      }
    }
    return Configuration.configurationData
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
    return has('supervisionUrlDistribution', Configuration.getConfigurationData())
      ? Configuration.getConfigurationData()?.supervisionUrlDistribution
      : SupervisionUrlDistribution.ROUND_ROBIN
  }

  public static getSupervisionUrls (): string | string[] | undefined {
    if (
      Configuration.getConfigurationData()?.['supervisionURLs' as keyof ConfigurationData] != null
    ) {
      const configData = Configuration.getConfigurationData()
      if (configData != null) {
        configData.supervisionUrls = configData['supervisionURLs' as keyof ConfigurationData] as
          | string
          | string[]
      }
    }
    return Configuration.getConfigurationData()?.supervisionUrls
  }

  public static workerDynamicPoolInUse (): boolean {
    return (
      Configuration.getConfigurationSection<WorkerConfiguration>(ConfigurationSection.worker)
        .processType === WorkerProcessType.dynamicPool
    )
  }

  public static workerPoolInUse (): boolean {
    const processType = Configuration.getConfigurationSection<WorkerConfiguration>(
      ConfigurationSection.worker
    ).processType
    return (
      processType != null &&
      [WorkerProcessType.dynamicPool, WorkerProcessType.fixedPool].includes(processType)
    )
  }

  private static buildLogSection (): LogConfiguration {
    const configData = Configuration.getConfigurationData()
    const deprecatedLogKeyMap: [keyof ConfigurationData, keyof LogConfiguration][] = [
      ['logEnabled', 'enabled'],
      ['logFile', 'file'],
      ['logErrorFile', 'errorFile'],
      ['logStatisticsInterval', 'statisticsInterval'],
      ['logLevel', 'level'],
      ['logConsole', 'console'],
      ['logFormat', 'format'],
      ['logRotate', 'rotate'],
      ['logMaxFiles', 'maxFiles'],
      ['logMaxSize', 'maxSize'],
    ]
    const deprecatedLogConfiguration: Record<string, unknown> = {}
    for (const [deprecatedKey, newKey] of deprecatedLogKeyMap) {
      if (has(deprecatedKey, configData)) {
        deprecatedLogConfiguration[newKey] = configData?.[deprecatedKey]
      }
    }
    const logConfiguration: LogConfiguration = {
      ...defaultLogConfiguration,
      ...(deprecatedLogConfiguration as Partial<LogConfiguration>),
      ...(has(ConfigurationSection.log, configData) && configData?.log),
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
            new URL(Configuration.getConfigurationData()?.performanceStorage?.uri ?? '').pathname
          ),
        }),
      }
    }
    return storageConfiguration
  }

  private static buildUIServerSection (): UIServerConfiguration {
    let uiServerConfiguration: UIServerConfiguration = defaultUIServerConfiguration
    if (has(ConfigurationSection.uiServer, Configuration.getConfigurationData())) {
      uiServerConfiguration = mergeDeepRight<UIServerConfiguration, Partial<UIServerConfiguration>>(
        uiServerConfiguration,
        Configuration.getConfigurationData()?.uiServer ?? defaultUIServerConfiguration
      )
    }
    if (isCFEnvironment()) {
      delete uiServerConfiguration.options?.host
      if (uiServerConfiguration.options != null) {
        uiServerConfiguration.options.port = Number.parseInt(env.PORT ?? '')
      }
    }
    return uiServerConfiguration
  }

  private static buildWorkerSection (): WorkerConfiguration {
    const configData = Configuration.getConfigurationData()
    const deprecatedWorkerKeyMap: [keyof ConfigurationData, keyof WorkerConfiguration][] = [
      ['workerProcess', 'processType'],
      ['workerStartDelay', 'startDelay'],
      ['chargingStationsPerWorker', 'elementsPerWorker'],
      ['elementAddDelay', 'elementAddDelay'],
      ['workerPoolMinSize', 'poolMinSize'],
      ['workerPoolMaxSize', 'poolMaxSize'],
    ]
    const deprecatedWorkerConfiguration: Record<string, unknown> = {}
    for (const [deprecatedKey, newKey] of deprecatedWorkerKeyMap) {
      if (has(deprecatedKey, configData)) {
        deprecatedWorkerConfiguration[newKey] = configData?.[deprecatedKey]
      }
    }
    if (has('elementStartDelay', configData?.worker)) {
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- intentional deprecated key migration
      deprecatedWorkerConfiguration.elementAddDelay = configData?.worker?.elementStartDelay
    }
    if (configData != null) {
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- intentional deprecated key removal
      delete configData.workerPoolStrategy
    }
    const workerConfiguration: WorkerConfiguration = {
      ...defaultWorkerConfiguration,
      ...(deprecatedWorkerConfiguration as Partial<WorkerConfiguration>),
      ...(has(ConfigurationSection.worker, configData) && configData?.worker),
    }
    if (workerConfiguration.processType != null) {
      checkWorkerProcessType(workerConfiguration.processType)
    }
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
    const deprecatedKeys: [string, ConfigurationSection | undefined, string][] = [
      // connection timeout
      [
        'autoReconnectTimeout',
        undefined,
        "Use 'ConnectionTimeOut' OCPP parameter in charging station template instead",
      ],
      [
        'connectionTimeout',
        undefined,
        "Use 'ConnectionTimeOut' OCPP parameter in charging station template instead",
      ],
      // connection retries
      ['autoReconnectMaxRetries', undefined, 'Use it in charging station template instead'],
      // station template url(s)
      ['stationTemplateURLs', undefined, "Use 'stationTemplateUrls' instead"],
      // supervision url(s)
      ['supervisionURLs', undefined, "Use 'supervisionUrls' instead"],
      // supervision urls distribution
      ['distributeStationToTenantEqually', undefined, "Use 'supervisionUrlDistribution' instead"],
      ['distributeStationsToTenantsEqually', undefined, "Use 'supervisionUrlDistribution' instead"],
      // worker section
      [
        'useWorkerPool',
        undefined,
        `Use '${ConfigurationSection.worker}' section to define the type of worker process model instead`,
      ],
      [
        'workerProcess',
        undefined,
        `Use '${ConfigurationSection.worker}' section to define the type of worker process model instead`,
      ],
      [
        'workerStartDelay',
        undefined,
        `Use '${ConfigurationSection.worker}' section to define the worker start delay instead`,
      ],
      [
        'chargingStationsPerWorker',
        undefined,
        `Use '${ConfigurationSection.worker}' section to define the number of element(s) per worker instead`,
      ],
      [
        'elementAddDelay',
        undefined,
        `Use '${ConfigurationSection.worker}' section to define the worker's element add delay instead`,
      ],
      [
        'workerPoolMinSize',
        undefined,
        `Use '${ConfigurationSection.worker}' section to define the worker pool minimum size instead`,
      ],
      [
        'workerPoolSize',
        undefined,
        `Use '${ConfigurationSection.worker}' section to define the worker pool maximum size instead`,
      ],
      [
        'workerPoolMaxSize',
        undefined,
        `Use '${ConfigurationSection.worker}' section to define the worker pool maximum size instead`,
      ],
      [
        'workerPoolStrategy',
        undefined,
        `Use '${ConfigurationSection.worker}' section to define the worker pool strategy instead`,
      ],
      ['poolStrategy', ConfigurationSection.worker, 'Not publicly exposed to end users'],
      ['elementStartDelay', ConfigurationSection.worker, "Use 'elementAddDelay' instead"],
      // log section
      [
        'logEnabled',
        undefined,
        `Use '${ConfigurationSection.log}' section to define the logging enablement instead`,
      ],
      [
        'logFile',
        undefined,
        `Use '${ConfigurationSection.log}' section to define the log file instead`,
      ],
      [
        'logErrorFile',
        undefined,
        `Use '${ConfigurationSection.log}' section to define the log error file instead`,
      ],
      [
        'logConsole',
        undefined,
        `Use '${ConfigurationSection.log}' section to define the console logging enablement instead`,
      ],
      [
        'logStatisticsInterval',
        undefined,
        `Use '${ConfigurationSection.log}' section to define the log statistics interval instead`,
      ],
      [
        'logLevel',
        undefined,
        `Use '${ConfigurationSection.log}' section to define the log level instead`,
      ],
      [
        'logFormat',
        undefined,
        `Use '${ConfigurationSection.log}' section to define the log format instead`,
      ],
      [
        'logRotate',
        undefined,
        `Use '${ConfigurationSection.log}' section to define the log rotation enablement instead`,
      ],
      [
        'logMaxFiles',
        undefined,
        `Use '${ConfigurationSection.log}' section to define the log maximum files instead`,
      ],
      [
        'logMaxSize',
        undefined,
        `Use '${ConfigurationSection.log}' section to define the log maximum size instead`,
      ],
      // performanceStorage section
      ['URI', ConfigurationSection.performanceStorage, "Use 'uri' instead"],
    ]
    for (const [key, section, msg] of deprecatedKeys) {
      Configuration.warnDeprecatedConfigurationKey(key, section, msg)
    }
    // station template url(s) remapping
    if (
      Configuration.getConfigurationData()?.['stationTemplateURLs' as keyof ConfigurationData] !=
      null
    ) {
      const configData = Configuration.getConfigurationData()
      if (configData != null) {
        configData.stationTemplateUrls = configData[
          'stationTemplateURLs' as keyof ConfigurationData
        ] as StationTemplateUrl[]
      }
    }
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
    // worker section: staticPool check
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
    // uiServer section
    if (has('uiWebSocketServer', Configuration.getConfigurationData())) {
      console.error(
        `${chalk.green(logPrefix())} ${chalk.red(
          `Deprecated configuration section 'uiWebSocketServer' usage. Use '${ConfigurationSection.uiServer}' instead`
        )}`
      )
    }
  }

  private static getConfigurationFileWatcher (): FSWatcher | undefined {
    if (
      Configuration.configurationFile == null ||
      Configuration.configurationFile.trim().length === 0
    ) {
      return
    }
    try {
      return watch(Configuration.configurationFile, (event, filename): void => {
        if (
          !Configuration.configurationFileReloading &&
          (filename?.trim().length ?? 0) > 0 &&
          event === 'change'
        ) {
          Configuration.configurationFileReloading = true
          const consoleWarnOnce = once(console.warn)
          consoleWarnOnce(
            `${chalk.green(logPrefix())} ${chalk.yellow(
              // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
              `${FileType.Configuration} ${Configuration.configurationFile} file has changed, reload`
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
        ensureError(error),
        logPrefix(),
        { consoleOut: true }
      )
    }
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
}
