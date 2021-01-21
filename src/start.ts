import Configuration from './utils/Configuration';
import Constants from './utils/Constants';
import Utils from './utils/Utils';
import WorkerData from './types/WorkerData';
import Wrk from './charging-station/Worker';

class Bootstrap {
  static async start() {
    try {
      let numStationsTotal = 0;
      let numConcurrentWorkers = 0;
      const chargingStationsPerWorker = Configuration.getChargingStationsPerWorker();
      let chargingStationsPerWorkerCounter = 0;
      let worker: Wrk;
      // Start each ChargingStation object in a worker thread
      if (Configuration.getStationTemplateURLs()) {
        for (const stationURL of Configuration.getStationTemplateURLs()) {
          try {
            const nbStations = stationURL.numberOfStations ? stationURL.numberOfStations : 0;
            for (let index = 1; index <= nbStations; index++) {
              const workerData = {
                index,
                templateFile: stationURL.file
              } as WorkerData;
              if (Configuration.useWorkerPool()) {
                worker = new Wrk('./dist/charging-station/StationWorker.js', workerData);
                worker.start().catch(() => { });
                numConcurrentWorkers = worker.getPoolSize();
                numStationsTotal = numConcurrentWorkers;
                await Utils.sleep(Constants.START_WORKER_DELAY);
              } else if (!Configuration.useWorkerPool() && (chargingStationsPerWorkerCounter === 0 || chargingStationsPerWorkerCounter === chargingStationsPerWorker)) {
                // Start new Wrk with one charging station
                worker = new Wrk('./dist/charging-station/StationWorker.js', workerData);
                worker.start().catch(() => { });
                numConcurrentWorkers++;
                numStationsTotal++;
                chargingStationsPerWorkerCounter = 1;
                // Start Wrk sequentially to optimize memory at start time
                await Utils.sleep(Constants.START_WORKER_DELAY);
              } else if (!Configuration.useWorkerPool()) {
                // Add charging station to existing Wrk
                worker.addWorkerElement(workerData);
                chargingStationsPerWorkerCounter++;
                numStationsTotal++;
              }
            }
          } catch (error) {
            // eslint-disable-next-line no-console
            console.log('Charging station start with template file ' + stationURL.file + ' error ' + JSON.stringify(error, null, ' '));
          }
        }
      } else {
        console.log('No stationTemplateURLs defined in configuration, exiting');
      }
      if (numStationsTotal === 0) {
        console.log('No charging station template enabled in configuration, exiting');
      } else {
        if (Configuration.useWorkerPool()) {
          console.log('Charging station simulator started with ' + numStationsTotal.toString() + ' charging station(s) and ' + numConcurrentWorkers.toString() + '/' + Configuration.getWorkerMaxPoolSize() + ' worker(s) concurrently running');
        } else {
          console.log('Charging station simulator started with ' + numStationsTotal.toString() + ' charging station(s) and ' + numConcurrentWorkers.toString() + ' worker(s) concurrently running');
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.log('Bootstrap start error ' + JSON.stringify(error, null, ' '));
    }
  }
}

Bootstrap.start().catch(
  (error) => {
    console.error(error);
  }
);
