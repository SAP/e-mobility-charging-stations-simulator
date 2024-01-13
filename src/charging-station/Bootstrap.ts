// Partial Copyright Jerome Benoit. 2021-2024. All Rights Reserved.

import { EventEmitter } from 'node:events'
import { dirname, extname, join } from 'node:path'
import process, { exit } from 'node:process'
import { fileURLToPath } from 'node:url'

import chalk from 'chalk'
import { availableParallelism } from 'poolifier'

import { waitChargingStationEvents } from './Helpers.js'
import type { AbstractUIServer } from './ui-server/AbstractUIServer.js'
import { UIServerFactory } from './ui-server/UIServerFactory.js'
import { version } from '../../package.json'
import { BaseError } from '../exception/index.js'
import { type Storage, StorageFactory } from '../performance/index.js'
import {
  type ChargingStationData,
  type ChargingStationWorkerData,
  type ChargingStationWorkerMessage,
  type ChargingStationWorkerMessageData,
  ChargingStationWorkerMessageEvents,
  ConfigurationSection,
  ProcedureName,
  type StationTemplateUrl,
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
  logger
} from '../utils/index.js'
import { type WorkerAbstract, WorkerFactory } from '../worker/index.js'

const moduleName = 'Bootstrap'

enum exitCodes {
  succeeded = 0,
  missingChargingStationsConfiguration = 1,
  noChargingStationTemplates = 2,
  gracefulShutdownError = 3
}

export class Bootstrap extends EventEmitter {
  private static instance: Bootstrap | null = null
  public numberOfChargingStations!: number
  public numberOfChargingStationTemplates!: number
  private workerImplementation?: WorkerAbstract<ChargingStationWorkerData>
  private readonly uiServer?: AbstractUIServer
  private storage?: Storage
  private numberOfStartedChargingStations!: number
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
    this.initializedCounters = false
    this.initializeCounters()
    this.uiServer = UIServerFactory.getUIServerImplementation(
      Configuration.getConfigurationSection<UIServerConfiguration>(ConfigurationSection.uiServer)
    )
    Configuration.configurationChangeCallback = async () => {
      await Bootstrap.getInstance().restart(false)
    }
  }

  public static getInstance (): Bootstrap {
    if (Bootstrap.instance === null) {
      Bootstrap.instance = new Bootstrap()
    }
    return Bootstrap.instance
  }

  public async start (): Promise<void> {
    if (!this.started) {
      if (!this.starting) {
        this.starting = true
        this.on(ChargingStationWorkerMessageEvents.started, this.workerEventStarted)
        this.on(ChargingStationWorkerMessageEvents.stopped, this.workerEventStopped)
        this.on(ChargingStationWorkerMessageEvents.updated, this.workerEventUpdated)
        this.on(
          ChargingStationWorkerMessageEvents.performanceStatistics,
          this.workerEventPerformanceStatistics
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
            const nbStations = stationTemplateUrl.numberOfStations
            for (let index = 1; index <= nbStations; index++) {
              await this.startChargingStation(index, stationTemplateUrl)
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
            } started with ${this.numberOfChargingStations.toString()} charging station(s) from ${this.numberOfChargingStationTemplates.toString()} configured charging station template(s) and ${
              Configuration.workerDynamicPoolInUse()
                ? `${workerConfiguration.poolMinSize?.toString()}/`
                : ''
            }${this.workerImplementation?.size}${
              Configuration.workerPoolInUse()
                ? `/${workerConfiguration.poolMaxSize?.toString()}`
                : ''
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

  public async stop (stopChargingStations = true): Promise<void> {
    if (this.started) {
      if (!this.stopping) {
        this.stopping = true
        if (stopChargingStations) {
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
        }
        await this.workerImplementation?.stop()
        delete this.workerImplementation
        this.removeAllListeners()
        await this.storage?.close()
        delete this.storage
        this.resetCounters()
        this.initializedCounters = false
        this.started = false
        this.stopping = false
      } else {
        console.error(chalk.red('Cannot stop an already stopping charging stations simulator'))
      }
    } else {
      console.error(chalk.red('Cannot stop an already stopped charging stations simulator'))
    }
  }

  public async restart (stopChargingStations?: boolean): Promise<void> {
    await this.stop(stopChargingStations)
    Configuration.getConfigurationSection<UIServerConfiguration>(ConfigurationSection.uiServer)
      .enabled === false && this.uiServer?.stop()
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
    let elementsPerWorker: number | undefined
    switch (workerConfiguration.elementsPerWorker) {
      case 'auto':
        elementsPerWorker =
          this.numberOfChargingStations > availableParallelism()
            ? Math.round(this.numberOfChargingStations / (availableParallelism() * 1.5))
            : 1
        break
      case 'all':
        elementsPerWorker = this.numberOfChargingStations
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
          messageHandler: this.messageHandler.bind(this) as (message: unknown) => void,
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
        case ChargingStationWorkerMessageEvents.started:
          this.emit(ChargingStationWorkerMessageEvents.started, msg.data as ChargingStationData)
          break
        case ChargingStationWorkerMessageEvents.stopped:
          this.emit(ChargingStationWorkerMessageEvents.stopped, msg.data as ChargingStationData)
          break
        case ChargingStationWorkerMessageEvents.updated:
          this.emit(ChargingStationWorkerMessageEvents.updated, msg.data as ChargingStationData)
          break
        case ChargingStationWorkerMessageEvents.performanceStatistics:
          this.emit(
            ChargingStationWorkerMessageEvents.performanceStatistics,
            msg.data as Statistics
          )
          break
        case ChargingStationWorkerMessageEvents.startWorkerElementError:
          logger.error(
            `${this.logPrefix()} ${moduleName}.messageHandler: Error occured while starting worker element:`,
            msg.data
          )
          this.emit(ChargingStationWorkerMessageEvents.startWorkerElementError, msg.data)
          break
        case ChargingStationWorkerMessageEvents.startedWorkerElement:
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

  private readonly workerEventStarted = (data: ChargingStationData): void => {
    this.uiServer?.chargingStations.set(data.stationInfo.hashId, data)
    ++this.numberOfStartedChargingStations
    logger.info(
      `${this.logPrefix()} ${moduleName}.workerEventStarted: Charging station ${
        data.stationInfo.chargingStationId
      } (hashId: ${data.stationInfo.hashId}) started (${
        this.numberOfStartedChargingStations
      } started from ${this.numberOfChargingStations})`
    )
  }

  private readonly workerEventStopped = (data: ChargingStationData): void => {
    this.uiServer?.chargingStations.set(data.stationInfo.hashId, data)
    --this.numberOfStartedChargingStations
    logger.info(
      `${this.logPrefix()} ${moduleName}.workerEventStopped: Charging station ${
        data.stationInfo.chargingStationId
      } (hashId: ${data.stationInfo.hashId}) stopped (${
        this.numberOfStartedChargingStations
      } started from ${this.numberOfChargingStations})`
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
      this.resetCounters()
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const stationTemplateUrls = Configuration.getStationTemplateUrls()!
      if (isNotEmptyArray(stationTemplateUrls)) {
        this.numberOfChargingStationTemplates = stationTemplateUrls.length
        for (const stationTemplateUrl of stationTemplateUrls) {
          this.numberOfChargingStations += stationTemplateUrl.numberOfStations
        }
      } else {
        console.warn(
          chalk.yellow("'stationTemplateUrls' not defined or empty in configuration, exiting")
        )
        exit(exitCodes.missingChargingStationsConfiguration)
      }
      if (this.numberOfChargingStations === 0) {
        console.warn(chalk.yellow('No charging station template enabled in configuration, exiting'))
        exit(exitCodes.noChargingStationTemplates)
      }
      this.initializedCounters = true
    }
  }

  private resetCounters (): void {
    this.numberOfChargingStationTemplates = 0
    this.numberOfChargingStations = 0
    this.numberOfStartedChargingStations = 0
  }

  private async startChargingStation (
    index: number,
    stationTemplateUrl: StationTemplateUrl
  ): Promise<void> {
    await this.workerImplementation?.addElement({
      index,
      templateFile: join(
        dirname(fileURLToPath(import.meta.url)),
        'assets',
        'station-templates',
        stationTemplateUrl.file
      )
    })
  }

  private gracefulShutdown (): void {
    this.stop()
      .then(() => {
        console.info(chalk.green('Graceful shutdown'))
        this.uiServer?.stop()
        // stop() asks for charging stations to stop by default
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
