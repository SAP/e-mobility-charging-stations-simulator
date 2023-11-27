import { isMainThread } from 'node:worker_threads';

import type { WorkerAbstract } from './WorkerAbstract';
import { DEFAULT_WORKER_OPTIONS } from './WorkerConstants';
import { WorkerDynamicPool } from './WorkerDynamicPool';
import { WorkerFixedPool } from './WorkerFixedPool';
import { WorkerSet } from './WorkerSet';
import { type WorkerData, type WorkerOptions, WorkerProcessType } from './WorkerTypes';

export class WorkerFactory {
  private constructor() {
    // This is intentional
  }

  public static getWorkerImplementation<T extends WorkerData>(
    workerScript: string,
    workerProcessType: WorkerProcessType,
    workerOptions?: WorkerOptions,
  ): WorkerAbstract<T> | undefined {
    if (!isMainThread) {
      throw new Error('Cannot get a worker implementation outside the main thread');
    }
    workerOptions = { ...DEFAULT_WORKER_OPTIONS, ...workerOptions };
    let workerImplementation: WorkerAbstract<T>;
    switch (workerProcessType) {
      case WorkerProcessType.workerSet:
        workerImplementation = new WorkerSet(workerScript, workerOptions);
        break;
      case WorkerProcessType.fixedPool:
        workerImplementation = new WorkerFixedPool(workerScript, workerOptions);
        break;
      case WorkerProcessType.dynamicPool:
        workerImplementation = new WorkerDynamicPool(workerScript, workerOptions);
        break;
      default:
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        throw new Error(`Worker implementation type '${workerProcessType}' not found`);
    }
    return workerImplementation;
  }
}
