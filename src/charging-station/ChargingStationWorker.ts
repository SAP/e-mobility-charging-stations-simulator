// Partial Copyright Jerome Benoit. 2021-2024. All Rights Reserved.

import { parentPort } from 'node:worker_threads'

import { ThreadWorker } from 'poolifier'

import { BaseError } from '../exception/index.js'
import type { ChargingStationInfo, ChargingStationWorkerData } from '../types/index.js'
import { Configuration } from '../utils/index.js'
import { type WorkerDataError, type WorkerMessage, WorkerMessageEvents } from '../worker/index.js'
import { ChargingStation } from './ChargingStation.js'

export let chargingStationWorker: object
if (Configuration.workerPoolInUse()) {
  chargingStationWorker = new ThreadWorker<
  ChargingStationWorkerData,
  ChargingStationInfo | undefined
  >((data?: ChargingStationWorkerData): ChargingStationInfo | undefined => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { index, templateFile, options } = data!
    return new ChargingStation(index, templateFile, options).stationInfo
  })
} else {
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class
  class ChargingStationWorker<Data extends ChargingStationWorkerData> {
    constructor () {
      parentPort?.on('message', (message: WorkerMessage<Data>) => {
        const { uuid, event, data } = message
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (uuid != null) {
          switch (event) {
            case WorkerMessageEvents.addWorkerElement:
              try {
                const chargingStation = new ChargingStation(
                  data.index,
                  data.templateFile,
                  data.options
                )
                parentPort?.postMessage({
                  uuid,
                  event: WorkerMessageEvents.addedWorkerElement,
                  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                  data: chargingStation.stationInfo!
                } satisfies WorkerMessage<ChargingStationInfo>)
              } catch (error) {
                parentPort?.postMessage({
                  uuid,
                  event: WorkerMessageEvents.workerElementError,
                  data: {
                    event,
                    name: (error as Error).name,
                    message: (error as Error).message,
                    stack: (error as Error).stack
                  }
                } satisfies WorkerMessage<WorkerDataError>)
              }
              break
            default:
              throw new BaseError(
                `Unknown worker message event: '${event}' received with data: '${JSON.stringify(
                  data,
                  undefined,
                  2
                )}'`
              )
          }
        }
      })
    }
  }
  chargingStationWorker = new ChargingStationWorker<ChargingStationWorkerData>()
}
