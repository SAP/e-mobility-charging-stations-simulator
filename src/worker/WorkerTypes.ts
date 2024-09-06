import type { Worker } from 'node:worker_threads'

import { type PoolEvent, PoolEvents, type ThreadPoolOptions } from 'poolifier'

export enum WorkerProcessType {
  /** @experimental */
  dynamicPool = 'dynamicPool',
  fixedPool = 'fixedPool',
  workerSet = 'workerSet',
}

export interface SetInfo {
  elementsExecuting: number
  elementsPerWorker: number
  size: number
  started: boolean
  type: string
  version: string
  worker: string
}

export enum WorkerSetEvents {
  elementAdded = 'elementAdded',
  elementError = 'elementError',
  error = 'error',
  started = 'started',
  stopped = 'stopped',
}

export const WorkerEvents = {
  ...PoolEvents,
  ...WorkerSetEvents,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type WorkerEvents = PoolEvent | WorkerSetEvents

export interface WorkerOptions {
  elementAddDelay?: number
  elementsPerWorker?: number
  poolMaxSize: number
  poolMinSize: number
  poolOptions?: ThreadPoolOptions
  workerStartDelay?: number
}

export type WorkerData = Record<string, unknown>

export interface WorkerDataError extends WorkerData {
  event: WorkerMessageEvents
  message: string
  name: string
  stack?: string
}

export interface WorkerSetElement {
  numberOfWorkerElements: number
  worker: Worker
}

export interface WorkerMessage<T extends WorkerData> {
  data: T
  event: WorkerMessageEvents
  uuid: `${string}-${string}-${string}-${string}`
}

export enum WorkerMessageEvents {
  addedWorkerElement = 'addedWorkerElement',
  addWorkerElement = 'addWorkerElement',
  workerElementError = 'workerElementError',
}
