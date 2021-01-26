import { WorkerOptions, WorkerProcessType } from '../types/Worker';

import Utils from '../utils/Utils';
import WorkerDynamicPool from './WorkerDynamicPool';
import WorkerSet from './WorkerSet';
import WorkerStaticPool from './WorkerStaticPool';
import Wrk from './Wrk';

export default class WorkerFactory {
  public static getWorkerImpl(workerScript: string, workerProcessType: WorkerProcessType, options?: WorkerOptions): Wrk {
    if (Utils.isUndefined(options)) {
      options = {} as WorkerOptions;
    }
    switch (workerProcessType) {
      case WorkerProcessType.WORKER_SET:
        if (Utils.isUndefined(options.elementsPerWorker)) {
          options.elementsPerWorker = 1;
        }
        return new WorkerSet(workerScript, options.elementsPerWorker);
      case WorkerProcessType.STATIC_POOL:
        if (Utils.isUndefined(options.poolMaxSize)) {
          options.elementsPerWorker = 16;
        }
        return new WorkerStaticPool(workerScript, options.poolMaxSize);
      case WorkerProcessType.DYNAMIC_POOL:
        if (Utils.isUndefined(options.poolMinSize)) {
          options.elementsPerWorker = 4;
        }
        if (Utils.isUndefined(options.poolMaxSize)) {
          options.elementsPerWorker = 16;
        }
        return new WorkerDynamicPool(workerScript, options.poolMinSize, options.poolMaxSize);
      default:
        return null;
    }
  }
}
