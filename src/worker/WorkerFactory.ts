import { WorkerOptions, WorkerProcessType } from '../types/Worker';

import Utils from '../utils/Utils';
import WorkerDynamicPool from './WorkerDynamicPool';
import WorkerSet from './WorkerSet';
import WorkerStaticPool from './WorkerStaticPool';
import Wrk from './Wrk';
import { isMainThread } from 'worker_threads';

export default class WorkerFactory {
  public static getWorkerImpl<T>(workerScript: string, workerProcessType: WorkerProcessType, options?: WorkerOptions): Wrk {
    if (!isMainThread) {
      throw new Error('Trying to get a worker implementation outside the main thread');
    }
    if (Utils.isUndefined(options)) {
      options = {} as WorkerOptions;
    }
    switch (workerProcessType) {
      case WorkerProcessType.WORKER_SET:
        if (Utils.isUndefined(options.elementsPerWorker)) {
          options.elementsPerWorker = 1;
        }
        return new WorkerSet<T>(workerScript, options.elementsPerWorker);
      case WorkerProcessType.STATIC_POOL:
        if (Utils.isUndefined(options.poolMaxSize)) {
          options.poolMaxSize = 16;
        }
        return new WorkerStaticPool<T>(workerScript, options.poolMaxSize);
      case WorkerProcessType.DYNAMIC_POOL:
        if (Utils.isUndefined(options.poolMinSize)) {
          options.poolMinSize = 4;
        }
        if (Utils.isUndefined(options.poolMaxSize)) {
          options.poolMaxSize = 16;
        }
        return new WorkerDynamicPool<T>(workerScript, options.poolMinSize, options.poolMaxSize);
      default:
        return null;
    }
  }
}
