// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Worker, isMainThread } from 'worker_threads';

import chalk from 'chalk';

import { ChargingStationUtils } from './ChargingStationUtils';
import { type AbstractUIServer, UIServerFactory } from './internal';
import { version } from '../../package.json';
import { BaseError } from '../exception';
import { type Storage, StorageFactory } from '../performance';
import {
  type ChargingStationData,
  type ChargingStationWorkerData,
  type ChargingStationWorkerMessage,
  type ChargingStationWorkerMessageData,
  ChargingStationWorkerMessageEvents,
  type StationTemplateUrl,
  type Statistics,
} from '../types';
import { Configuration } from '../utils/Configuration';
import { logger } from '../utils/Logger';
import { Utils } from '../utils/Utils';
import { type MessageHandler, type WorkerAbstract, WorkerFactory } from '../worker';

const moduleName = 'Bootstrap';

enum exitCodes {
  missingChargingStationsConfiguration = 1,
  noChargingStationTemplates = 2,
}

export class Bootstrap {
  private static instance: Bootstrap | null = null;
  public numberOfChargingStations!: number;
  public numberOfChargingStationTemplates!: number;
  private workerImplementation: WorkerAbstract<ChargingStationWorkerData> | null;
  private readonly uiServer!: AbstractUIServer | null;
  private readonly storage!: Storage;
  private numberOfStartedChargingStations!: number;
  private readonly version: string = version;
  private initializedCounters: boolean;
  private started: boolean;
  private readonly workerScript: string;

  private constructor() {
    // Enable unconditionally for now
    this.logUnhandledRejection();
    this.logUncaughtException();
    this.initializedCounters = false;
    this.started = false;
    this.initializeCounters();
    this.workerImplementation = null;
    this.workerScript = path.join(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../'),
      'charging-station',
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
            ChargingStationUtils.workerDynamicPoolInUse()
              ? `${Configuration.getWorker().poolMinSize?.toString()}/`
              : ''
          }${this.workerImplementation?.size}${
            ChargingStationUtils.workerPoolInUse()
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
    } else {
      console.error(chalk.red('Cannot start an already started charging stations simulator'));
    }
  }

  public async stop(): Promise<void> {
    if (isMainThread && this.started === true) {
      await this.workerImplementation?.stop();
      this.workerImplementation = null;
      this.uiServer?.stop();
      await this.storage?.close();
      this.initializedCounters = false;
      this.started = false;
    } else {
      console.error(chalk.red('Cannot stop a not started charging stations simulator'));
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
        case ChargingStationWorkerMessageEvents.STARTED:
          this.workerEventStarted(msg.data as ChargingStationData);
          break;
        case ChargingStationWorkerMessageEvents.STOPPED:
          this.workerEventStopped(msg.data as ChargingStationData);
          break;
        case ChargingStationWorkerMessageEvents.UPDATED:
          this.workerEventUpdated(msg.data as ChargingStationData);
          break;
        case ChargingStationWorkerMessageEvents.PERFORMANCE_STATISTICS:
          this.workerEventPerformanceStatistics(msg.data as Statistics);
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
      this.numberOfChargingStationTemplates = 0;
      this.numberOfChargingStations = 0;
      const stationTemplateUrls = Configuration.getStationTemplateUrls();
      if (Utils.isNotEmptyArray(stationTemplateUrls)) {
        this.numberOfChargingStationTemplates = stationTemplateUrls.length;
        stationTemplateUrls.forEach((stationTemplateUrl) => {
          this.numberOfChargingStations += stationTemplateUrl.numberOfStations ?? 0;
        });
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
      this.numberOfStartedChargingStations = 0;
      this.initializedCounters = true;
    }
  }

  private logUncaughtException(): void {
    process.on('uncaughtException', (error: Error) => {
      console.error(chalk.red('Uncaught exception: '), error);
    });
  }

  private logUnhandledRejection(): void {
    process.on('unhandledRejection', (reason: unknown) => {
      console.error(chalk.red('Unhandled rejection: '), reason);
    });
  }

  private async startChargingStation(
    index: number,
    stationTemplateUrl: StationTemplateUrl
  ): Promise<void> {
    await this.workerImplementation?.addElement({
      index,
      templateFile: path.join(
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../'),
        'assets',
        'station-templates',
        stationTemplateUrl.file
      ),
    });
  }

  private logPrefix = (): string => {
    return Utils.logPrefix(' Bootstrap |');
  };
}
