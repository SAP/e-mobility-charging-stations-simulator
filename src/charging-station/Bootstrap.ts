// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import {
  ChargingStationWorkerData,
  ChargingStationWorkerMessage,
  ChargingStationWorkerMessageEvents,
} from '../types/ChargingStationWorker';

import { AbstractUIServer } from './ui-server/AbstractUIServer';
import { ApplicationProtocol } from '../types/UIProtocol';
import { ChargingStationUtils } from './ChargingStationUtils';
import Configuration from '../utils/Configuration';
import { StationTemplateUrl } from '../types/ConfigurationData';
import Statistics from '../types/Statistics';
import { Storage } from '../performance/storage/Storage';
import { StorageFactory } from '../performance/storage/StorageFactory';
import UIServerFactory from './ui-server/UIServerFactory';
import { UIServiceUtils } from './ui-server/ui-services/UIServiceUtils';
import Utils from '../utils/Utils';
import WorkerAbstract from '../worker/WorkerAbstract';
import WorkerFactory from '../worker/WorkerFactory';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { isMainThread } from 'worker_threads';
import path from 'path';
import { version } from '../../package.json';

export default class Bootstrap {
  private static instance: Bootstrap | null = null;
  private workerImplementation: WorkerAbstract<ChargingStationWorkerData> | null = null;
  private readonly uiServer!: AbstractUIServer;
  private readonly storage!: Storage;
  private numberOfChargingStationTemplates!: number;
  private numberOfChargingStations!: number;
  private readonly version: string = version;
  private started: boolean;
  private readonly workerScript: string;

  private constructor() {
    this.started = false;
    this.workerScript = path.join(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../'),
      'charging-station',
      'ChargingStationWorker' + path.extname(fileURLToPath(import.meta.url))
    );
    this.initialize();
    Configuration.getUIServer().enabled &&
      (this.uiServer = UIServerFactory.getUIServerImplementation(ApplicationProtocol.WS, {
        ...Configuration.getUIServer().options,
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
        console.error(chalk.red('Bootstrap start error '), error);
      }
    } else {
      console.error(chalk.red('Cannot start an already started charging stations simulator'));
    }
  }

  public async stop(): Promise<void> {
    if (isMainThread && this.started) {
      await this.workerImplementation.stop();
      this.workerImplementation = null;
      this.uiServer?.stop();
      await this.storage?.close();
    } else {
      console.error(chalk.red('Trying to stop the charging stations simulator while not started'));
    }
    this.started = false;
  }

  public async restart(): Promise<void> {
    await this.stop();
    this.initialize();
    await this.start();
  }

  private initializeWorkerImplementation(): void {
    !this.workerImplementation &&
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
          messageHandler: async (msg: ChargingStationWorkerMessage) => {
            if (msg.id === ChargingStationWorkerMessageEvents.STARTED) {
              this.uiServer.chargingStations.add(msg.data.id as string);
            } else if (msg.id === ChargingStationWorkerMessageEvents.STOPPED) {
              this.uiServer.chargingStations.delete(msg.data.id as string);
            } else if (msg.id === ChargingStationWorkerMessageEvents.PERFORMANCE_STATISTICS) {
              await this.storage.storePerformanceStatistics(msg.data as unknown as Statistics);
            }
          },
        }
      ));
  }

  private initialize() {
    this.numberOfChargingStations = 0;
    this.numberOfChargingStationTemplates = 0;
    this.initializeWorkerImplementation();
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
        path.basename(stationTemplateUrl.file)
      ),
    };
    await this.workerImplementation.addElement(workerData);
    this.numberOfChargingStations++;
  }

  private logPrefix(): string {
    return Utils.logPrefix(' Bootstrap |');
  }
}
