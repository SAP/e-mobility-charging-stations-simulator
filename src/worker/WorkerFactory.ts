import { WorkerOptions, WorkerProcessType } from '../types/Worker';

import Constants from '../utils/Constants';
import WorkerAbstract from './WorkerAbstract';
import WorkerDynamicPool from './WorkerDynamicPool';
import WorkerSet from './WorkerSet';
import WorkerStaticPool from './WorkerStaticPool';
import { isMainThread } from 'worker_threads';

export default class WorkerFactory {
  private static workerImplementation: WorkerAbstract | null;

  private constructor() {}

  public static getWorkerImplementation<T>(workerScript: string, workerProcessType: WorkerProcessType, options?: WorkerOptions, forceInstantiation = false): WorkerAbstract | null {
    if (!isMainThread) {
      throw new Error('Trying to get a worker implementation outside the main thread');
    }
    if (!WorkerFactory.workerImplementation || forceInstantiation) {
      options = options ?? {} as WorkerOptions;
      options.startDelay = options.startDelay ?? Constants.WORKER_START_DELAY;
      WorkerFactory.workerImplementation = null;
      switch (workerProcessType) {
        case WorkerProcessType.WORKER_SET:
          options.elementsPerWorker = options.elementsPerWorker ?? Constants.DEFAULT_CHARGING_STATIONS_PER_WORKER;
          WorkerFactory.workerImplementation = new WorkerSet<T>(workerScript, options.elementsPerWorker, options.startDelay);
          break;
        case WorkerProcessType.STATIC_POOL:
          options.poolMaxSize = options.poolMaxSize ?? Constants.DEFAULT_WORKER_POOL_MAX_SIZE;
          WorkerFactory.workerImplementation = new WorkerStaticPool<T>(workerScript, options.poolMaxSize, options.startDelay, options.poolOptions);
          break;
        case WorkerProcessType.DYNAMIC_POOL:
          options.poolMinSize = options.poolMinSize ?? Constants.DEFAULT_WORKER_POOL_MIN_SIZE;
          options.poolMaxSize = options.poolMaxSize ?? Constants.DEFAULT_WORKER_POOL_MAX_SIZE;
          WorkerFactory.workerImplementation = new WorkerDynamicPool<T>(workerScript, options.poolMinSize, options.poolMaxSize, options.startDelay, options.poolOptions);
          break;
      }
    }
    return WorkerFactory.workerImplementation;
  }
}
