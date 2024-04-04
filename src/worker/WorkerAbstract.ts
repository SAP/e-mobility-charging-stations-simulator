import type { EventEmitterAsyncResource } from 'node:events'
import { existsSync } from 'node:fs'

import type { PoolInfo } from 'poolifier'

import type { SetInfo, WorkerData, WorkerOptions } from './WorkerTypes.js'

export abstract class WorkerAbstract<D extends WorkerData, R extends WorkerData> {
  protected readonly workerScript: string
  protected readonly workerOptions: WorkerOptions
  public abstract readonly info: PoolInfo | SetInfo
  public abstract readonly size: number
  public abstract readonly maxElementsPerWorker: number | undefined
  public abstract readonly emitter: EventEmitterAsyncResource | undefined

  /**
   * `WorkerAbstract` constructor.
   *
   * @param workerScript -
   * @param workerOptions -
   */
  constructor (workerScript: string | undefined, workerOptions: WorkerOptions) {
    if (workerScript == null) {
      throw new TypeError('Worker script is not defined')
    }
    if (typeof workerScript !== 'string') {
      throw new TypeError('Worker script must be a string')
    }
    if (workerScript.trim().length === 0) {
      throw new Error('Worker script is an empty string')
    }
    if (!existsSync(workerScript)) {
      throw new Error('Worker script file does not exist')
    }
    this.workerScript = workerScript
    this.workerOptions = workerOptions
  }

  /**
   * Starts the worker pool/set.
   */
  public abstract start (): void | Promise<void>
  /**
   * Stops the worker pool/set.
   */
  public abstract stop (): Promise<void>
  /**
   * Adds a task element to the worker pool/set.
   *
   * @param elementData -
   */
  public abstract addElement (elementData: D): Promise<R>
}
