import { isMainThread } from 'node:worker_threads';

import type { ThreadPoolOptions } from 'poolifier';

import type { WorkerAbstract } from './WorkerAbstract';
import { WorkerConstants } from './WorkerConstants';
import { WorkerDynamicPool } from './WorkerDynamicPool';
import { WorkerSet } from './WorkerSet';
import { WorkerStaticPool } from './WorkerStaticPool';
import { type WorkerData, type WorkerOptions, WorkerProcessType } from './WorkerTypes';

export class WorkerFactory {
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
    workerOptions.poolOptions = workerOptions?.poolOptions ?? ({} as ThreadPoolOptions);
    let workerImplementation: WorkerAbstract<T> | null = null;
    switch (workerProcessType) {
      case WorkerProcessType.workerSet:
        workerOptions.elementsPerWorker =
          workerOptions?.elementsPerWorker ?? WorkerConstants.DEFAULT_ELEMENTS_PER_WORKER;
        workerImplementation = new WorkerSet(workerScript, workerOptions);
        break;
      case WorkerProcessType.staticPool:
        workerOptions.poolMaxSize =
          workerOptions?.poolMaxSize ?? WorkerConstants.DEFAULT_POOL_MAX_SIZE;
        workerImplementation = new WorkerStaticPool(workerScript, workerOptions);
        break;
      case WorkerProcessType.dynamicPool:
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
