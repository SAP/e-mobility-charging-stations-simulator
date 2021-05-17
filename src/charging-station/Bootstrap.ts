import Configuration from '../utils/Configuration';
import { StationWorkerData } from '../types/Worker';
import Utils from '../utils/Utils';
import WorkerAbstract from '../worker/WorkerAbstract';
import WorkerFactory from '../worker/WorkerFactory';
import { isMainThread } from 'worker_threads';
import path from 'path';

export default class Bootstrap {
  private static instance: Bootstrap;
  private started: boolean;
  private workerScript: string;
  private workerImplementationInstance: WorkerAbstract;

  private constructor() {
    this.started = false;
    this.workerScript = path.join(path.resolve(__dirname, '../'), 'charging-station', 'StationWorker.js');
    Configuration.setConfigurationChangeCallback(async () => this.restart());
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
                  templateFile: path.join(path.resolve(__dirname, '../'), 'assets', 'station-templates', path.basename(stationURL.file))
                };
                await this.getWorkerImplementationInstance().addElement(workerData);
                numStationsTotal++;
              }
            } catch (error) {
              console.error('Charging station start with template file ' + stationURL.file + ' error ', error);
            }
          }
        } else {
          console.log('No stationTemplateURLs defined in configuration, exiting');
        }
        if (numStationsTotal === 0) {
          console.log('No charging station template enabled in configuration, exiting');
        } else {
          console.log(`Charging station simulator started with ${numStationsTotal.toString()} charging station(s) and ${Utils.workerDynamicPoolInUse() ? `${Configuration.getWorkerPoolMinSize().toString()}/` : ''}${this.getWorkerImplementationInstance().size}${Utils.workerPoolInUse() ? `/${Configuration.getWorkerPoolMaxSize().toString()}` : ''} worker(s) concurrently running in '${Configuration.getWorkerProcess()}' mode${this.getWorkerImplementationInstance().maxElementsPerWorker ? ` (${this.getWorkerImplementationInstance().maxElementsPerWorker} charging station(s) per worker)` : ''}`);
        }
        this.started = true;
      } catch (error) {
        console.error('Bootstrap start error ', error);
      }
    }
  }

  public async stop(): Promise<void> {
    if (isMainThread && this.started) {
      await this.getWorkerImplementationInstance().stop();
      // Nullify to force worker implementation instance creation
      this.workerImplementationInstance = null;
    }
    this.started = false;
  }

  public async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  private getWorkerImplementationInstance(): WorkerAbstract {
    if (!this.workerImplementationInstance) {
      this.workerImplementationInstance = WorkerFactory.getWorkerImplementation<StationWorkerData>(this.workerScript, Configuration.getWorkerProcess(),
        {
          startDelay: Configuration.getWorkerStartDelay(),
          poolMaxSize: Configuration.getWorkerPoolMaxSize(),
          poolMinSize: Configuration.getWorkerPoolMinSize(),
          elementsPerWorker: Configuration.getChargingStationsPerWorker(),
          poolOptions: {
            workerChoiceStrategy: Configuration.getWorkerPoolStrategy()
          }
        });
    }
    return this.workerImplementationInstance;
  }
}
