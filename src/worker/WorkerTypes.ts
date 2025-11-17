import type { Worker } from 'node:worker_threads'

import { type PoolEvent, PoolEvents, type ThreadPoolOptions } from 'poolifier'

export enum WorkerMessageEvents {
  addedWorkerElement = 'addedWorkerElement',
  addWorkerElement = 'addWorkerElement',
  workerElementError = 'workerElementError',
}

export enum WorkerProcessType {
  /** @experimental */
  dynamicPool = 'dynamicPool',
  fixedPool = 'fixedPool',
  workerSet = 'workerSet',
}

export enum WorkerSetEvents {
  elementAdded = 'elementAdded',
  elementError = 'elementError',
  error = 'error',
  started = 'started',
  stopped = 'stopped',
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

/**
 * UUIDv4 type representing a standard UUID format
 * cspell:ignore yxxx
 * Pattern: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * where x is any hexadecimal digit and y is one of 8, 9, A, or B
 */
export type UUIDv4 = `${string}-${string}-${string}-${string}-${string}`

export type WorkerData = Record<string, unknown>

export interface WorkerDataError extends WorkerData {
  event: WorkerMessageEvents
  message: string
  name: string
  stack?: string
}

export const WorkerEvents = {
  ...PoolEvents,
  ...WorkerSetEvents,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type WorkerEvents = PoolEvent | WorkerSetEvents

export interface WorkerMessage<T extends WorkerData> {
  data: T
  event: WorkerMessageEvents
  uuid: UUIDv4
}

export interface WorkerOptions extends Record<string, unknown> {
  elementAddDelay?: number
  elementsPerWorker?: number
  poolMaxSize: number
  poolMinSize: number
  poolOptions?: ThreadPoolOptions
  workerStartDelay?: number
}

export interface WorkerSetElement {
  numberOfWorkerElements: number
  worker: Worker
}
