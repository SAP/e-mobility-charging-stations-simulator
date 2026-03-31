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
import { checkDeprecatedConfigurationKeys } from './ConfigurationMigration.js'
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
    const checkDeprecatedConfigurationKeysOnce = once(() => {
      checkDeprecatedConfigurationKeys(Configuration.getConfigurationData())
    })
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
      const configurationData = Configuration.getConfigurationData()
      if (configurationData != null) {
        configurationData.supervisionUrls = configurationData[
          'supervisionURLs' as keyof ConfigurationData
        ] as string | string[]
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
    const configurationData = Configuration.getConfigurationData()
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
      if (has(deprecatedKey, configurationData)) {
        deprecatedLogConfiguration[newKey] = configurationData?.[deprecatedKey]
      }
    }
    const logConfiguration: LogConfiguration = {
      ...defaultLogConfiguration,
      ...(deprecatedLogConfiguration as Partial<LogConfiguration>),
      ...(has(ConfigurationSection.log, configurationData) && configurationData?.log),
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
      uiServerConfiguration = mergeDeepRight(
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
    const configurationData = Configuration.getConfigurationData()
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
      if (has(deprecatedKey, configurationData)) {
        deprecatedWorkerConfiguration[newKey] = configurationData?.[deprecatedKey]
      }
    }
    if (has('elementStartDelay', configurationData?.worker)) {
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- intentional deprecated key migration
      deprecatedWorkerConfiguration.elementAddDelay = configurationData?.worker?.elementStartDelay
    }
    if (configurationData != null) {
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- intentional deprecated key removal
      delete configurationData.workerPoolStrategy
    }
    const workerConfiguration: WorkerConfiguration = {
      ...defaultWorkerConfiguration,
      ...(deprecatedWorkerConfiguration as Partial<WorkerConfiguration>),
      ...(has(ConfigurationSection.worker, configurationData) && configurationData?.worker),
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
}
