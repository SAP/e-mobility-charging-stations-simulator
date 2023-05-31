// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import { EventEmitter } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Worker, isMainThread } from 'node:worker_threads';

import chalk from 'chalk';

import type { AbstractUIServer } from './ui-server/AbstractUIServer';
import { UIServerFactory } from './ui-server/UIServerFactory';
import packageJson from '../../package.json' assert { type: 'json' };
import { BaseError } from '../exception';
import { type Storage, StorageFactory } from '../performance';
import {
  type ChargingStationData,
  type ChargingStationWorkerData,
  type ChargingStationWorkerMessage,
  type ChargingStationWorkerMessageData,
  ChargingStationWorkerMessageEvents,
  ProcedureName,
  type StationTemplateUrl,
  type Statistics,
} from '../types';
import {
  Configuration,
  Constants,
  Utils,
  handleUncaughtException,
  handleUnhandledRejection,
  logger,
} from '../utils';
import { type MessageHandler, type WorkerAbstract, WorkerFactory } from '../worker';

const moduleName = 'Bootstrap';

enum exitCodes {
  missingChargingStationsConfiguration = 1,
  noChargingStationTemplates = 2,
}

export class Bootstrap extends EventEmitter {
  private static instance: Bootstrap | null = null;
  public numberOfChargingStations!: number;
  public numberOfChargingStationTemplates!: number;
  private workerImplementation: WorkerAbstract<ChargingStationWorkerData> | null;
  private readonly uiServer!: AbstractUIServer | null;
  private readonly storage!: Storage;
  private numberOfStartedChargingStations!: number;
  private readonly version: string = packageJson.version;
  private initializedCounters: boolean;
  private started: boolean;
  private starting: boolean;
  private stopping: boolean;
  private readonly workerScript: string;

  private constructor() {
    super();
    for (const signal of ['SIGINT', 'SIGQUIT', 'SIGTERM']) {
      process.on(signal, this.gracefulShutdown);
    }
    // Enable unconditionally for now
    handleUnhandledRejection();
    handleUncaughtException();
    this.started = false;
    this.starting = false;
    this.stopping = false;
    this.initializedCounters = false;
    this.initializeCounters();
    this.workerImplementation = null;
    this.workerScript = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      `ChargingStationWorker${path.extname(fileURLToPath(import.meta.url))}`
    );
    Configuration.getUIServer().enabled === true &&
      (this.uiServer = UIServerFactory.getUIServerImplementation(Configuration.getUIServer()));
    Configuration.getPerformanceStorage().enabled === true &&
      (this.storage = StorageFactory.getStorage(
        Configuration.getPerformanceStorage().type,
        Configuration.getPerformanceStorage().uri,
        this.logPrefix()
      ));
    Configuration.setConfigurationChangeCallback(async () => Bootstrap.getInstance().restart());
  }

  public static getInstance(): Bootstrap {
    if (Bootstrap.instance === null) {
      Bootstrap.instance = new Bootstrap();
    }
    return Bootstrap.instance;
  }

  public async start(): Promise<void> {
    if (isMainThread && this.started === false) {
      if (this.starting === false) {
        this.starting = true;
        this.initializeCounters();
        this.initializeWorkerImplementation();
        await this.workerImplementation?.start();
        await this.storage?.open();
        this.uiServer?.start();
        // Start ChargingStation object instance in worker thread
        for (const stationTemplateUrl of Configuration.getStationTemplateUrls()) {
          try {
            const nbStations = stationTemplateUrl.numberOfStations ?? 0;
            for (let index = 1; index <= nbStations; index++) {
              await this.startChargingStation(index, stationTemplateUrl);
            }
          } catch (error) {
            console.error(
              chalk.red(
                `Error at starting charging station with template file ${stationTemplateUrl.file}: `
              ),
              error
            );
          }
        }
        console.info(
          chalk.green(
            `Charging stations simulator ${
              this.version
            } started with ${this.numberOfChargingStations.toString()} charging station(s) from ${this.numberOfChargingStationTemplates.toString()} configured charging station template(s) and ${
              Configuration.workerDynamicPoolInUse()
                ? `${Configuration.getWorker().poolMinSize?.toString()}/`
                : ''
            }${this.workerImplementation?.size}${
              Configuration.workerPoolInUse()
                ? `/${Configuration.getWorker().poolMaxSize?.toString()}`
                : ''
            } worker(s) concurrently running in '${Configuration.getWorker().processType}' mode${
              !Utils.isNullOrUndefined(this.workerImplementation?.maxElementsPerWorker)
                ? ` (${this.workerImplementation?.maxElementsPerWorker} charging station(s) per worker)`
                : ''
            }`
          )
        );
        this.started = true;
        this.starting = false;
      } else {
        console.error(chalk.red('Cannot start an already starting charging stations simulator'));
      }
    } else {
      console.error(chalk.red('Cannot start an already started charging stations simulator'));
    }
  }

  public async stop(): Promise<void> {
    if (isMainThread && this.started === true) {
      if (this.stopping === false) {
        this.stopping = true;
        await this.uiServer?.sendInternalRequest(
          this.uiServer.buildProtocolRequest(
            Utils.generateUUID(),
            ProcedureName.STOP_CHARGING_STATION,
            Constants.EMPTY_FREEZED_OBJECT
          )
        );
        await this.waitForChargingStationsStopped();
        await this.workerImplementation?.stop();
        this.workerImplementation = null;
        this.uiServer?.stop();
        await this.storage?.close();
        this.resetCounters();
        this.initializedCounters = false;
        this.started = false;
        this.stopping = false;
      } else {
        console.error(chalk.red('Cannot stop an already stopping charging stations simulator'));
      }
    } else {
      console.error(chalk.red('Cannot stop an already stopped charging stations simulator'));
    }
  }

  public async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  private initializeWorkerImplementation(): void {
    this.workerImplementation === null &&
      (this.workerImplementation = WorkerFactory.getWorkerImplementation<ChargingStationWorkerData>(
        this.workerScript,
        Configuration.getWorker().processType,
        {
          workerStartDelay: Configuration.getWorker().startDelay,
          elementStartDelay: Configuration.getWorker().elementStartDelay,
          poolMaxSize: Configuration.getWorker().poolMaxSize,
          poolMinSize: Configuration.getWorker().poolMinSize,
          elementsPerWorker: Configuration.getWorker().elementsPerWorker,
          poolOptions: {
            workerChoiceStrategy: Configuration.getWorker().poolStrategy,
          },
          messageHandler: this.messageHandler.bind(this) as MessageHandler<Worker>,
        }
      ));
  }

  private messageHandler(
    msg: ChargingStationWorkerMessage<ChargingStationWorkerMessageData>
  ): void {
    // logger.debug(
    //   `${this.logPrefix()} ${moduleName}.messageHandler: Worker channel message received: ${JSON.stringify(
    //     msg,
    //     null,
    //     2
    //   )}`
    // );
    try {
      switch (msg.id) {
        case ChargingStationWorkerMessageEvents.started:
          this.workerEventStarted(msg.data as ChargingStationData);
          this.emit(ChargingStationWorkerMessageEvents.started, msg.data as ChargingStationData);
          break;
        case ChargingStationWorkerMessageEvents.stopped:
          this.workerEventStopped(msg.data as ChargingStationData);
          this.emit(ChargingStationWorkerMessageEvents.stopped, msg.data as ChargingStationData);
          break;
        case ChargingStationWorkerMessageEvents.updated:
          this.workerEventUpdated(msg.data as ChargingStationData);
          this.emit(ChargingStationWorkerMessageEvents.updated, msg.data as ChargingStationData);
          break;
        case ChargingStationWorkerMessageEvents.performanceStatistics:
          this.workerEventPerformanceStatistics(msg.data as Statistics);
          this.emit(
            ChargingStationWorkerMessageEvents.performanceStatistics,
            msg.data as Statistics
          );
          break;
        default:
          throw new BaseError(
            `Unknown event type: '${msg.id}' for data: ${JSON.stringify(msg.data, null, 2)}`
          );
      }
    } catch (error) {
      logger.error(
        `${this.logPrefix()} ${moduleName}.messageHandler: Error occurred while handling '${
          msg.id
        }' event:`,
        error
      );
    }
  }

  private workerEventStarted = (data: ChargingStationData) => {
    this.uiServer?.chargingStations.set(data.stationInfo.hashId, data);
    ++this.numberOfStartedChargingStations;
    logger.info(
      `${this.logPrefix()} ${moduleName}.workerEventStarted: Charging station ${
        data.stationInfo.chargingStationId
      } (hashId: ${data.stationInfo.hashId}) started (${
        this.numberOfStartedChargingStations
      } started from ${this.numberOfChargingStations})`
    );
  };

  private workerEventStopped = (data: ChargingStationData) => {
    this.uiServer?.chargingStations.set(data.stationInfo.hashId, data);
    --this.numberOfStartedChargingStations;
    logger.info(
      `${this.logPrefix()} ${moduleName}.workerEventStopped: Charging station ${
        data.stationInfo.chargingStationId
      } (hashId: ${data.stationInfo.hashId}) stopped (${
        this.numberOfStartedChargingStations
      } started from ${this.numberOfChargingStations})`
    );
  };

  private workerEventUpdated = (data: ChargingStationData) => {
    this.uiServer?.chargingStations.set(data.stationInfo.hashId, data);
  };

  private workerEventPerformanceStatistics = (data: Statistics) => {
    this.storage.storePerformanceStatistics(data) as void;
  };

  private initializeCounters() {
    if (this.initializedCounters === false) {
      this.resetCounters();
      const stationTemplateUrls = Configuration.getStationTemplateUrls();
      if (Utils.isNotEmptyArray(stationTemplateUrls)) {
        this.numberOfChargingStationTemplates = stationTemplateUrls.length;
        for (const stationTemplateUrl of stationTemplateUrls) {
          this.numberOfChargingStations += stationTemplateUrl.numberOfStations ?? 0;
        }
      } else {
        console.warn(
          chalk.yellow("'stationTemplateUrls' not defined or empty in configuration, exiting")
        );
        process.exit(exitCodes.missingChargingStationsConfiguration);
      }
      if (this.numberOfChargingStations === 0) {
        console.warn(
          chalk.yellow('No charging station template enabled in configuration, exiting')
        );
        process.exit(exitCodes.noChargingStationTemplates);
      }
      this.initializedCounters = true;
    }
  }

  private resetCounters(): void {
    this.numberOfChargingStationTemplates = 0;
    this.numberOfChargingStations = 0;
    this.numberOfStartedChargingStations = 0;
  }

  private async startChargingStation(
    index: number,
    stationTemplateUrl: StationTemplateUrl
  ): Promise<void> {
    await this.workerImplementation?.addElement({
      index,
      templateFile: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        'assets',
        'station-templates',
        stationTemplateUrl.file
      ),
    });
  }

  private gracefulShutdown = (): void => {
    console.info(`${chalk.green('Graceful shutdown')}`);
    this.stop()
      .then(() => {
        process.exit(0);
      })
      .catch((error) => {
        console.error(chalk.red('Error while shutdowning charging stations simulator: '), error);
        process.exit(1);
      });
  };

  private waitForChargingStationsStopped = async (
    stoppedEventsToWait = this.numberOfStartedChargingStations
  ): Promise<number> => {
    return new Promise((resolve) => {
      let stoppedEvents = 0;
      if (stoppedEventsToWait === 0) {
        resolve(stoppedEvents);
      }
      this.on(ChargingStationWorkerMessageEvents.stopped, () => {
        ++stoppedEvents;
        if (stoppedEvents === stoppedEventsToWait) {
          resolve(stoppedEvents);
        }
      });
    });
  };

  private logPrefix = (): string => {
    return Utils.logPrefix(' Bootstrap |');
  };
}
