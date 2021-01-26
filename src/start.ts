import Configuration from './utils/Configuration';
import { StationWorkerData } from './types/Worker';
import Utils from './utils/Utils';
import WorkerFactory from './worker/WorkerFactory';
import Wrk from './worker/Wrk';

class Bootstrap {
  static async start() {
    try {
      let numStationsTotal = 0;
      const workerImplementation: Wrk = WorkerFactory.getWorkerImpl<StationWorkerData>('./dist/charging-station/StationWorker.js', Configuration.getWorkerProcess(), {
        poolMaxSize: Configuration.getWorkerPoolMaxSize(),
        poolMinSize: Configuration.getWorkerPoolMinSize(),
        elementsPerWorker: Configuration.getChargingStationsPerWorker()
      });
      await workerImplementation.start();
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
              await workerImplementation.addElement(workerData);
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
        console.log(`Charging station simulator started with ${numStationsTotal.toString()} charging station(s) and ${Utils.workerDynamicPoolInUse() ? `${Configuration.getWorkerPoolMinSize().toString()}/` : ''}${workerImplementation.size}${Utils.workerPoolInUse() ? `/${Configuration.getWorkerPoolMaxSize().toString()}` : ''} worker(s) concurrently running in '${Configuration.getWorkerProcess()}' mode (${workerImplementation.maxElementsPerWorker} charging station(s) per worker)`);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Bootstrap start error ', error);
    }
  }
}

Bootstrap.start().catch(
  (error) => {
    console.error(error);
  }
);
