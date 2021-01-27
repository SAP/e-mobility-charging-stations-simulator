import Configuration from '../utils/Configuration';
import { StationWorkerData } from '../types/Worker';
import Utils from '../utils/Utils';
import WorkerFactory from '../worker/WorkerFactory';
import Wrk from '../worker/Wrk';
import { isMainThread } from 'worker_threads';

export default class Bootstrap {
  private static instance: Bootstrap;
  private isStarted: boolean;
  private workerScript: string;
  private workerImplementation: Wrk;

  private constructor() {
    this.isStarted = false;
    this.workerScript = './dist/charging-station/StationWorker.js';
  }

  public static getInstance(): Bootstrap {
    if (!Bootstrap.instance) {
      Bootstrap.instance = new Bootstrap();
    }
    return Bootstrap.instance;
  }

  public async start(): Promise<void> {
    if (isMainThread && !this.isStarted) {
      try {
        let numStationsTotal = 0;
        await this.getWorkerImplementation().start();
        // Start ChargingStation object in worker thread
        if (Configuration.getStationTemplateURLs()) {
          for (const stationURL of Configuration.getStationTemplateURLs()) {
            try {
              const nbStations = stationURL.numberOfStations ? stationURL.numberOfStations : 0;
              for (let index = 1; index <= nbStations; index++) {
                const workerData: StationWorkerData = {
                  index,
                  templateFile: stationURL.file
                };
                await this.getWorkerImplementation().addElement(workerData);
                numStationsTotal++;
              }
            } catch (error) {
            // eslint-disable-next-line no-console
              console.error('Charging station start with template file ' + stationURL.file + ' error ', error);
            }
          }
        } else {
          console.log('No stationTemplateURLs defined in configuration, exiting');
        }
        if (numStationsTotal === 0) {
          console.log('No charging station template enabled in configuration, exiting');
        } else {
          console.log(`Charging station simulator started with ${numStationsTotal.toString()} charging station(s) and ${Utils.workerDynamicPoolInUse() ? `${Configuration.getWorkerPoolMinSize().toString()}/` : ''}${this.getWorkerImplementation().size}${Utils.workerPoolInUse() ? `/${Configuration.getWorkerPoolMaxSize().toString()}` : ''} worker(s) concurrently running in '${Configuration.getWorkerProcess()}' mode (${this.getWorkerImplementation().maxElementsPerWorker} charging station(s) per worker)`);
        }
        this.isStarted = true;
      } catch (error) {
      // eslint-disable-next-line no-console
        console.error('Bootstrap start error ', error);
      }
    }
  }

  public async stop(): Promise<void> {
    if (isMainThread && this.isStarted) {
      await this.getWorkerImplementation().stop();
      if (this.getWorkerImplementation()) {
        // Nullify to force worker implementation instance creation
        this.workerImplementation = null;
      }
    }
    this.isStarted = false;
  }

  public async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  private getWorkerImplementation(): Wrk {
    if (!this.workerImplementation) {
      this.workerImplementation = WorkerFactory.getWorkerImpl<StationWorkerData>(this.workerScript, Configuration.getWorkerProcess(), {
        poolMaxSize: Configuration.getWorkerPoolMaxSize(),
        poolMinSize: Configuration.getWorkerPoolMinSize(),
        elementsPerWorker: Configuration.getChargingStationsPerWorker()
      });
    }
    return this.workerImplementation;
  }
}
