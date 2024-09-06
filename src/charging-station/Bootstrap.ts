// Partial Copyright Jerome Benoit. 2021-2024. All Rights Reserved.

import type { Worker } from 'worker_threads'

import chalk from 'chalk'
import { EventEmitter } from 'node:events'
import { dirname, extname, join } from 'node:path'
import process, { exit } from 'node:process'
import { fileURLToPath } from 'node:url'
import { isMainThread } from 'node:worker_threads'
import { availableParallelism, type MessageHandler } from 'poolifier'

import type { AbstractUIServer } from './ui-server/AbstractUIServer.js'

import { version } from '../../package.json'
import { BaseError } from '../exception/index.js'
import { type Storage, StorageFactory } from '../performance/index.js'
import {
  type ChargingStationData,
  type ChargingStationInfo,
  type ChargingStationOptions,
  type ChargingStationWorkerData,
  type ChargingStationWorkerMessage,
  type ChargingStationWorkerMessageData,
  ChargingStationWorkerMessageEvents,
  ConfigurationSection,
  ProcedureName,
  type SimulatorState,
  type Statistics,
  type StorageConfiguration,
  type TemplateStatistics,
  type UIServerConfiguration,
  type WorkerConfiguration,
} from '../types/index.js'
import {
  Configuration,
  Constants,
  formatDurationMilliSeconds,
  generateUUID,
  handleUncaughtException,
  handleUnhandledRejection,
  isAsyncFunction,
  isNotEmptyArray,
  logger,
  logPrefix,
} from '../utils/index.js'
import { DEFAULT_ELEMENTS_PER_WORKER, type WorkerAbstract, WorkerFactory } from '../worker/index.js'
import { buildTemplateName, waitChargingStationEvents } from './Helpers.js'
import { UIServerFactory } from './ui-server/UIServerFactory.js'

const moduleName = 'Bootstrap'

enum exitCodes {
  succeeded = 0,
  // eslint-disable-next-line perfectionist/sort-enums
  missingChargingStationsConfiguration = 1,
  // eslint-disable-next-line perfectionist/sort-enums
  duplicateChargingStationTemplateUrls = 2,
  noChargingStationTemplates = 3,
  // eslint-disable-next-line perfectionist/sort-enums
  gracefulShutdownError = 4,
}

export class Bootstrap extends EventEmitter {
  private static instance: Bootstrap | null = null
  private readonly logPrefix = (): string => {
    return logPrefix(' Bootstrap |')
  }

  private started: boolean
  private starting: boolean
  private stopping: boolean
  private storage?: Storage
  private readonly templateStatistics: Map<string, TemplateStatistics>
  private readonly uiServer: AbstractUIServer
  private uiServerStarted: boolean
  private readonly version: string = version

  private readonly workerEventAdded = (data: ChargingStationData): void => {
    this.uiServer.chargingStations.set(data.stationInfo.hashId, data)
    logger.info(
      `${this.logPrefix()} ${moduleName}.workerEventAdded: Charging station ${
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        data.stationInfo.chargingStationId
      } (hashId: ${data.stationInfo.hashId}) added (${this.numberOfAddedChargingStations.toString()} added from ${this.numberOfConfiguredChargingStations.toString()} configured and ${this.numberOfProvisionedChargingStations.toString()} provisioned charging station(s))`
    )
  }

  private readonly workerEventDeleted = (data: ChargingStationData): void => {
    this.uiServer.chargingStations.delete(data.stationInfo.hashId)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const templateStatistics = this.templateStatistics.get(data.stationInfo.templateName)!
    --templateStatistics.added
    templateStatistics.indexes.delete(data.stationInfo.templateIndex)
    logger.info(
      `${this.logPrefix()} ${moduleName}.workerEventDeleted: Charging station ${
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        data.stationInfo.chargingStationId
      } (hashId: ${data.stationInfo.hashId}) deleted (${this.numberOfAddedChargingStations.toString()} added from ${this.numberOfConfiguredChargingStations.toString()} configured and ${this.numberOfProvisionedChargingStations.toString()} provisioned charging station(s))`
    )
  }

  private readonly workerEventPerformanceStatistics = (data: Statistics): void => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    if (isAsyncFunction(this.storage?.storePerformanceStatistics)) {
      ;(
        this.storage.storePerformanceStatistics as (
          performanceStatistics: Statistics
        ) => Promise<void>
      )(data).catch(Constants.EMPTY_FUNCTION)
    } else {
      ;(this.storage?.storePerformanceStatistics as (performanceStatistics: Statistics) => void)(
        data
      )
    }
  }

  private readonly workerEventStarted = (data: ChargingStationData): void => {
    this.uiServer.chargingStations.set(data.stationInfo.hashId, data)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    ++this.templateStatistics.get(data.stationInfo.templateName)!.started
    logger.info(
      `${this.logPrefix()} ${moduleName}.workerEventStarted: Charging station ${
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        data.stationInfo.chargingStationId
      } (hashId: ${data.stationInfo.hashId}) started (${this.numberOfStartedChargingStations.toString()} started from ${this.numberOfAddedChargingStations.toString()} added charging station(s))`
    )
  }

  private readonly workerEventStopped = (data: ChargingStationData): void => {
    this.uiServer.chargingStations.set(data.stationInfo.hashId, data)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    --this.templateStatistics.get(data.stationInfo.templateName)!.started
    logger.info(
      `${this.logPrefix()} ${moduleName}.workerEventStopped: Charging station ${
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        data.stationInfo.chargingStationId
      } (hashId: ${data.stationInfo.hashId}) stopped (${this.numberOfStartedChargingStations.toString()} started from ${this.numberOfAddedChargingStations.toString()} added charging station(s))`
    )
  }

  private readonly workerEventUpdated = (data: ChargingStationData): void => {
    this.uiServer.chargingStations.set(data.stationInfo.hashId, data)
  }

  private workerImplementation?: WorkerAbstract<ChargingStationWorkerData, ChargingStationInfo>

  private constructor () {
    super()
    for (const signal of ['SIGINT', 'SIGQUIT', 'SIGTERM']) {
      process.on(signal, this.gracefulShutdown.bind(this))
    }
    // Enable unconditionally for now
    handleUnhandledRejection()
    handleUncaughtException()
    this.started = false
    this.starting = false
    this.stopping = false
    this.uiServerStarted = false
    this.templateStatistics = new Map<string, TemplateStatistics>()
    this.uiServer = UIServerFactory.getUIServerImplementation(
      Configuration.getConfigurationSection<UIServerConfiguration>(ConfigurationSection.uiServer)
    )
    this.initializeCounters()
    this.initializeWorkerImplementation(
      Configuration.getConfigurationSection<WorkerConfiguration>(ConfigurationSection.worker)
    )
    Configuration.configurationChangeCallback = async () => {
      if (isMainThread) {
        await Bootstrap.getInstance().restart()
      }
    }
  }

  public static getInstance (): Bootstrap {
    if (Bootstrap.instance === null) {
      Bootstrap.instance = new Bootstrap()
    }
    return Bootstrap.instance
  }

  private gracefulShutdown (): void {
    this.stop()
      .then(() => {
        console.info(chalk.green('Graceful shutdown'))
        this.uiServer.stop()
        this.uiServerStarted = false
        this.waitChargingStationsStopped()
          // eslint-disable-next-line promise/no-nesting
          .then(() => {
            return exit(exitCodes.succeeded)
          })
          // eslint-disable-next-line promise/no-nesting
          .catch(() => {
            exit(exitCodes.gracefulShutdownError)
          })
        return undefined
      })
      .catch((error: unknown) => {
        console.error(chalk.red('Error while shutdowning charging stations simulator: '), error)
        exit(exitCodes.gracefulShutdownError)
      })
  }

  private initializeCounters (): void {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const stationTemplateUrls = Configuration.getStationTemplateUrls()!
    if (isNotEmptyArray(stationTemplateUrls)) {
      for (const stationTemplateUrl of stationTemplateUrls) {
        const templateName = buildTemplateName(stationTemplateUrl.file)
        this.templateStatistics.set(templateName, {
          added: 0,
          configured: stationTemplateUrl.numberOfStations,
          indexes: new Set<number>(),
          provisioned: stationTemplateUrl.provisionedNumberOfStations ?? 0,
          started: 0,
        })
        this.uiServer.chargingStationTemplates.add(templateName)
      }
      if (this.templateStatistics.size !== stationTemplateUrls.length) {
        console.error(
          chalk.red(
            "'stationTemplateUrls' contains duplicate entries, please check your configuration"
          )
        )
        exit(exitCodes.duplicateChargingStationTemplateUrls)
      }
    } else {
      console.error(
        chalk.red("'stationTemplateUrls' not defined or empty, please check your configuration")
      )
      exit(exitCodes.missingChargingStationsConfiguration)
    }
    if (
      this.numberOfConfiguredChargingStations === 0 &&
      Configuration.getConfigurationSection<UIServerConfiguration>(ConfigurationSection.uiServer)
        .enabled !== true
    ) {
      console.error(
        chalk.red(
          "'stationTemplateUrls' has no charging station enabled and UI server is disabled, please check your configuration"
        )
      )
      exit(exitCodes.noChargingStationTemplates)
    }
  }

  private initializeWorkerImplementation (workerConfiguration: WorkerConfiguration): void {
    if (!isMainThread) {
      return
    }
    let elementsPerWorker: number
    switch (workerConfiguration.elementsPerWorker) {
      case 'all':
        elementsPerWorker =
          this.numberOfConfiguredChargingStations + this.numberOfProvisionedChargingStations
        break
      case 'auto':
        elementsPerWorker =
          this.numberOfConfiguredChargingStations + this.numberOfProvisionedChargingStations >
          availableParallelism()
            ? Math.round(
              (this.numberOfConfiguredChargingStations +
                  this.numberOfProvisionedChargingStations) /
                  (availableParallelism() * 1.5)
            )
            : 1
        break
      default:
        elementsPerWorker = workerConfiguration.elementsPerWorker ?? DEFAULT_ELEMENTS_PER_WORKER
    }
    this.workerImplementation = WorkerFactory.getWorkerImplementation<
      ChargingStationWorkerData,
      ChargingStationInfo
    >(
      join(
        dirname(fileURLToPath(import.meta.url)),
        `ChargingStationWorker${extname(fileURLToPath(import.meta.url))}`
      ),
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      workerConfiguration.processType!,
      {
        elementAddDelay: workerConfiguration.elementAddDelay,
        elementsPerWorker,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        poolMaxSize: workerConfiguration.poolMaxSize!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        poolMinSize: workerConfiguration.poolMinSize!,
        poolOptions: {
          messageHandler: this.messageHandler.bind(this) as MessageHandler<Worker>,
          ...(workerConfiguration.resourceLimits != null && {
            workerOptions: {
              resourceLimits: workerConfiguration.resourceLimits,
            },
          }),
        },
        workerStartDelay: workerConfiguration.startDelay,
      }
    )
  }

  private messageHandler (
    msg: ChargingStationWorkerMessage<ChargingStationWorkerMessageData>
  ): void {
    // logger.debug(
    //   `${this.logPrefix()} ${moduleName}.messageHandler: Charging station worker message received: ${JSON.stringify(
    //     msg,
    //     undefined,
    //     2
    //   )}`
    // )
    // Skip worker message events processing
    // eslint-disable-next-line @typescript-eslint/dot-notation
    if (msg['uuid'] != null) {
      return
    }
    const { data, event } = msg
    try {
      switch (event) {
        case ChargingStationWorkerMessageEvents.added:
          this.emit(ChargingStationWorkerMessageEvents.added, data)
          break
        case ChargingStationWorkerMessageEvents.deleted:
          this.emit(ChargingStationWorkerMessageEvents.deleted, data)
          break
        case ChargingStationWorkerMessageEvents.performanceStatistics:
          this.emit(ChargingStationWorkerMessageEvents.performanceStatistics, data)
          break
        case ChargingStationWorkerMessageEvents.started:
          this.emit(ChargingStationWorkerMessageEvents.started, data)
          break
        case ChargingStationWorkerMessageEvents.stopped:
          this.emit(ChargingStationWorkerMessageEvents.stopped, data)
          break
        case ChargingStationWorkerMessageEvents.updated:
          this.emit(ChargingStationWorkerMessageEvents.updated, data)
          break
        default:
          throw new BaseError(
            `Unknown charging station worker message event: '${event}' received with data: ${JSON.stringify(
              data,
              undefined,
              2
            )}`
          )
      }
    } catch (error) {
      logger.error(
        `${this.logPrefix()} ${moduleName}.messageHandler: Error occurred while handling charging station worker message event '${event}':`,
        error
      )
    }
  }

  private async restart (): Promise<void> {
    await this.stop()
    if (
      this.uiServerStarted &&
      Configuration.getConfigurationSection<UIServerConfiguration>(ConfigurationSection.uiServer)
        .enabled !== true
    ) {
      this.uiServer.stop()
      this.uiServerStarted = false
    }
    this.initializeCounters()
    // FIXME: initialize worker implementation only if the worker section has changed
    this.initializeWorkerImplementation(
      Configuration.getConfigurationSection<WorkerConfiguration>(ConfigurationSection.worker)
    )
    await this.start()
  }

  private async waitChargingStationsStopped (): Promise<string> {
    return await new Promise<string>((resolve, reject: (reason?: unknown) => void) => {
      const waitTimeout = setTimeout(() => {
        const timeoutMessage = `Timeout ${formatDurationMilliSeconds(
          Constants.STOP_CHARGING_STATIONS_TIMEOUT
        )} reached at stopping charging stations`
        console.warn(chalk.yellow(timeoutMessage))
        reject(new Error(timeoutMessage))
      }, Constants.STOP_CHARGING_STATIONS_TIMEOUT)
      waitChargingStationEvents(
        this,
        ChargingStationWorkerMessageEvents.stopped,
        this.numberOfStartedChargingStations
      )
        .then(events => {
          resolve('Charging stations stopped')
          return events
        })
        .finally(() => {
          clearTimeout(waitTimeout)
        })
        .catch(reject)
    })
  }

  public async addChargingStation (
    index: number,
    templateFile: string,
    options?: ChargingStationOptions
  ): Promise<ChargingStationInfo | undefined> {
    if (!this.started && !this.starting) {
      throw new BaseError(
        'Cannot add charging station while the charging stations simulator is not started'
      )
    }
    const stationInfo = await this.workerImplementation?.addElement({
      index,
      options,
      templateFile: join(
        dirname(fileURLToPath(import.meta.url)),
        'assets',
        'station-templates',
        templateFile
      ),
    })
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const templateStatistics = this.templateStatistics.get(buildTemplateName(templateFile))!
    ++templateStatistics.added
    templateStatistics.indexes.add(index)
    return stationInfo
  }

  public getLastIndex (templateName: string): number {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const indexes = [...this.templateStatistics.get(templateName)!.indexes]
      .concat(0)
      .sort((a, b) => a - b)
    for (let i = 0; i < indexes.length - 1; i++) {
      if (indexes[i + 1] - indexes[i] !== 1) {
        return indexes[i]
      }
    }
    return indexes[indexes.length - 1]
  }

  public getPerformanceStatistics (): IterableIterator<Statistics> | undefined {
    return this.storage?.getPerformanceStatistics()
  }

  public getState (): SimulatorState {
    return {
      configuration: Configuration.getConfigurationData(),
      started: this.started,
      templateStatistics: this.templateStatistics,
      version: this.version,
    }
  }

  public async start (): Promise<void> {
    if (!this.started) {
      if (!this.starting) {
        this.starting = true
        this.on(ChargingStationWorkerMessageEvents.added, this.workerEventAdded)
        this.on(ChargingStationWorkerMessageEvents.deleted, this.workerEventDeleted)
        this.on(ChargingStationWorkerMessageEvents.started, this.workerEventStarted)
        this.on(ChargingStationWorkerMessageEvents.stopped, this.workerEventStopped)
        this.on(ChargingStationWorkerMessageEvents.updated, this.workerEventUpdated)
        this.on(
          ChargingStationWorkerMessageEvents.performanceStatistics,
          this.workerEventPerformanceStatistics
        )
        // eslint-disable-next-line @typescript-eslint/unbound-method
        if (isAsyncFunction(this.workerImplementation?.start)) {
          await this.workerImplementation.start()
        } else {
          ;(this.workerImplementation?.start as () => void)()
        }
        const performanceStorageConfiguration =
          Configuration.getConfigurationSection<StorageConfiguration>(
            ConfigurationSection.performanceStorage
          )
        if (performanceStorageConfiguration.enabled === true) {
          this.storage = StorageFactory.getStorage(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            performanceStorageConfiguration.type!,
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            performanceStorageConfiguration.uri!,
            this.logPrefix()
          )
          await this.storage?.open()
        }
        if (
          !this.uiServerStarted &&
          Configuration.getConfigurationSection<UIServerConfiguration>(
            ConfigurationSection.uiServer
          ).enabled === true
        ) {
          this.uiServer.start()
          this.uiServerStarted = true
        }
        // Start ChargingStation object instance in worker thread
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        for (const stationTemplateUrl of Configuration.getStationTemplateUrls()!) {
          try {
            const nbStations = stationTemplateUrl.numberOfStations
            for (let index = 1; index <= nbStations; index++) {
              await this.addChargingStation(index, stationTemplateUrl.file)
            }
          } catch (error) {
            console.error(
              chalk.red(
                `Error at starting charging station with template file ${stationTemplateUrl.file}: `
              ),
              error
            )
          }
        }
        const workerConfiguration = Configuration.getConfigurationSection<WorkerConfiguration>(
          ConfigurationSection.worker
        )
        console.info(
          chalk.green(
            `Charging stations simulator ${this.version} started with ${this.numberOfConfiguredChargingStations.toString()} configured and ${this.numberOfProvisionedChargingStations.toString()} provisioned charging station(s) from ${this.numberOfChargingStationTemplates.toString()} charging station template(s) and ${
              Configuration.workerDynamicPoolInUse()
                ? // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                  `${workerConfiguration.poolMinSize?.toString()}/`
                : ''
              // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            }${this.workerImplementation?.size.toString()}${
              Configuration.workerPoolInUse()
                ? // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                  `/${workerConfiguration.poolMaxSize?.toString()}`
                : ''
              // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            } worker(s) concurrently running in '${workerConfiguration.processType}' mode${
              this.workerImplementation?.maxElementsPerWorker != null
                ? ` (${this.workerImplementation.maxElementsPerWorker.toString()} charging station(s) per worker)`
                : ''
            }`
          )
        )
        Configuration.workerDynamicPoolInUse() &&
          console.warn(
            chalk.yellow(
              'Charging stations simulator is using dynamic pool mode. This is an experimental feature with known issues.\nPlease consider using fixed pool or worker set mode instead'
            )
          )
        console.info(chalk.green('Worker set/pool information:'), this.workerImplementation?.info)
        this.started = true
        this.starting = false
      } else {
        console.error(chalk.red('Cannot start an already starting charging stations simulator'))
      }
    } else {
      console.error(chalk.red('Cannot start an already started charging stations simulator'))
    }
  }

  public async stop (): Promise<void> {
    if (this.started) {
      if (!this.stopping) {
        this.stopping = true
        await this.uiServer.sendInternalRequest(
          this.uiServer.buildProtocolRequest(
            generateUUID(),
            ProcedureName.STOP_CHARGING_STATION,
            Constants.EMPTY_FROZEN_OBJECT
          )
        )
        try {
          await this.waitChargingStationsStopped()
        } catch (error) {
          console.error(chalk.red('Error while waiting for charging stations to stop: '), error)
        }
        await this.workerImplementation?.stop()
        this.removeAllListeners()
        this.uiServer.clearCaches()
        await this.storage?.close()
        delete this.storage
        this.started = false
        this.stopping = false
      } else {
        console.error(chalk.red('Cannot stop an already stopping charging stations simulator'))
      }
    } else {
      console.error(chalk.red('Cannot stop an already stopped charging stations simulator'))
    }
  }

  private get numberOfAddedChargingStations (): number {
    return [...this.templateStatistics.values()].reduce(
      (accumulator, value) => accumulator + value.added,
      0
    )
  }

  public get numberOfChargingStationTemplates (): number {
    return this.templateStatistics.size
  }

  public get numberOfConfiguredChargingStations (): number {
    return [...this.templateStatistics.values()].reduce(
      (accumulator, value) => accumulator + value.configured,
      0
    )
  }

  public get numberOfProvisionedChargingStations (): number {
    return [...this.templateStatistics.values()].reduce(
      (accumulator, value) => accumulator + value.provisioned,
      0
    )
  }

  private get numberOfStartedChargingStations (): number {
    return [...this.templateStatistics.values()].reduce(
      (accumulator, value) => accumulator + value.started,
      0
    )
  }
}
