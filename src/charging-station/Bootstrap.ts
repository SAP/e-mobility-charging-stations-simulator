// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import { ChargingStationWorkerData, ChargingStationWorkerMessage, ChargingStationWorkerMessageEvents } from '../types/ChargingStationWorker';

import Configuration from '../utils/Configuration';
import { Storage } from '../performance/storage/Storage';
import { StorageFactory } from '../performance/storage/StorageFactory';
import { UIServiceUtils } from './UIWebSocketServices/UIServiceUtils';
import UIWebSocketServer from './UIWebSocketServer';
import Utils from '../utils/Utils';
import WorkerAbstract from '../worker/WorkerAbstract';
import WorkerFactory from '../worker/WorkerFactory';
import chalk from 'chalk';
import { isMainThread } from 'worker_threads';
import path from 'path';
import { version } from '../../package.json';

export default class Bootstrap {
  private static instance: Bootstrap | null = null;
  private workerImplementation: WorkerAbstract | null = null;
  private readonly uiWebSocketServer: UIWebSocketServer;
  private readonly storage: Storage;
  private numberOfChargingStations: number;
  private readonly version: string = version;
  private started: boolean;
  private readonly workerScript: string;

  private constructor() {
    this.started = false;
    this.workerScript = path.join(path.resolve(__dirname, '../'), 'charging-station', 'ChargingStationWorker.js');
    this.initWorkerImplementation();
    this.uiWebSocketServer = new UIWebSocketServer({ port: 80, handleProtocols: UIServiceUtils.handleProtocols });
    this.storage = StorageFactory.getStorage(Configuration.getPerformanceStorage().type, Configuration.getPerformanceStorage().URI, this.logPrefix());
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
        this.numberOfChargingStations = 0;
        await this.storage.open();
        await this.workerImplementation.start();
        this.uiWebSocketServer.start();
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
                await this.workerImplementation.addElement(workerData);
                this.numberOfChargingStations++;
              }
            } catch (error) {
              console.error(chalk.red('Charging station start with template file ' + stationURL.file + ' error '), error);
            }
          }
        } else {
          console.warn(chalk.yellow('No stationTemplateURLs defined in configuration, exiting'));
        }
        if (this.numberOfChargingStations === 0) {
          console.warn(chalk.yellow('No charging station template enabled in configuration, exiting'));
        } else {
          console.log(chalk.green(`Charging stations simulator ${this.version} started with ${this.numberOfChargingStations.toString()} charging station(s) and ${Utils.workerDynamicPoolInUse() ? `${Configuration.getWorkerPoolMinSize().toString()}/` : ''}${this.workerImplementation.size}${Utils.workerPoolInUse() ? `/${Configuration.getWorkerPoolMaxSize().toString()}` : ''} worker(s) concurrently running in '${Configuration.getWorkerProcess()}' mode${this.workerImplementation.maxElementsPerWorker ? ` (${this.workerImplementation.maxElementsPerWorker} charging station(s) per worker)` : ''}`));
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
      await this.workerImplementation.stop();
      this.uiWebSocketServer.stop();
      await this.storage.close();
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
    this.workerImplementation = WorkerFactory.getWorkerImplementation<ChargingStationWorkerData>(this.workerScript, Configuration.getWorkerProcess(),
      {
        startDelay: Configuration.getWorkerStartDelay(),
        poolMaxSize: Configuration.getWorkerPoolMaxSize(),
        poolMinSize: Configuration.getWorkerPoolMinSize(),
        elementsPerWorker: Configuration.getChargingStationsPerWorker(),
        poolOptions: {
          workerChoiceStrategy: Configuration.getWorkerPoolStrategy()
        },
        messageHandler: async (msg: ChargingStationWorkerMessage) => {
          if (msg.id === ChargingStationWorkerMessageEvents.STARTED) {
            this.uiWebSocketServer.uiService.chargingStations.add(msg.data.id);
          } else if (msg.id === ChargingStationWorkerMessageEvents.STOPPED) {
            this.uiWebSocketServer.uiService.chargingStations.delete(msg.data.id);
          } else if (msg.id === ChargingStationWorkerMessageEvents.PERFORMANCE_STATISTICS) {
            await this.storage.storePerformanceStatistics(msg.data);
          }
        }
      });
  }

  private logPrefix(): string {
    return Utils.logPrefix(' Bootstrap |');
  }
}
