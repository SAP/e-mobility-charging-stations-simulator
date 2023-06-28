// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import { AsyncResource } from 'node:async_hooks';
import { parentPort } from 'node:worker_threads';

import { ThreadWorker } from 'poolifier';

import { ChargingStation } from './ChargingStation';
import type { ChargingStationWorkerData } from '../types';
import { Configuration } from '../utils';
import { WorkerConstants, type WorkerMessage, WorkerMessageEvents } from '../worker';

const moduleName = 'ChargingStationWorker';

/**
 * Create and start a charging station instance
 *
 * @param data - workerData
 */
const startChargingStation = (data: ChargingStationWorkerData): void => {
  new ChargingStation(data.index, data.templateFile).start();
};

class ChargingStationWorker extends AsyncResource {
  constructor() {
    super(moduleName);
    // Add message listener to create and start charging station from the main thread
    parentPort?.on('message', (message: WorkerMessage<ChargingStationWorkerData>) => {
      if (message.id === WorkerMessageEvents.startWorkerElement) {
        this.runInAsyncScope(
          startChargingStation.bind(this) as (data: ChargingStationWorkerData) => void,
          this,
          message.data
        );
      }
    });
  }
}

export let chargingStationWorker: ChargingStationWorker | ThreadWorker<ChargingStationWorkerData>;
if (Configuration.workerPoolInUse()) {
  chargingStationWorker = new ThreadWorker<ChargingStationWorkerData>(startChargingStation, {
    maxInactiveTime: WorkerConstants.POOL_MAX_INACTIVE_TIME,
  });
} else {
  chargingStationWorker = new ChargingStationWorker();
}
