// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import { AsyncResource } from 'node:async_hooks';
import { parentPort, workerData } from 'node:worker_threads';

import { ThreadWorker } from 'poolifier';

import { ChargingStation } from './ChargingStation';
import type { ChargingStationWorkerData } from '../types';
import { Configuration } from '../utils';
import { WorkerConstants, type WorkerMessage, WorkerMessageEvents } from '../worker';

/**
 * Create and start a charging station instance
 *
 * @param data - workerData
 */
const startChargingStation = (data: ChargingStationWorkerData): void => {
  new ChargingStation(data.index, data.templateFile).start();
};

// Conditionally export ThreadWorker instance for pool usage
export let threadWorker: ThreadWorker;
if (Configuration.workerPoolInUse()) {
  threadWorker = new ThreadWorker<ChargingStationWorkerData>(startChargingStation, {
    maxInactiveTime: WorkerConstants.POOL_MAX_INACTIVE_TIME,
  });
} else {
  class ChargingStationWorker extends AsyncResource {
    constructor() {
      super('ChargingStationWorker');
    }

    public run(data: ChargingStationWorkerData): void {
      this.runInAsyncScope(
        startChargingStation.bind(this) as (data: ChargingStationWorkerData) => void,
        this,
        data
      );
    }
  }
  // Add message listener to create and start charging station from the main thread
  parentPort?.on('message', (message: WorkerMessage<ChargingStationWorkerData>) => {
    if (message.id === WorkerMessageEvents.startWorkerElement) {
      new ChargingStationWorker().run(message.data);
    }
  });
  if (workerData !== undefined) {
    new ChargingStationWorker().run(workerData as ChargingStationWorkerData);
  }
}
