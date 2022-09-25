// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import { parentPort, workerData } from 'worker_threads';

import { ThreadWorker } from 'poolifier';

import type { ChargingStationWorkerData } from '../types/ChargingStationWorker';
import { WorkerMessage, WorkerMessageEvents } from '../types/Worker';
import Utils from '../utils/Utils';
import WorkerConstants from '../worker/WorkerConstants';
import ChargingStation from './ChargingStation';
import { ChargingStationUtils } from './ChargingStationUtils';

// Conditionally export ThreadWorker instance for pool usage
export let threadWorker: ThreadWorker;
if (ChargingStationUtils.workerPoolInUse()) {
  threadWorker = new ThreadWorker<ChargingStationWorkerData>(startChargingStation, {
    maxInactiveTime: WorkerConstants.POOL_MAX_INACTIVE_TIME,
    async: false,
  });
} else {
  // Add message listener to start charging station from main thread
  addMessageListener();
  if (Utils.isUndefined(workerData) === false) {
    startChargingStation(workerData as ChargingStationWorkerData);
  }
}

/**
 * Listen messages send by the main thread
 */
function addMessageListener(): void {
  parentPort?.on('message', (message: WorkerMessage<ChargingStationWorkerData>) => {
    if (message.id === WorkerMessageEvents.START_WORKER_ELEMENT) {
      startChargingStation(message.data);
    }
  });
}

/**
 * Create and start a charging station instance
 *
 * @param data workerData
 */
function startChargingStation(data: ChargingStationWorkerData): void {
  const station = new ChargingStation(data.index, data.templateFile);
  station.start();
}
