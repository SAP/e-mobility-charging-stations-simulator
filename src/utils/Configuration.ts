import chalk from 'chalk'
import { existsSync, type FSWatcher, readFileSync, watch } from 'node:fs'
import { dirname, join } from 'node:path'
import { env } from 'node:process'
import { fileURLToPath } from 'node:url'

import { BaseError } from '../exception/index.js'
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
  DEFAULT_ELEMENT_ADD_DELAY_MS,
  DEFAULT_POOL_MAX_SIZE,
  DEFAULT_POOL_MIN_SIZE,
  DEFAULT_WORKER_START_DELAY_MS,
  WorkerProcessType,
} from '../worker/index.js'
import { CURRENT_CONFIGURATION_SCHEMA_VERSION } from './ConfigurationMigrations.js'
import {
  buildPerformanceUriFilePath,
  configurationLogPrefix,
  getDefaultPerformanceStorageUri,
} from './ConfigurationUtils.js'
import { ConfigurationValidationError, validateConfiguration } from './ConfigurationValidation.js'
import { Constants } from './Constants.js'
import { ensureError, handleFileException } from './ErrorUtils.js'
import { logger } from './Logger.js'
import {
  clone,
  convertToInt,
  has,
  isCFEnvironment,
  isNotEmptyString,
  mergeDeepRight,
  once,
} from './Utils.js'

type ConfigurationSectionType =
  | LogConfiguration
  | StorageConfiguration
  | UIServerConfiguration
  | WorkerConfiguration

const defaultUIServerConfiguration: UIServerConfiguration = {
  accessPolicy: {
    allowedHosts: [],
    allowedOrigins: [],
    allowLoopbackProxy: false,
    requireTlsForNonLoopback: true,
    trustedProxies: [],
  },
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
  statisticsInterval: Constants.DEFAULT_LOG_STATISTICS_INTERVAL_SECONDS,
}

const defaultWorkerConfiguration: WorkerConfiguration = {
  elementAddDelay: DEFAULT_ELEMENT_ADD_DELAY_MS,
  elementsPerWorker: 'auto',
  poolMaxSize: DEFAULT_POOL_MAX_SIZE,
  poolMinSize: DEFAULT_POOL_MIN_SIZE,
  processType: WorkerProcessType.workerSet,
  startDelay: DEFAULT_WORKER_START_DELAY_MS,
}

const defaultPersistState = true

export const DEFAULT_PERSIST_STATE = defaultPersistState

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Configuration {
  public static configurationChangeCallback?: () => Promise<void>

  private static configurationData?: ConfigurationData
  private static configurationFile: string | undefined
  private static configurationFileReloading = false
  private static configurationFileReloadPending = false
  private static configurationFileWatcher?: FSWatcher
  private static configurationSectionCache: Map<ConfigurationSection, ConfigurationSectionType>

  static {
    const configurationFile = join(dirname(fileURLToPath(import.meta.url)), 'assets', 'config.json')
    if (existsSync(configurationFile)) {
      Configuration.configurationFile = configurationFile
    } else {
      console.error(
        `${chalk.green(configurationLogPrefix())} ${chalk.red(
          "Configuration file './src/assets/config.json' not found, using default configuration"
        )}`
      )
      Configuration.configurationData = {
        $schemaVersion: CURRENT_CONFIGURATION_SCHEMA_VERSION,
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
      isNotEmptyString(Configuration.configurationFile)
    ) {
      try {
        const parsed: unknown = JSON.parse(readFileSync(Configuration.configurationFile, 'utf8'))
        try {
          Configuration.configurationData = validateConfiguration(
            parsed,
            Configuration.configurationFile
          )
        } catch (validationError) {
          if (
            validationError instanceof ConfigurationValidationError ||
            validationError instanceof BaseError
          ) {
            console.error(
              `${chalk.green(configurationLogPrefix())} ${chalk.red(validationError.message)}`
            )
            process.exit(1)
          }
          throw validationError
        }
        Configuration.configurationFileWatcher ??= Configuration.getConfigurationFileWatcher()
      } catch (error) {
        handleFileException(
          Configuration.configurationFile,
          FileType.Configuration,
          ensureError(error),
          configurationLogPrefix(),
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

  public static getPersistState (): boolean {
    return Configuration.getConfigurationData()?.persistState ?? defaultPersistState
  }

  public static getStationTemplateUrls (): StationTemplateUrl[] | undefined {
    return Configuration.getConfigurationData()?.stationTemplateUrls
  }

  public static getSupervisionUrlDistribution (): SupervisionUrlDistribution | undefined {
    return has('supervisionUrlDistribution', Configuration.getConfigurationData())
      ? Configuration.getConfigurationData()?.supervisionUrlDistribution
      : SupervisionUrlDistribution.ROUND_ROBIN
  }

  public static getSupervisionUrls (): string | string[] | undefined {
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
    return {
      ...defaultLogConfiguration,
      ...(has(ConfigurationSection.log, configurationData) && configurationData?.log),
    }
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
    let uiServerConfiguration: UIServerConfiguration = clone(defaultUIServerConfiguration)
    if (has(ConfigurationSection.uiServer, Configuration.getConfigurationData())) {
      uiServerConfiguration = mergeDeepRight(
        uiServerConfiguration,
        Configuration.getConfigurationData()?.uiServer ?? defaultUIServerConfiguration
      )
    }
    if (isCFEnvironment()) {
      delete uiServerConfiguration.options?.host
      if (uiServerConfiguration.options != null) {
        uiServerConfiguration.options.port = convertToInt(env.PORT ?? '')
      }
    }
    return uiServerConfiguration
  }

  private static buildWorkerSection (): WorkerConfiguration {
    const configurationData = Configuration.getConfigurationData()
    return {
      ...defaultWorkerConfiguration,
      ...(has(ConfigurationSection.worker, configurationData) && configurationData?.worker),
    }
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
    if (!isNotEmptyString(Configuration.configurationFile)) {
      return
    }
    try {
      return watch(Configuration.configurationFile, (event, filename): void => {
        if ((filename?.trim().length ?? 0) === 0 || event !== 'change') {
          return
        }
        if (Configuration.configurationFileReloading) {
          // Coalesce events arriving during an in-flight reload into a single
          // follow-up reload. N rapid edits collapse into ≤2 reloads
          // (current + one drained), preserving the latest file content.
          Configuration.configurationFileReloadPending = true
          return
        }
        Configuration.configurationFileReloading = true
        const consoleWarnOnce = once(console.warn)
        consoleWarnOnce(
          `${chalk.green(configurationLogPrefix())} ${chalk.yellow(
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            `${FileType.Configuration} ${Configuration.configurationFile} file has changed, reload`
          )}`
        )
        Configuration.runReloadLoop().catch((error: unknown) => {
          logger.error(
            `${configurationLogPrefix()} Configuration reload loop error:`,
            ensureError(error)
          )
        })
      })
    } catch (error) {
      handleFileException(
        Configuration.configurationFile,
        FileType.Configuration,
        ensureError(error),
        configurationLogPrefix(),
        { consoleOut: true }
      )
    }
  }

  private static isConfigurationSectionCached (sectionName: ConfigurationSection): boolean {
    return Configuration.configurationSectionCache.has(sectionName)
  }

  /**
   * Reload the configuration file. On parse or validation failure, restores
   * the pre-reload `configurationData` and section cache snapshot. Callback
   * failures are logged via `logger.error` but do not trigger rollback —
   * the new configuration is already valid; subscriber side-effects are
   * recoverable on the next reload cycle.
   */
  private static async performReload (): Promise<void> {
    const previousData =
      Configuration.configurationData != null
        ? structuredClone(Configuration.configurationData)
        : undefined
    const previousCache = new Map(Configuration.configurationSectionCache)
    let reloadSucceeded = false
    try {
      delete Configuration.configurationData
      Configuration.configurationSectionCache.clear()
      if (isNotEmptyString(Configuration.configurationFile)) {
        const parsed: unknown = JSON.parse(readFileSync(Configuration.configurationFile, 'utf8'))
        Configuration.configurationData = validateConfiguration(
          parsed,
          Configuration.configurationFile
        )
      }
      reloadSucceeded = true
      if (Configuration.configurationChangeCallback != null) {
        try {
          await Configuration.configurationChangeCallback()
        } catch (callbackError) {
          logger.error(
            `${configurationLogPrefix()} Configuration change callback error:`,
            ensureError(callbackError)
          )
        }
      }
    } catch (error) {
      if (error instanceof ConfigurationValidationError || error instanceof BaseError) {
        logger.error(
          `${configurationLogPrefix()} Configuration hot-reload failed; rolling back to previous configuration:`,
          error
        )
      } else {
        logger.error(
          `${configurationLogPrefix()} Configuration hot-reload failed with unexpected error; rolling back:`,
          ensureError(error)
        )
      }
      if (!reloadSucceeded) {
        Configuration.configurationData = previousData
        Configuration.configurationSectionCache = previousCache
      }
    }
  }

  /**
   * Drive `performReload` until no `configurationFileReloadPending` event
   * remains. Releases the reloading lock in `finally`.
   */
  private static async runReloadLoop (): Promise<void> {
    try {
      do {
        Configuration.configurationFileReloadPending = false
        await Configuration.performReload()
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- mutated by fs.watch handler during performReload
      } while (Configuration.configurationFileReloadPending)
    } finally {
      Configuration.configurationFileReloading = false
    }
  }
}
