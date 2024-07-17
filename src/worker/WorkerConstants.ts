import { availableParallelism } from 'poolifier'

import type { WorkerOptions } from './WorkerTypes.js'
import { defaultErrorHandler, defaultExitHandler } from './WorkerUtils.js'

export const EMPTY_FUNCTION = Object.freeze(() => {
  /* This is intentional */
})

export const workerSetVersion = '1.0.1'

export const DEFAULT_ELEMENT_ADD_DELAY = 0
export const DEFAULT_WORKER_START_DELAY = 500
export const DEFAULT_POOL_MIN_SIZE = Math.floor(availableParallelism() / 2)
export const DEFAULT_POOL_MAX_SIZE = Math.round(availableParallelism() * 1.5)
export const DEFAULT_ELEMENTS_PER_WORKER = 1

export const DEFAULT_WORKER_OPTIONS: WorkerOptions = Object.freeze({
  workerStartDelay: DEFAULT_WORKER_START_DELAY,
  elementAddDelay: DEFAULT_ELEMENT_ADD_DELAY,
  poolMinSize: DEFAULT_POOL_MIN_SIZE,
  poolMaxSize: DEFAULT_POOL_MAX_SIZE,
  elementsPerWorker: DEFAULT_ELEMENTS_PER_WORKER,
  poolOptions: {
    startWorkers: false,
    enableEvents: true,
    restartWorkerOnError: true,
    errorHandler: defaultErrorHandler,
    exitHandler: defaultExitHandler,
  },
})
