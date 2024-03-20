// Partial Copyright Jerome Benoit. 2021-2024. All Rights Reserved.

import { parentPort } from 'node:worker_threads'

import { ThreadWorker } from 'poolifier'

import { BaseError } from '../exception/index.js'
import type {
  ChargingStationInfo,
  ChargingStationWorkerData,
  ChargingStationWorkerEventError,
  ChargingStationWorkerMessage
} from '../types/index.js'
import { Configuration } from '../utils/index.js'
import { type WorkerMessage, WorkerMessageEvents } from '../worker/index.js'
import { ChargingStation } from './ChargingStation.js'

export let chargingStationWorker: object
if (Configuration.workerPoolInUse()) {
  chargingStationWorker = new ThreadWorker<
  ChargingStationWorkerData,
  ChargingStationInfo | undefined
  >((data?: ChargingStationWorkerData): ChargingStationInfo | undefined => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, no-new
    return new ChargingStation(data!.index, data!.templateFile, data!.options).stationInfo
  })
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
                message.data.templateFile,
                message.data.options
              )
              parentPort?.postMessage({
                event: WorkerMessageEvents.addedWorkerElement,
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                data: chargingStation.stationInfo!
              } satisfies ChargingStationWorkerMessage<ChargingStationInfo>)
            } catch (error) {
              parentPort?.postMessage({
                event: WorkerMessageEvents.workerElementError,
                data: {
                  event: message.event,
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
