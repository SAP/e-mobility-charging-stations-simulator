import Configuration from './utils/Configuration';
import Constants from './utils/Constants';
import Utils from './utils/Utils';
import WorkerData from './types/WorkerData';
import WorkerGroup from './charging-station/WorkerGroup';
import WorkerPool from './charging-station/WorkerPool';

class Bootstrap {
  static async start() {
    try {
      let numStationsTotal = 0;
      let numConcurrentWorkers = 0;
      const chargingStationsPerWorker = Configuration.getChargingStationsPerWorker();
      let chargingStationsPerWorkerCounter = 0;
      let workerImplementation: WorkerGroup | WorkerPool;
      if (Configuration.useWorkerPool()) {
        workerImplementation = new WorkerPool('./dist/charging-station/StationWorker.js');
        void workerImplementation.start();
      }
      // Start each ChargingStation object in a worker thread
      if (Configuration.getStationTemplateURLs()) {
        for (const stationURL of Configuration.getStationTemplateURLs()) {
          try {
            const nbStations = stationURL.numberOfStations ? stationURL.numberOfStations : 0;
            for (let index = 1; index <= nbStations; index++) {
              const workerData: WorkerData = {
                index,
                templateFile: stationURL.file
              };
              if (Configuration.useWorkerPool()) {
                void workerImplementation.addElement(workerData);
                numConcurrentWorkers = workerImplementation.size;
                // Start worker sequentially to optimize memory at start time
                await Utils.sleep(Constants.START_WORKER_DELAY);
              } else {
                // eslint-disable-next-line no-lonely-if
                if (chargingStationsPerWorkerCounter === 0 || chargingStationsPerWorkerCounter >= chargingStationsPerWorker) {
                  // Start new WorkerGroup with one charging station
                  workerImplementation = new WorkerGroup('./dist/charging-station/StationWorker.js', workerData, chargingStationsPerWorker);
                  void workerImplementation.start();
                  numConcurrentWorkers++;
                  chargingStationsPerWorkerCounter = 1;
                  // Start worker sequentially to optimize memory at start time
                  await Utils.sleep(Constants.START_WORKER_DELAY);
                } else {
                  // Add charging station to existing WorkerGroup
                  void workerImplementation.addElement(workerData);
                  chargingStationsPerWorkerCounter++;
                }
              }
              numStationsTotal++;
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
      } else if (Configuration.useWorkerPool()) {
        console.log('Charging station simulator started with ' + numStationsTotal.toString() + ' charging station(s) and ' + numConcurrentWorkers.toString() + '/' + Configuration.getWorkerPoolMaxSize().toString() + ' worker(s) concurrently running');
      } else {
        console.log('Charging station simulator started with ' + numStationsTotal.toString() + ' charging station(s) and ' + numConcurrentWorkers.toString() + ' worker(s) concurrently running');
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
