// Partial Copyright Jerome Benoit. 2021-2024. All Rights Reserved.

import { parentPort } from 'node:worker_threads'

import { ThreadWorker } from 'poolifier'

import { ChargingStation } from './ChargingStation.js'
import { BaseError } from '../exception/index.js'
import type {
  ChargingStationData,
  ChargingStationWorkerData,
  ChargingStationWorkerEventError,
  ChargingStationWorkerMessage
} from '../types/index.js'
import { Configuration, buildChargingStationDataPayload } from '../utils/index.js'
import { type WorkerMessage, WorkerMessageEvents } from '../worker/index.js'

export let chargingStationWorker: object
if (Configuration.workerPoolInUse()) {
  chargingStationWorker = new ThreadWorker<ChargingStationWorkerData>(
    (data?: ChargingStationWorkerData): void => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, no-new
      new ChargingStation(data!.index, data!.templateFile)
    }
  )
} else {
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class
  class ChargingStationWorker<Data extends ChargingStationWorkerData> {
    constructor () {
      parentPort?.on('message', (message: WorkerMessage<Data>) => {
        switch (message.event) {
          case WorkerMessageEvents.addWorkerElement:
            try {
              const chargingStation = new ChargingStation(
                message.data.index,
                message.data.templateFile
              )
              parentPort?.postMessage({
                event: WorkerMessageEvents.addedWorkerElement,
                data: buildChargingStationDataPayload(chargingStation)
              } satisfies ChargingStationWorkerMessage<ChargingStationData>)
            } catch (error) {
              parentPort?.postMessage({
                event: WorkerMessageEvents.workerElementError,
                data: {
                  event: WorkerMessageEvents.addWorkerElement,
                  name: (error as Error).name,
                  message: (error as Error).message,
                  stack: (error as Error).stack
                }
              } satisfies ChargingStationWorkerMessage<ChargingStationWorkerEventError>)
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
  chargingStationWorker = new ChargingStationWorker<ChargingStationWorkerData>()
}
