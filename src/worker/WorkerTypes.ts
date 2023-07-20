import type { Worker } from 'node:worker_threads';

import { type PoolEvent, PoolEvents, type ThreadPoolOptions } from 'poolifier';

export enum WorkerProcessType {
  workerSet = 'workerSet',
  /** @experimental */
  dynamicPool = 'dynamicPool',
  staticPool = 'staticPool',
}

export interface SetInfo {
  version: string;
  type: string;
  worker: string;
  size: number;
  elementsExecuting: number;
  elementsPerWorker: number;
}

export enum WorkerSetEvents {
  error = 'error',
  elementStarted = 'elementStarted',
  elementError = 'elementError',
}

export const WorkerEvents = {
  ...PoolEvents,
  ...WorkerSetEvents,
} as const;
export type WorkerEvents = PoolEvent | WorkerSetEvents;

export interface WorkerOptions {
  workerStartDelay?: number;
  elementStartDelay?: number;
  poolMaxSize: number;
  poolMinSize: number;
  elementsPerWorker?: number;
  poolOptions?: ThreadPoolOptions;
}

export type WorkerData = Record<string, unknown>;

export interface WorkerSetElement {
  worker: Worker;
  numberOfWorkerElements: number;
}

export interface WorkerMessage<T extends WorkerData> {
  event: WorkerMessageEvents;
  data: T;
}

export enum WorkerMessageEvents {
  startWorkerElement = 'startWorkerElement',
  startWorkerElementError = 'startWorkerElementError',
  startedWorkerElement = 'startedWorkerElement',
}
