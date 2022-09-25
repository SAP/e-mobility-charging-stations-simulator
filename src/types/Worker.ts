import type { Worker } from 'worker_threads';

import type { PoolOptions } from 'poolifier';

export enum WorkerProcessType {
  WORKER_SET = 'workerSet',
  DYNAMIC_POOL = 'dynamicPool',
  STATIC_POOL = 'staticPool',
}

export type WorkerOptions = {
  workerStartDelay?: number;
  elementStartDelay?: number;
  poolMaxSize?: number;
  poolMinSize?: number;
  elementsPerWorker?: number;
  poolOptions?: PoolOptions<Worker>;
  messageHandler?: (this: Worker, message: unknown) => void | Promise<void>;
};

export type WorkerData = Record<string, unknown>;

export type WorkerSetElement = {
  worker: Worker;
  numberOfWorkerElements: number;
};

export type WorkerMessage<T extends WorkerData> = {
  id: WorkerMessageEvents;
  data: T;
};

export enum WorkerMessageEvents {
  START_WORKER_ELEMENT = 'startWorkerElement',
}
