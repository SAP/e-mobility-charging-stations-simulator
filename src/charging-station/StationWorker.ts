import { StationWorkerData, WorkerEvents } from '../types/Worker';
import { isMainThread, parentPort, workerData } from 'worker_threads';

import ChargingStation from './ChargingStation';
import Constants from '../utils/Constants';
import { ThreadWorker } from 'poolifier';
import Utils from '../utils/Utils';

// Conditionally export ThreadWorker instance for pool usage
export let threadWorker;
if (Utils.workerPoolInUse()) {
  threadWorker = new ThreadWorker(startChargingStation, { maxInactiveTime: Constants.WORKER_POOL_MAX_INACTIVE_TIME, async: false });
}

if (!isMainThread) {
  // Add listener to start charging station from main thread
  addListener();
  if (!Utils.isUndefined(workerData)) {
    startChargingStation({ index: workerData.index as number, templateFile: workerData.templateFile as string });
  }
}

function addListener() {
  parentPort.on('message', (message) => {
    if (message.id === WorkerEvents.START_WORKER_ELEMENT) {
      startChargingStation(message.workerData);
    }
  });
}

function startChargingStation(data: StationWorkerData) {
  const station = new ChargingStation(data.index , data.templateFile);
  station.start();
}
