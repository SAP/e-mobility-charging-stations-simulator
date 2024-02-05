// Partial Copyright Jerome Benoit. 2021-2024. All Rights Reserved.

import { EventEmitter } from 'node:events'
import { dirname, extname, join, parse } from 'node:path'
import process, { exit } from 'node:process'
import { fileURLToPath } from 'node:url'
import { isMainThread } from 'node:worker_threads'
import type { Worker } from 'worker_threads'

import chalk from 'chalk'
import { type MessageHandler, availableParallelism } from 'poolifier'

import { waitChargingStationEvents } from './Helpers.js'
import type { AbstractUIServer } from './ui-server/AbstractUIServer.js'
import { UIServerFactory } from './ui-server/UIServerFactory.js'
import { version } from '../../package.json'
import { BaseError } from '../exception/index.js'
import { type Storage, StorageFactory } from '../performance/index.js'
import {
  type ChargingStationData,
  type ChargingStationWorkerData,
  type ChargingStationWorkerEventError,
  type ChargingStationWorkerMessage,
  type ChargingStationWorkerMessageData,
  ChargingStationWorkerMessageEvents,
  ConfigurationSection,
  ProcedureName,
  type Statistics,
  type StorageConfiguration,
  type UIServerConfiguration,
  type WorkerConfiguration
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
  logPrefix,
  logger,
  max
} from '../utils/index.js'
import { type WorkerAbstract, WorkerFactory } from '../worker/index.js'

const moduleName = 'Bootstrap'

enum exitCodes {
  succeeded = 0,
  missingChargingStationsConfiguration = 1,
  duplicateChargingStationTemplateUrls = 2,
  noChargingStationTemplates = 3,
  gracefulShutdownError = 4
}

interface TemplateChargingStations {
  configured: number
  added: number
  started: number
  lastIndex: number
}

export class Bootstrap extends EventEmitter {
  private static instance: Bootstrap | null = null
  private workerImplementation?: WorkerAbstract<ChargingStationWorkerData>
  private readonly uiServer?: AbstractUIServer
  private storage?: Storage
  private readonly chargingStationsByTemplate: Map<string, TemplateChargingStations>
  private readonly version: string = version
  private initializedCounters: boolean
  private started: boolean
  private starting: boolean
  private stopping: boolean

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
    this.chargingStationsByTemplate = new Map<string, TemplateChargingStations>()
    this.uiServer = UIServerFactory.getUIServerImplementation(
      Configuration.getConfigurationSection<UIServerConfiguration>(ConfigurationSection.uiServer)
    )
    this.initializedCounters = false
    this.initializeCounters()
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

  public get numberOfChargingStationTemplates (): number {
    return this.chargingStationsByTemplate.size
  }

  public get numberOfConfiguredChargingStations (): number {
    return [...this.chargingStationsByTemplate.values()].reduce(
      (accumulator, value) => accumulator + value.configured,
      0
    )
  }

  public getLastIndex (templateName: string): number {
    return this.chargingStationsByTemplate.get(templateName)?.lastIndex ?? 0
  }

  public getPerformanceStatistics (): IterableIterator<Statistics> | undefined {
    return this.storage?.getPerformanceStatistics()
  }

  private get numberOfAddedChargingStations (): number {
    return [...this.chargingStationsByTemplate.values()].reduce(
      (accumulator, value) => accumulator + value.added,
      0
    )
  }

  private get numberOfStartedChargingStations (): number {
    return [...this.chargingStationsByTemplate.values()].reduce(
      (accumulator, value) => accumulator + value.started,
      0
    )
  }

  public async start (): Promise<void> {
    if (!this.started) {
      if (!this.starting) {
        this.starting = true
        this.on(ChargingStationWorkerMessageEvents.added, this.workerEventAdded)
        this.on(ChargingStationWorkerMessageEvents.started, this.workerEventStarted)
        this.on(ChargingStationWorkerMessageEvents.stopped, this.workerEventStopped)
        this.on(ChargingStationWorkerMessageEvents.updated, this.workerEventUpdated)
        this.on(
          ChargingStationWorkerMessageEvents.performanceStatistics,
          this.workerEventPerformanceStatistics
        )
        this.on(
          ChargingStationWorkerMessageEvents.workerElementError,
          (eventError: ChargingStationWorkerEventError) => {
            logger.error(
              `${this.logPrefix()} ${moduleName}.start: Error occurred while handling '${eventError.event}' event on worker:`,
              eventError
            )
          }
        )
        this.initializeCounters()
        const workerConfiguration = Configuration.getConfigurationSection<WorkerConfiguration>(
          ConfigurationSection.worker
        )
        this.initializeWorkerImplementation(workerConfiguration)
        await this.workerImplementation?.start()
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
        Configuration.getConfigurationSection<UIServerConfiguration>(ConfigurationSection.uiServer)
          .enabled === true && this.uiServer?.start()
        // Start ChargingStation object instance in worker thread
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        for (const stationTemplateUrl of Configuration.getStationTemplateUrls()!) {
          try {
            const nbStations =
              this.chargingStationsByTemplate.get(parse(stationTemplateUrl.file).name)
                ?.configured ?? stationTemplateUrl.numberOfStations
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
        console.info(
          chalk.green(
            `Charging stations simulator ${
              this.version
            } started with ${this.numberOfConfiguredChargingStations} configured charging station(s) from ${this.numberOfChargingStationTemplates} charging station template(s) and ${
              Configuration.workerDynamicPoolInUse() ? `${workerConfiguration.poolMinSize}/` : ''
            }${this.workerImplementation?.size}${
              Configuration.workerPoolInUse() ? `/${workerConfiguration.poolMaxSize}` : ''
            } worker(s) concurrently running in '${workerConfiguration.processType}' mode${
              this.workerImplementation?.maxElementsPerWorker != null
                ? ` (${this.workerImplementation.maxElementsPerWorker} charging station(s) per worker)`
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
        await this.uiServer?.sendInternalRequest(
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
        delete this.workerImplementation
        this.removeAllListeners()
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

  private async restart (): Promise<void> {
    await this.stop()
    Configuration.getConfigurationSection<UIServerConfiguration>(ConfigurationSection.uiServer)
      .enabled !== true && this.uiServer?.stop()
    this.initializedCounters = false
    await this.start()
  }

  private async waitChargingStationsStopped (): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
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
        .then(() => {
          resolve('Charging stations stopped')
        })
        .catch(reject)
        .finally(() => {
          clearTimeout(waitTimeout)
        })
    })
  }

  private initializeWorkerImplementation (workerConfiguration: WorkerConfiguration): void {
    if (!isMainThread) {
      return
    }
    let elementsPerWorker: number | undefined
    switch (workerConfiguration.elementsPerWorker) {
      case 'auto':
        elementsPerWorker =
          this.numberOfConfiguredChargingStations > availableParallelism()
            ? Math.round(this.numberOfConfiguredChargingStations / (availableParallelism() * 1.5))
            : 1
        break
      case 'all':
        elementsPerWorker = this.numberOfConfiguredChargingStations
        break
    }
    this.workerImplementation = WorkerFactory.getWorkerImplementation<ChargingStationWorkerData>(
      join(
        dirname(fileURLToPath(import.meta.url)),
        `ChargingStationWorker${extname(fileURLToPath(import.meta.url))}`
      ),
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      workerConfiguration.processType!,
      {
        workerStartDelay: workerConfiguration.startDelay,
        elementStartDelay: workerConfiguration.elementStartDelay,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        poolMaxSize: workerConfiguration.poolMaxSize!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        poolMinSize: workerConfiguration.poolMinSize!,
        elementsPerWorker: elementsPerWorker ?? (workerConfiguration.elementsPerWorker as number),
        poolOptions: {
          messageHandler: this.messageHandler.bind(this) as MessageHandler<Worker>,
          workerOptions: { resourceLimits: workerConfiguration.resourceLimits }
        }
      }
    )
  }

  private messageHandler (
    msg: ChargingStationWorkerMessage<ChargingStationWorkerMessageData>
  ): void {
    // logger.debug(
    //   `${this.logPrefix()} ${moduleName}.messageHandler: Worker channel message received: ${JSON.stringify(
    //     msg,
    //     undefined,
    //     2
    //   )}`
    // )
    try {
      switch (msg.event) {
        case ChargingStationWorkerMessageEvents.added:
          this.emit(ChargingStationWorkerMessageEvents.added, msg.data)
          break
        case ChargingStationWorkerMessageEvents.started:
          this.emit(ChargingStationWorkerMessageEvents.started, msg.data)
          break
        case ChargingStationWorkerMessageEvents.stopped:
          this.emit(ChargingStationWorkerMessageEvents.stopped, msg.data)
          break
        case ChargingStationWorkerMessageEvents.updated:
          this.emit(ChargingStationWorkerMessageEvents.updated, msg.data)
          break
        case ChargingStationWorkerMessageEvents.performanceStatistics:
          this.emit(ChargingStationWorkerMessageEvents.performanceStatistics, msg.data)
          break
        case ChargingStationWorkerMessageEvents.addedWorkerElement:
          this.emit(ChargingStationWorkerMessageEvents.addWorkerElement, msg.data)
          break
        case ChargingStationWorkerMessageEvents.workerElementError:
          this.emit(ChargingStationWorkerMessageEvents.workerElementError, msg.data)
          break
        default:
          throw new BaseError(
            `Unknown charging station worker event: '${
              msg.event
            }' received with data: ${JSON.stringify(msg.data, undefined, 2)}`
          )
      }
    } catch (error) {
      logger.error(
        `${this.logPrefix()} ${moduleName}.messageHandler: Error occurred while handling '${
          msg.event
        }' event:`,
        error
      )
    }
  }

  private readonly workerEventAdded = (data: ChargingStationData): void => {
    this.uiServer?.chargingStations.set(data.stationInfo.hashId, data)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    ++this.chargingStationsByTemplate.get(data.stationInfo.templateName)!.added
    logger.info(
      `${this.logPrefix()} ${moduleName}.workerEventAdded: Charging station ${
        data.stationInfo.chargingStationId
      } (hashId: ${data.stationInfo.hashId}) added (${
        this.numberOfAddedChargingStations
      } added from ${this.numberOfConfiguredChargingStations} configured charging station(s))`
    )
  }

  private readonly workerEventStarted = (data: ChargingStationData): void => {
    this.uiServer?.chargingStations.set(data.stationInfo.hashId, data)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    ++this.chargingStationsByTemplate.get(data.stationInfo.templateName)!.started
    logger.info(
      `${this.logPrefix()} ${moduleName}.workerEventStarted: Charging station ${
        data.stationInfo.chargingStationId
      } (hashId: ${data.stationInfo.hashId}) started (${
        this.numberOfStartedChargingStations
      } started from ${this.numberOfAddedChargingStations} added charging station(s))`
    )
  }

  private readonly workerEventStopped = (data: ChargingStationData): void => {
    this.uiServer?.chargingStations.set(data.stationInfo.hashId, data)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    --this.chargingStationsByTemplate.get(data.stationInfo.templateName)!.started
    logger.info(
      `${this.logPrefix()} ${moduleName}.workerEventStopped: Charging station ${
        data.stationInfo.chargingStationId
      } (hashId: ${data.stationInfo.hashId}) stopped (${
        this.numberOfStartedChargingStations
      } started from ${this.numberOfAddedChargingStations} added charging station(s))`
    )
  }

  private readonly workerEventUpdated = (data: ChargingStationData): void => {
    this.uiServer?.chargingStations.set(data.stationInfo.hashId, data)
  }

  private readonly workerEventPerformanceStatistics = (data: Statistics): void => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    if (isAsyncFunction(this.storage?.storePerformanceStatistics)) {
      (
        this.storage.storePerformanceStatistics as (
          performanceStatistics: Statistics
        ) => Promise<void>
      )(data).catch(Constants.EMPTY_FUNCTION)
    } else {
      (this.storage?.storePerformanceStatistics as (performanceStatistics: Statistics) => void)(
        data
      )
    }
  }

  private initializeCounters (): void {
    if (!this.initializedCounters) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const stationTemplateUrls = Configuration.getStationTemplateUrls()!
      if (isNotEmptyArray(stationTemplateUrls)) {
        for (const stationTemplateUrl of stationTemplateUrls) {
          const templateName = parse(stationTemplateUrl.file).name
          this.chargingStationsByTemplate.set(templateName, {
            configured: stationTemplateUrl.numberOfStations,
            added: 0,
            started: 0,
            lastIndex: 0
          })
          this.uiServer?.chargingStationTemplates.add(templateName)
        }
        if (this.chargingStationsByTemplate.size !== stationTemplateUrls.length) {
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
      this.initializedCounters = true
    }
  }

  public async addChargingStation (index: number, stationTemplateFile: string): Promise<void> {
    await this.workerImplementation?.addElement({
      index,
      templateFile: join(
        dirname(fileURLToPath(import.meta.url)),
        'assets',
        'station-templates',
        stationTemplateFile
      )
    })
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.chargingStationsByTemplate.get(parse(stationTemplateFile).name)!.lastIndex = max(
      index,
      this.chargingStationsByTemplate.get(parse(stationTemplateFile).name)?.lastIndex ?? -Infinity
    )
  }

  private gracefulShutdown (): void {
    this.stop()
      .then(() => {
        console.info(chalk.green('Graceful shutdown'))
        this.uiServer?.stop()
        this.waitChargingStationsStopped()
          .then(() => {
            exit(exitCodes.succeeded)
          })
          .catch(() => {
            exit(exitCodes.gracefulShutdownError)
          })
      })
      .catch(error => {
        console.error(chalk.red('Error while shutdowning charging stations simulator: '), error)
        exit(exitCodes.gracefulShutdownError)
      })
  }

  private readonly logPrefix = (): string => {
    return logPrefix(' Bootstrap |')
  }
}
