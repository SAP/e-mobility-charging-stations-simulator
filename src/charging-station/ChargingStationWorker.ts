// Partial Copyright Jerome Benoit. 2021-2024. All Rights Reserved.

import { parentPort } from 'node:worker_threads'

import { ThreadWorker } from 'poolifier'

import { ChargingStation } from './ChargingStation.js'
import { BaseError } from '../exception/index.js'
import type { ChargingStationWorkerData } from '../types/index.js'
import { Configuration } from '../utils/index.js'
import { type WorkerMessage, WorkerMessageEvents } from '../worker/index.js'

/**
 * Creates and starts a charging station instance
 *
 * @param data - data sent to worker
 */
const startChargingStation = (data?: ChargingStationWorkerData): void => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  new ChargingStation(data!.index, data!.templateFile).start()
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class ChargingStationWorker<Data extends ChargingStationWorkerData> {
  constructor () {
    // Add message listener to create and start charging station from the main thread
    parentPort?.on('message', (message: WorkerMessage<Data>) => {
      switch (message.event) {
        case WorkerMessageEvents.startWorkerElement:
          try {
            startChargingStation(message.data)
            parentPort?.postMessage({
              event: WorkerMessageEvents.startedWorkerElement
            })
          } catch (error) {
            parentPort?.postMessage({
              event: WorkerMessageEvents.startWorkerElementError,
              data: {
                name: (error as Error).name,
                message: (error as Error).message,
                stack: (error as Error).stack
              }
            })
          }
          break
        default:
          throw new BaseError(
            `Unknown worker event: '${message.event}' received with data: '${JSON.stringify(
              message.data,
              undefined,
              2
            )}'`
          )
      }
    })
  }
}

export let chargingStationWorker:
| ChargingStationWorker<ChargingStationWorkerData>
| ThreadWorker<ChargingStationWorkerData>
if (Configuration.workerPoolInUse()) {
  chargingStationWorker = new ThreadWorker<ChargingStationWorkerData>(startChargingStation)
} else {
  chargingStationWorker = new ChargingStationWorker<ChargingStationWorkerData>()
}
