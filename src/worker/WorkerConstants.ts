import { availableParallelism, type ThreadPoolOptions } from 'poolifier'

import type { WorkerOptions } from './WorkerTypes.js'

import { defaultErrorHandler, defaultExitHandler } from './WorkerUtils.js'

export const EMPTY_FUNCTION = Object.freeze(() => {
  /* This is intentional */
})

export const workerSetVersion = '1.0.1'

export const DEFAULT_ELEMENT_ADD_DELAY = 0
export const DEFAULT_WORKER_START_DELAY = 500
export const DEFAULT_POOL_MIN_SIZE = Math.max(1, Math.floor(availableParallelism() / 2))
export const DEFAULT_POOL_MAX_SIZE = Math.max(
  DEFAULT_POOL_MIN_SIZE,
  Math.round(availableParallelism() * 1.5)
)
export const DEFAULT_ELEMENTS_PER_WORKER = 1

export const DEFAULT_POOL_OPTIONS: Readonly<ThreadPoolOptions> = Object.freeze({
  enableEvents: true,
  errorHandler: defaultErrorHandler,
  exitHandler: defaultExitHandler,
  restartWorkerOnError: true,
  startWorkers: false,
})

export const DEFAULT_WORKER_OPTIONS: Readonly<WorkerOptions> = Object.freeze({
  elementAddDelay: DEFAULT_ELEMENT_ADD_DELAY,
  elementsPerWorker: DEFAULT_ELEMENTS_PER_WORKER,
  poolMaxSize: DEFAULT_POOL_MAX_SIZE,
  poolMinSize: DEFAULT_POOL_MIN_SIZE,
  poolOptions: DEFAULT_POOL_OPTIONS,
  workerStartDelay: DEFAULT_WORKER_START_DELAY,
})
