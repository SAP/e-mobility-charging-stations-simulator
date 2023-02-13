// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import { parentPort, workerData } from 'worker_threads';

import { ThreadWorker } from 'poolifier';

import { ChargingStation, ChargingStationUtils } from './internal';
import type { ChargingStationWorkerData } from '../types';
import { Utils } from '../utils';
import { WorkerConstants, type WorkerMessage, WorkerMessageEvents } from '../worker';

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
 * @param data - workerData
 */
function startChargingStation(data: ChargingStationWorkerData): void {
  const station = new ChargingStation(data.index, data.templateFile);
  station.start();
}
