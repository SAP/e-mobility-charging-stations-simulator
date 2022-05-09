// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import {
  ChargingStationData,
  ChargingStationWorkerData,
  ChargingStationWorkerMessageEvents,
  InternalChargingStationWorkerMessage,
} from '../types/ChargingStationWorker';

import Configuration from '../utils/Configuration';
import { StationTemplateUrl } from '../types/ConfigurationData';
import Statistics from '../types/Statistics';
import { Storage } from '../performance/storage/Storage';
import { StorageFactory } from '../performance/storage/StorageFactory';
import { UIServiceUtils } from './ui-websocket-services/UIServiceUtils';
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
  private workerImplementation: WorkerAbstract<ChargingStationWorkerData> | null = null;
  private readonly uiWebSocketServer!: UIWebSocketServer;
  private readonly storage!: Storage;
  private numberOfChargingStations: number;
  private readonly version: string = version;
  private started: boolean;
  private readonly workerScript: string;

  private constructor() {
    this.started = false;
    this.workerScript = path.join(
      path.resolve(__dirname, '../'),
      'charging-station',
      'ChargingStationWorker.js'
    );
    this.initWorkerImplementation();
    Configuration.getUIWebSocketServer().enabled &&
      (this.uiWebSocketServer = new UIWebSocketServer({
        ...Configuration.getUIWebSocketServer().options,
        handleProtocols: UIServiceUtils.handleProtocols,
      }));
    Configuration.getPerformanceStorage().enabled &&
      (this.storage = StorageFactory.getStorage(
        Configuration.getPerformanceStorage().type,
        Configuration.getPerformanceStorage().uri,
        this.logPrefix()
      ));
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
        await this.storage?.open();
        await this.workerImplementation.start();
        this.uiWebSocketServer?.start();
        const stationTemplateUrls = Configuration.getStationTemplateUrls();
        // Start ChargingStation object in worker thread
        if (stationTemplateUrls) {
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
          console.warn(chalk.yellow("No 'stationTemplateUrls' defined in configuration, exiting"));
        }
        if (this.numberOfChargingStations === 0) {
          console.warn(
            chalk.yellow('No charging station template enabled in configuration, exiting')
          );
        } else {
          console.log(
            chalk.green(
              `Charging stations simulator ${
                this.version
              } started with ${this.numberOfChargingStations.toString()} charging station(s) and ${
                Utils.workerDynamicPoolInUse()
                  ? `${Configuration.getWorkerPoolMinSize().toString()}/`
                  : ''
              }${this.workerImplementation.size}${
                Utils.workerPoolInUse() ? `/${Configuration.getWorkerPoolMaxSize().toString()}` : ''
              } worker(s) concurrently running in '${Configuration.getWorkerProcess()}' mode${
                this.workerImplementation.maxElementsPerWorker
                  ? ` (${this.workerImplementation.maxElementsPerWorker} charging station(s) per worker)`
                  : ''
              }`
            )
          );
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
      this.uiWebSocketServer?.stop();
      await this.storage?.close();
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
    this.workerImplementation = WorkerFactory.getWorkerImplementation<ChargingStationWorkerData>(
      this.workerScript,
      Configuration.getWorkerProcess(),
      {
        workerStartDelay: Configuration.getWorkerStartDelay(),
        elementStartDelay: Configuration.getElementStartDelay(),
        poolMaxSize: Configuration.getWorkerPoolMaxSize(),
        poolMinSize: Configuration.getWorkerPoolMinSize(),
        elementsPerWorker: Configuration.getChargingStationsPerWorker(),
        poolOptions: {
          workerChoiceStrategy: Configuration.getWorkerPoolStrategy(),
        },
        messageHandler: (msg: InternalChargingStationWorkerMessage) => {
          const workerEventStarted = (data: ChargingStationData) => {
            console.log('started'); // debug
            // console.log(data); // debug
            this.uiWebSocketServer.chargingStations.set(data.hashId, data.data);
            // this.uiWebSocketServer.chargingStations.add(data.id);
            ++this.numberOfChargingStations;
          };
          const workerEventStopped = (data: ChargingStationData) => {
            console.log('stopped'); // debug
            // console.log(data); // debug
            this.uiWebSocketServer.chargingStations.delete(data.hashId);
            --this.numberOfChargingStations;
          };
          const workerEventPerformanceStatistics = (data: Statistics) => {
            console.log('statistics'); // debug
            // console.log(data); // debug
            (async () => this.storage.storePerformanceStatistics(data))().catch(() => {
              /* This is intentional */
            });
            // (async () => this.storage.storePerformanceStatistics(data))().catch(console.error);
          };

          switch (msg.id) {
            case ChargingStationWorkerMessageEvents.STARTED:
              workerEventStarted(msg.data as ChargingStationData);
              break;
            case ChargingStationWorkerMessageEvents.STOPPED:
              workerEventStopped(msg.data as ChargingStationData);
              break;
            case ChargingStationWorkerMessageEvents.PERFORMANCE_STATISTICS:
              workerEventPerformanceStatistics(msg.data as Statistics);
              break;
            default:
              console.error(msg);
          }
        },
      }
    );
  }

  private async startChargingStation(
    index: number,
    stationTemplateUrl: StationTemplateUrl
  ): Promise<void> {
    const workerData: ChargingStationWorkerData = {
      index,
      templateFile: path.join(
        path.resolve(__dirname, '../'),
        'assets',
        'station-templates',
        path.basename(stationTemplateUrl.file)
      ),
    };
    await this.workerImplementation.addElement(workerData);
  }

  private logPrefix(): string {
    return Utils.logPrefix(' Bootstrap |');
  }
}
