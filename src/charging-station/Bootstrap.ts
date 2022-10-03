// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import path from 'path';
import { fileURLToPath } from 'url';
import { type Worker, isMainThread } from 'worker_threads';

import chalk from 'chalk';

import { version } from '../../package.json';
import BaseError from '../exception/BaseError';
import type { Storage } from '../performance/storage/Storage';
import { StorageFactory } from '../performance/storage/StorageFactory';
import {
  ChargingStationData,
  ChargingStationWorkerData,
  ChargingStationWorkerMessage,
  ChargingStationWorkerMessageData,
  ChargingStationWorkerMessageEvents,
} from '../types/ChargingStationWorker';
import type { StationTemplateUrl } from '../types/ConfigurationData';
import type { Statistics } from '../types/Statistics';
import Configuration from '../utils/Configuration';
import logger from '../utils/Logger';
import Utils from '../utils/Utils';
import type WorkerAbstract from '../worker/WorkerAbstract';
import WorkerFactory from '../worker/WorkerFactory';
import { ChargingStationUtils } from './ChargingStationUtils';
import type { AbstractUIServer } from './ui-server/AbstractUIServer';
import UIServerFactory from './ui-server/UIServerFactory';

const moduleName = 'Bootstrap';

enum exitCodes {
  missingChargingStationsConfiguration = 1,
  noChargingStationTemplates = 2,
}

export class Bootstrap {
  private static instance: Bootstrap | null = null;
  private workerImplementation: WorkerAbstract<ChargingStationWorkerData> | null;
  private readonly uiServer!: AbstractUIServer;
  private readonly storage!: Storage;
  private numberOfChargingStationTemplates!: number;
  private numberOfChargingStations!: number;
  private numberOfStartedChargingStations!: number;
  private readonly version: string = version;
  private started: boolean;
  private readonly workerScript: string;

  private constructor() {
    this.started = false;
    this.workerImplementation = null;
    this.workerScript = path.join(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../'),
      'charging-station',
      'ChargingStationWorker' + path.extname(fileURLToPath(import.meta.url))
    );
    this.initialize();
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
      try {
        // Enable unconditionally for now
        this.logUnhandledRejection();
        this.logUncaughtException();
        this.initialize();
        await this.storage?.open();
        await this.workerImplementation.start();
        this.uiServer?.start();
        const stationTemplateUrls = Configuration.getStationTemplateUrls();
        this.numberOfChargingStationTemplates = stationTemplateUrls.length;
        // Start ChargingStation object in worker thread
        if (!Utils.isEmptyArray(stationTemplateUrls)) {
          for (const stationTemplateUrl of stationTemplateUrls) {
            try {
              const nbStations = stationTemplateUrl.numberOfStations ?? 0;
              for (let index = 1; index <= nbStations; index++) {
                await this.startChargingStation(index, stationTemplateUrl);
              }
            } catch (error) {
              console.error(
                chalk.red(
                  'Error at starting charging station with template file ' +
                    stationTemplateUrl.file +
                    ': '
                ),
                error
              );
            }
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
        } else {
          console.info(
            chalk.green(
              `Charging stations simulator ${
                this.version
              } started with ${this.numberOfChargingStations.toString()} charging station(s) from ${this.numberOfChargingStationTemplates.toString()} configured charging station template(s) and ${
                ChargingStationUtils.workerDynamicPoolInUse()
                  ? `${Configuration.getWorker().poolMinSize.toString()}/`
                  : ''
              }${this.workerImplementation.size}${
                ChargingStationUtils.workerPoolInUse()
                  ? `/${Configuration.getWorker().poolMaxSize.toString()}`
                  : ''
              } worker(s) concurrently running in '${Configuration.getWorker().processType}' mode${
                this.workerImplementation.maxElementsPerWorker
                  ? ` (${this.workerImplementation.maxElementsPerWorker} charging station(s) per worker)`
                  : ''
              }`
            )
          );
        }
        this.started = true;
      } catch (error) {
        console.error(chalk.red('Bootstrap start error: '), error);
      }
    } else {
      console.error(chalk.red('Cannot start an already started charging stations simulator'));
    }
  }

  public async stop(): Promise<void> {
    if (isMainThread && this.started === true) {
      await this.workerImplementation.stop();
      this.workerImplementation = null;
      this.uiServer?.stop();
      await this.storage?.close();
      this.started = false;
    } else {
      console.error(chalk.red('Cannot stop a not started charging stations simulator'));
    }
  }

  public async restart(): Promise<void> {
    await this.stop();
    this.initialize();
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
          messageHandler: this.messageHandler.bind(this) as (
            this: Worker,
            msg: ChargingStationWorkerMessage<ChargingStationWorkerMessageData>
          ) => void,
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

  private initialize() {
    this.numberOfChargingStationTemplates = 0;
    this.numberOfChargingStations = 0;
    this.numberOfStartedChargingStations = 0;
    this.initializeWorkerImplementation();
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
    const workerData: ChargingStationWorkerData = {
      index,
      templateFile: path.join(
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../'),
        'assets',
        'station-templates',
        stationTemplateUrl.file
      ),
    };
    await this.workerImplementation.addElement(workerData);
    ++this.numberOfChargingStations;
  }

  private logPrefix(): string {
    return Utils.logPrefix(' Bootstrap |');
  }
}
