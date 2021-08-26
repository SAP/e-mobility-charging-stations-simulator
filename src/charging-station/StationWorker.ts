// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import { StationWorkerData, WorkerEvents, WorkerMessage } from '../types/Worker';
import { parentPort, workerData } from 'worker_threads';

import ChargingStation from './ChargingStation';
import Constants from '../utils/Constants';
import { ThreadWorker } from 'poolifier';
import Utils from '../utils/Utils';

// Conditionally export ThreadWorker instance for pool usage
export let threadWorker: ThreadWorker;
if (Utils.workerPoolInUse()) {
  threadWorker = new ThreadWorker<StationWorkerData>(startChargingStation, { maxInactiveTime: Constants.WORKER_POOL_MAX_INACTIVE_TIME, async: false });
} else {
  // Add message listener to start charging station from main thread
  addMessageListener();
  if (!Utils.isUndefined(workerData)) {
    startChargingStation({ index: workerData.index as number, templateFile: workerData.templateFile as string });
  }
}

/**
 * Listen messages send by the main thread
 */
function addMessageListener(): void {
  parentPort?.on('message', (message: WorkerMessage) => {
    if (message.id === WorkerEvents.START_WORKER_ELEMENT) {
      startChargingStation(message.data);
    }
  });
}

/**
 * Create and start a charging station instance
 *
 * @param data workerData
 */
function startChargingStation(data: StationWorkerData): void {
  const station = new ChargingStation(data.index, data.templateFile);
  station.start();
}
