// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import { parentPort } from 'node:worker_threads';

import { ThreadWorker } from 'poolifier';

import { ChargingStation } from './ChargingStation';
import { BaseError } from '../exception';
import type { ChargingStationWorkerData } from '../types';
import { Configuration } from '../utils';
import { type WorkerMessage, WorkerMessageEvents } from '../worker';

/**
 * Creates and starts a charging station instance
 *
 * @param data - data sent to worker
 */
const startChargingStation = (data?: ChargingStationWorkerData): void => {
  new ChargingStation(data!.index, data!.templateFile).start();
};

class ChargingStationWorker<Data extends ChargingStationWorkerData> {
  constructor() {
    // Add message listener to create and start charging station from the main thread
    parentPort?.on('message', (message: WorkerMessage<Data>) => {
      switch (message.event) {
        case WorkerMessageEvents.startWorkerElement:
          try {
            startChargingStation(message.data);
            parentPort?.postMessage({
              event: WorkerMessageEvents.startedWorkerElement,
            });
          } catch (error) {
            parentPort?.postMessage({
              event: WorkerMessageEvents.startWorkerElementError,
              data: {
                name: (error as Error).name,
                message: (error as Error).message,
                stack: (error as Error).stack,
              },
            });
          }
          break;
        default:
          throw new BaseError(
            `Unknown worker event: '${message.event}' received with data: '${JSON.stringify(
              message.data,
              undefined,
              2,
            )}'`,
          );
      }
    });
  }
}

export let chargingStationWorker:
  | ChargingStationWorker<ChargingStationWorkerData>
  | ThreadWorker<ChargingStationWorkerData>;
if (Configuration.workerPoolInUse()) {
  chargingStationWorker = new ThreadWorker<ChargingStationWorkerData>(startChargingStation);
} else {
  chargingStationWorker = new ChargingStationWorker<ChargingStationWorkerData>();
}
