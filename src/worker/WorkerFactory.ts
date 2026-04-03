import { isMainThread } from 'node:worker_threads'

import type { WorkerAbstract } from './WorkerAbstract.js'

import { DEFAULT_WORKER_OPTIONS } from './WorkerConstants.js'
import { WorkerDynamicPool } from './WorkerDynamicPool.js'
import { WorkerFixedPool } from './WorkerFixedPool.js'
import { WorkerSet } from './WorkerSet.js'
import { type WorkerData, type WorkerOptions, WorkerProcessType } from './WorkerTypes.js'
import { mergeDeepRight } from './WorkerUtils.js'

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
    const resolvedOptions = mergeDeepRight(DEFAULT_WORKER_OPTIONS, workerOptions ?? {})
    switch (workerProcessType) {
      case WorkerProcessType.dynamicPool:
        return new WorkerDynamicPool<D, R>(workerScript, resolvedOptions)
      case WorkerProcessType.fixedPool:
        return new WorkerFixedPool<D, R>(workerScript, resolvedOptions)
      case WorkerProcessType.workerSet:
        return new WorkerSet<D, R>(workerScript, resolvedOptions)
      default:
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        throw new Error(`Worker implementation type '${workerProcessType}' not found`)
    }
  }
}
