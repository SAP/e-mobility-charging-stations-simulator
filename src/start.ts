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
      let worker: Wrk;
      const chargingStationsPerWorker = Configuration.getChargingStationsPerWorker();
      let counter = 0;
      // Start each ChargingStation object in a worker thread
      if (Configuration.getStationTemplateURLs()) {
        for await (const stationURL of Configuration.getStationTemplateURLs()) {
          try {
            const nbStations = stationURL.numberOfStations ? stationURL.numberOfStations : 0;
            numStationsTotal += nbStations;
            for (let index = 1; index <= nbStations; index++) {
              const workerData = {
                index,
                templateFile: stationURL.file
              } as WorkerData;
              if (counter === 0 || counter === chargingStationsPerWorker) {
                // Start new worker with one charging station
                worker = new Wrk('./dist/charging-station/StationWorker.js', workerData, numStationsTotal);
                worker.start().catch(() => { });
                counter = 0;
                // Start workers sequentially to optimize memory at start time
                await Utils.sleep(Constants.START_WORKER_DELAY);
              } else {
                // Add charging station to existing Worker
                worker.addChargingStation(workerData, numStationsTotal);
              }
              counter++;
              numConcurrentWorkers = worker.concurrentWorkers;
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
        console.log('Charging station simulator started with ' + numStationsTotal.toString() + ' charging station(s) of ' + numConcurrentWorkers.toString() + ' concurrently running');
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.log('Bootstrap start error ' + JSON.stringify(error, null, ' '));
    }
  }
}

Bootstrap.start();
