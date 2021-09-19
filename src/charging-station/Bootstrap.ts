// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import { ChargingStationWorkerData, WorkerMessage, WorkerMessageEvents } from '../types/Worker';

import Configuration from '../utils/Configuration';
import { Storage } from '../performance/storage/Storage';
import { StorageFactory } from '../performance/storage/StorageFactory';
import Utils from '../utils/Utils';
import WorkerAbstract from '../worker/WorkerAbstract';
import WorkerFactory from '../worker/WorkerFactory';
import chalk from 'chalk';
import { isMainThread } from 'worker_threads';
import path from 'path';
import { version } from '../../package.json';

export default class Bootstrap {
  private static instance: Bootstrap | null = null;
  private static workerImplementation: WorkerAbstract | null = null;
  private static storage: Storage;
  private static numberOfChargingStations: number;
  private version: string = version;
  private started: boolean;
  private workerScript: string;

  private constructor() {
    this.started = false;
    this.workerScript = path.join(path.resolve(__dirname, '../'), 'charging-station', 'ChargingStationWorker.js');
    this.initWorkerImplementation();
    Bootstrap.storage = StorageFactory.getStorage(Configuration.getPerformanceStorage().type, Configuration.getPerformanceStorage().URI, this.logPrefix());
    Configuration.setConfigurationChangeCallback(async () => Bootstrap.getInstance().restart());
  }

  public static getInstance(): Bootstrap {
    if (!Bootstrap.instance) {
      Bootstrap.instance = new Bootstrap();
    }
    return Bootstrap.instance;
  }

  public async start(): Promise<void> {
    if (isMainThread && !this.started) {
      try {
        Bootstrap.numberOfChargingStations = 0;
        await Bootstrap.storage.open();
        await Bootstrap.workerImplementation.start();
        // Start ChargingStation object in worker thread
        if (Configuration.getStationTemplateURLs()) {
          for (const stationURL of Configuration.getStationTemplateURLs()) {
            try {
              const nbStations = stationURL.numberOfStations ?? 0;
              for (let index = 1; index <= nbStations; index++) {
                const workerData: ChargingStationWorkerData = {
                  index,
                  templateFile: path.join(path.resolve(__dirname, '../'), 'assets', 'station-templates', path.basename(stationURL.file))
                };
                await Bootstrap.workerImplementation.addElement(workerData);
                Bootstrap.numberOfChargingStations++;
              }
            } catch (error) {
              console.error(chalk.red('Charging station start with template file ' + stationURL.file + ' error '), error);
            }
          }
        } else {
          console.warn(chalk.yellow('No stationTemplateURLs defined in configuration, exiting'));
        }
        if (Bootstrap.numberOfChargingStations === 0) {
          console.warn(chalk.yellow('No charging station template enabled in configuration, exiting'));
        } else {
          console.log(chalk.green(`Charging stations simulator ${this.version} started with ${Bootstrap.numberOfChargingStations.toString()} charging station(s) and ${Utils.workerDynamicPoolInUse() ? `${Configuration.getWorkerPoolMinSize().toString()}/` : ''}${Bootstrap.workerImplementation.size}${Utils.workerPoolInUse() ? `/${Configuration.getWorkerPoolMaxSize().toString()}` : ''} worker(s) concurrently running in '${Configuration.getWorkerProcess()}' mode${Bootstrap.workerImplementation.maxElementsPerWorker ? ` (${Bootstrap.workerImplementation.maxElementsPerWorker} charging station(s) per worker)` : ''}`));
        }
        this.started = true;
      } catch (error) {
        console.error(chalk.red('Bootstrap start error '), error);
      }
    } else {
      console.error(chalk.red('Cannot start an already started charging stations simulator'));
    }
  }

  public async stop(): Promise<void> {
    if (isMainThread && this.started) {
      await Bootstrap.workerImplementation.stop();
      await Bootstrap.storage.close();
    } else {
      console.error(chalk.red('Trying to stop the charging stations simulator while not started'));
    }
    this.started = false;
  }

  public async restart(): Promise<void> {
    await this.stop();
    this.initWorkerImplementation();
    await this.start();
  }

  private initWorkerImplementation(): void {
    Bootstrap.workerImplementation = WorkerFactory.getWorkerImplementation<ChargingStationWorkerData>(this.workerScript, Configuration.getWorkerProcess(),
      {
        startDelay: Configuration.getWorkerStartDelay(),
        poolMaxSize: Configuration.getWorkerPoolMaxSize(),
        poolMinSize: Configuration.getWorkerPoolMinSize(),
        elementsPerWorker: Configuration.getChargingStationsPerWorker(),
        poolOptions: {
          workerChoiceStrategy: Configuration.getWorkerPoolStrategy()
        },
        messageHandler: async (msg: WorkerMessage) => {
          if (msg.id === WorkerMessageEvents.PERFORMANCE_STATISTICS) {
            await Bootstrap.storage.storePerformanceStatistics(msg.data);
          }
        }
      });
  }

  private logPrefix(): string {
    return Utils.logPrefix(' Bootstrap |');
  }
}
