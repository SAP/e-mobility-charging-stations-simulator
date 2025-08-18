// Partial Copyright Jerome Benoit. 2021-2024. All Rights Reserved.

import { parentPort } from 'node:worker_threads'
import { ThreadWorker } from 'poolifier'

import type { ChargingStationInfo, ChargingStationWorkerData } from '../types/index.js'

import { BaseError } from '../exception/index.js'
import { Configuration } from '../utils/index.js'
import { type WorkerDataError, type WorkerMessage, WorkerMessageEvents } from '../worker/index.js'
import { ChargingStation } from './ChargingStation.js'

export let chargingStationWorker: object
if (Configuration.workerPoolInUse()) {
  chargingStationWorker = new ThreadWorker<
    ChargingStationWorkerData,
    ChargingStationInfo | undefined
  >((data?: ChargingStationWorkerData): ChargingStationInfo | undefined => {
    if (data == null) {
      throw new BaseError('Invalid charging station worker data')
    }
    const { index, options, templateFile } = data
    return new ChargingStation(index, templateFile, options).stationInfo
  })
} else {
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class
  class ChargingStationWorker<Data extends ChargingStationWorkerData> {
    constructor () {
      parentPort?.on('message', (message: WorkerMessage<Data>) => {
        const { data, event, uuid } = message
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (data == null || event == null || uuid == null) {
          parentPort?.postMessage({
            data: {
              event,
              message: 'Invalid worker message format',
              name: 'WorkerMessageFormatError',
            },
            event: WorkerMessageEvents.workerElementError,
            uuid,
          } satisfies WorkerMessage<WorkerDataError>)
          return
        }
        switch (event) {
          case WorkerMessageEvents.addWorkerElement:
            try {
              const chargingStation = new ChargingStation(
                data.index,
                data.templateFile,
                data.options
              )
              const stationInfo = chargingStation.stationInfo
              if (stationInfo == null) {
                throw new BaseError('Charging station info is not defined')
              }
              parentPort?.postMessage({
                data: stationInfo,
                event: WorkerMessageEvents.addedWorkerElement,
                uuid,
              } satisfies WorkerMessage<ChargingStationInfo>)
            } catch (error) {
              parentPort?.postMessage({
                data: {
                  event,
                  message: (error as Error).message,
                  name: (error as Error).name,
                  stack: (error as Error).stack,
                },
                event: WorkerMessageEvents.workerElementError,
                uuid,
              } satisfies WorkerMessage<WorkerDataError>)
            }
            break
          default:
            parentPort?.postMessage({
              data: {
                event,
                message: `Unknown worker message event: '${event}'`,
                name: 'WorkerMessageEventError',
              },
              event: WorkerMessageEvents.workerElementError,
              uuid,
            } satisfies WorkerMessage<WorkerDataError>)
        }
      })
    }
  }
  chargingStationWorker = new ChargingStationWorker<ChargingStationWorkerData>()
}
