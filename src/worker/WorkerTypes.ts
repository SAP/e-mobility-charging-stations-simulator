import type { Worker } from 'node:worker_threads'

import { type PoolEvent, PoolEvents, type ThreadPoolOptions } from 'poolifier'

export enum WorkerProcessType {
  workerSet = 'workerSet',
  fixedPool = 'fixedPool',
  /** @experimental */
  dynamicPool = 'dynamicPool'
}

export interface SetInfo {
  version: string
  type: string
  worker: string
  started: boolean
  size: number
  elementsExecuting: number
  elementsPerWorker: number
}

export enum WorkerSetEvents {
  started = 'started',
  stopped = 'stopped',
  error = 'error',
  elementAdded = 'elementAdded',
  elementError = 'elementError'
}

export const WorkerEvents = {
  ...PoolEvents,
  ...WorkerSetEvents,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type WorkerEvents = PoolEvent | WorkerSetEvents

export interface WorkerOptions {
  workerStartDelay?: number
  elementAddDelay?: number
  poolMaxSize: number
  poolMinSize: number
  elementsPerWorker?: number
  poolOptions?: ThreadPoolOptions
}

export type WorkerData = Record<string, unknown>

export interface WorkerDataError extends WorkerData {
  event: WorkerMessageEvents
  name: string
  message: string
  stack?: string
}

export interface WorkerSetElement {
  worker: Worker
  numberOfWorkerElements: number
}

export interface WorkerMessage<T extends WorkerData> {
  uuid: `${string}-${string}-${string}-${string}`
  event: WorkerMessageEvents
  data: T
}

export enum WorkerMessageEvents {
  addWorkerElement = 'addWorkerElement',
  addedWorkerElement = 'addedWorkerElement',
  workerElementError = 'workerElementError'
}
