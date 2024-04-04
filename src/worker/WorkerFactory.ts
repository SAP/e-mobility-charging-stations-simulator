import { isMainThread } from 'node:worker_threads'

import { mergeDeepRight } from 'rambda'

import type { WorkerAbstract } from './WorkerAbstract.js'
import { DEFAULT_WORKER_OPTIONS } from './WorkerConstants.js'
import { WorkerDynamicPool } from './WorkerDynamicPool.js'
import { WorkerFixedPool } from './WorkerFixedPool.js'
import { WorkerSet } from './WorkerSet.js'
import { type WorkerData, type WorkerOptions, WorkerProcessType } from './WorkerTypes.js'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class WorkerFactory {
  private constructor () {
    // This is intentional
  }

  public static getWorkerImplementation<D extends WorkerData, R extends WorkerData>(
    workerScript: string,
    workerProcessType: WorkerProcessType,
    workerOptions?: WorkerOptions
  ): WorkerAbstract<D, R> {
    if (!isMainThread) {
      throw new Error('Cannot get a worker implementation outside the main thread')
    }
    workerOptions = mergeDeepRight<WorkerOptions>(DEFAULT_WORKER_OPTIONS, workerOptions ?? {})
    switch (workerProcessType) {
      case WorkerProcessType.workerSet:
        return new WorkerSet<D, R>(workerScript, workerOptions)
      case WorkerProcessType.fixedPool:
        return new WorkerFixedPool<D, R>(workerScript, workerOptions)
      case WorkerProcessType.dynamicPool:
        return new WorkerDynamicPool<D, R>(workerScript, workerOptions)
      default:
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        throw new Error(`Worker implementation type '${workerProcessType}' not found`)
    }
  }
}
