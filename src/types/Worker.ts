import { Worker } from 'worker_threads';

export enum WorkerProcessType {
  WORKER_SET = 'workerSet',
  DYNAMIC_POOL = 'dynamicPool',
  STATIC_POOL = 'staticPool'
}

// FIXME: make it more generic
export interface WorkerData {
  index: number;
  templateFile: string;
}

export interface WorkerSetElement {
  worker: Worker,
  numberOfWorkerElements: number
}

export enum WorkerEvents {
  START_WORKER_ELEMENT = 'startWorkerElement',
}

