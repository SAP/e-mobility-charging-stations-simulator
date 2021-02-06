import Configuration from '../utils/Configuration';
import { StationWorkerData } from '../types/Worker';
import Utils from '../utils/Utils';
import WorkerFactory from '../worker/WorkerFactory';
import Wrk from '../worker/Wrk';
import { isMainThread } from 'worker_threads';

export default class Bootstrap {
  private static instance: Bootstrap;
  private started: boolean;
  private workerScript: string;
  private workerImplementationInstance: Wrk;

  private constructor() {
    this.started = false;
    this.workerScript = './dist/charging-station/StationWorker.js';
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
        let numStationsTotal = 0;
        await this.getWorkerImplementationInstance().start();
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
                await this.getWorkerImplementationInstance().addElement(workerData);
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
          console.log(`Charging station simulator started with ${numStationsTotal.toString()} charging station(s) and ${Utils.workerDynamicPoolInUse() ? `${Configuration.getWorkerPoolMinSize().toString()}/` : ''}${this.getWorkerImplementationInstance().size}${Utils.workerPoolInUse() ? `/${Configuration.getWorkerPoolMaxSize().toString()}` : ''} worker(s) concurrently running in '${Configuration.getWorkerProcess()}' mode (${this.getWorkerImplementationInstance().maxElementsPerWorker} charging station(s) per worker)`);
        }
        this.started = true;
      } catch (error) {
      // eslint-disable-next-line no-console
        console.error('Bootstrap start error ', error);
      }
    }
  }

  public async stop(): Promise<void> {
    if (isMainThread && this.started) {
      if (this.getWorkerImplementationInstance()) {
        await this.getWorkerImplementationInstance().stop();
        // Nullify to force worker implementation instance creation
        this.workerImplementationInstance = null;
      }
    }
    this.started = false;
  }

  public async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  private getWorkerImplementationInstance(): Wrk {
    if (!this.workerImplementationInstance) {
      this.workerImplementationInstance = WorkerFactory.getWorkerImplementation<StationWorkerData>(this.workerScript, Configuration.getWorkerProcess(), {
        poolMaxSize: Configuration.getWorkerPoolMaxSize(),
        poolMinSize: Configuration.getWorkerPoolMinSize(),
        elementsPerWorker: Configuration.getChargingStationsPerWorker()
      });
    }
    return this.workerImplementationInstance;
  }
}
