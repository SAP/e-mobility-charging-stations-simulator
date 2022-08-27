import { Worker, isMainThread } from 'worker_threads';

import type { PoolOptions } from 'poolifier';

import { WorkerData, WorkerOptions, WorkerProcessType } from '../types/Worker';
import type WorkerAbstract from './WorkerAbstract';
import WorkerConstants from './WorkerConstants';
import WorkerDynamicPool from './WorkerDynamicPool';
import WorkerSet from './WorkerSet';
import WorkerStaticPool from './WorkerStaticPool';

export default class WorkerFactory {
  private constructor() {
    // This is intentional
  }

  public static getWorkerImplementation<T extends WorkerData>(
    workerScript: string,
    workerProcessType: WorkerProcessType,
    workerOptions?: WorkerOptions
  ): WorkerAbstract<T> | null {
    if (!isMainThread) {
      throw new Error('Cannot get a worker implementation outside the main thread');
    }
    workerOptions = workerOptions ?? ({} as WorkerOptions);
    workerOptions.workerStartDelay =
      workerOptions?.workerStartDelay ?? WorkerConstants.DEFAULT_WORKER_START_DELAY;
    workerOptions.elementStartDelay =
      workerOptions?.elementStartDelay ?? WorkerConstants.DEFAULT_ELEMENT_START_DELAY;
    workerOptions.poolOptions = workerOptions?.poolOptions ?? ({} as PoolOptions<Worker>);
    workerOptions?.messageHandler &&
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      (workerOptions.poolOptions.messageHandler = workerOptions.messageHandler);
    let workerImplementation: WorkerAbstract<T> = null;
    switch (workerProcessType) {
      case WorkerProcessType.WORKER_SET:
        workerOptions.elementsPerWorker =
          workerOptions?.elementsPerWorker ?? WorkerConstants.DEFAULT_ELEMENTS_PER_WORKER;
        workerImplementation = new WorkerSet(workerScript, workerOptions);
        break;
      case WorkerProcessType.STATIC_POOL:
        workerOptions.poolMaxSize =
          workerOptions?.poolMaxSize ?? WorkerConstants.DEFAULT_POOL_MAX_SIZE;
        workerImplementation = new WorkerStaticPool(workerScript, workerOptions);
        break;
      case WorkerProcessType.DYNAMIC_POOL:
        workerOptions.poolMinSize =
          workerOptions?.poolMinSize ?? WorkerConstants.DEFAULT_POOL_MIN_SIZE;
        workerOptions.poolMaxSize =
          workerOptions?.poolMaxSize ?? WorkerConstants.DEFAULT_POOL_MAX_SIZE;
        workerImplementation = new WorkerDynamicPool(workerScript, workerOptions);
        break;
      default:
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        throw new Error(`Worker implementation type '${workerProcessType}' not found`);
    }
    return workerImplementation;
  }
}
