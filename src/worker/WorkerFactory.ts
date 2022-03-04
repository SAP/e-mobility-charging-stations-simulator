import { Worker, isMainThread } from 'worker_threads';
import { WorkerData, WorkerOptions, WorkerProcessType } from '../types/Worker';

import Constants from '../utils/Constants';
import { PoolOptions } from 'poolifier';
import type WorkerAbstract from './WorkerAbstract';
import WorkerDynamicPool from './WorkerDynamicPool';
import WorkerSet from './WorkerSet';
import WorkerStaticPool from './WorkerStaticPool';

export default class WorkerFactory {
  private constructor() {
    // This is intentional
  }

  public static getWorkerImplementation<T extends WorkerData>(workerScript: string, workerProcessType: WorkerProcessType, workerOptions?: WorkerOptions): WorkerAbstract<T> | null {
    if (!isMainThread) {
      throw new Error('Trying to get a worker implementation outside the main thread');
    }
    workerOptions = workerOptions ?? {} as WorkerOptions;
    workerOptions.workerStartDelay = workerOptions?.workerStartDelay ?? Constants.WORKER_START_DELAY;
    workerOptions.elementStartDelay = workerOptions?.elementStartDelay ?? Constants.ELEMENT_START_DELAY;
    workerOptions.poolOptions = workerOptions?.poolOptions ?? {} as PoolOptions<Worker>;
    workerOptions?.messageHandler && (workerOptions.poolOptions.messageHandler = workerOptions.messageHandler);
    let workerImplementation: WorkerAbstract<T> = null;
    switch (workerProcessType) {
      case WorkerProcessType.WORKER_SET:
        workerOptions.elementsPerWorker = workerOptions?.elementsPerWorker ?? Constants.DEFAULT_CHARGING_STATIONS_PER_WORKER;
        workerImplementation = new WorkerSet(workerScript, workerOptions);
        break;
      case WorkerProcessType.STATIC_POOL:
        workerOptions.poolMaxSize = workerOptions?.poolMaxSize ?? Constants.DEFAULT_WORKER_POOL_MAX_SIZE;
        workerImplementation = new WorkerStaticPool(workerScript, workerOptions);
        break;
      case WorkerProcessType.DYNAMIC_POOL:
        workerOptions.poolMinSize = workerOptions?.poolMinSize ?? Constants.DEFAULT_WORKER_POOL_MIN_SIZE;
        workerOptions.poolMaxSize = workerOptions?.poolMaxSize ?? Constants.DEFAULT_WORKER_POOL_MAX_SIZE;
        workerImplementation = new WorkerDynamicPool(workerScript, workerOptions);
        break;
      default:
        throw new Error(`Worker implementation type '${workerProcessType}' not found`);
    }
    return workerImplementation;
  }
}
