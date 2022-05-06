import { JsonType } from './JsonType';
import { PoolOptions } from 'poolifier';
import { Worker } from 'worker_threads';

export enum WorkerProcessType {
  WORKER_SET = 'workerSet',
  DYNAMIC_POOL = 'dynamicPool',
  STATIC_POOL = 'staticPool',
}

export interface WorkerOptions {
  workerStartDelay?: number;
  elementStartDelay?: number;
  poolMaxSize?: number;
  poolMinSize?: number;
  elementsPerWorker?: number;
  poolOptions?: PoolOptions<Worker>;
  messageHandler?: (message: unknown) => void | Promise<void>;
}

export type WorkerData = JsonType;

export interface WorkerSetElement {
  worker: Worker;
  numberOfWorkerElements: number;
}

export interface WorkerMessage<T extends WorkerData> {
  // export interface WorkerMessage<T> {
  id: WorkerMessageEvents;
  data: T;
}

export enum WorkerMessageEvents {
  START_WORKER_ELEMENT = 'startWorkerElement',
  STOP_WORKER_ELEMENT = 'stopWorkerElement',
}
