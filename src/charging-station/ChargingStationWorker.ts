// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import { AsyncResource } from 'node:async_hooks';
import { parentPort } from 'node:worker_threads';

import { ThreadWorker } from 'poolifier';

import { ChargingStation } from './ChargingStation';
import type { ChargingStationWorkerData } from '../types';
import { Configuration } from '../utils';
import { POOL_MAX_INACTIVE_TIME, type WorkerMessage, WorkerMessageEvents } from '../worker';

const moduleName = 'ChargingStationWorker';

/**
 * Creates and starts a charging station instance
 *
 * @param data - workerData
 */
const startChargingStation = (data?: ChargingStationWorkerData): void => {
  new ChargingStation(data!.index, data!.templateFile).start();
};

class ChargingStationWorker extends AsyncResource {
  constructor() {
    super(moduleName);
    // Add message listener to create and start charging station from the main thread
    parentPort?.on('message', (message: WorkerMessage<ChargingStationWorkerData>) => {
      switch (message.event) {
        case WorkerMessageEvents.startWorkerElement:
          try {
            this.runInAsyncScope(
              startChargingStation.bind(this) as (data?: ChargingStationWorkerData) => void,
              this,
              message.data,
            );
            parentPort?.postMessage({
              event: WorkerMessageEvents.startedWorkerElement,
            });
          } catch (error) {
            parentPort?.postMessage({
              event: WorkerMessageEvents.startWorkerElementError,
              data: {
                message: (error as Error).message,
                stack: (error as Error).stack,
              },
            });
          }
          break;
        default:
          throw new Error(
            `Unknown worker event: '${message.event}' received with data: '${JSON.stringify(
              message.data,
              null,
              2,
            )}'`,
          );
      }
    });
  }
}

export let chargingStationWorker: ChargingStationWorker | ThreadWorker<ChargingStationWorkerData>;
if (Configuration.workerPoolInUse()) {
  chargingStationWorker = new ThreadWorker<ChargingStationWorkerData>(startChargingStation, {
    maxInactiveTime: POOL_MAX_INACTIVE_TIME,
  });
} else {
  chargingStationWorker = new ChargingStationWorker();
}
