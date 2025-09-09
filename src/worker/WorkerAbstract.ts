import type { EventEmitterAsyncResource } from 'node:events'
import type { PoolInfo } from 'poolifier'

import { statSync } from 'node:fs'

import type { SetInfo, WorkerData, WorkerOptions } from './WorkerTypes.js'

export abstract class WorkerAbstract<D extends WorkerData, R extends WorkerData> {
  public abstract readonly emitter: EventEmitterAsyncResource | undefined
  public abstract readonly info: PoolInfo | SetInfo
  public abstract readonly maxElementsPerWorker: number | undefined
  public abstract readonly size: number

  protected readonly workerOptions: WorkerOptions
  protected readonly workerScript: string

  /**
   * `WorkerAbstract` constructor.
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
    const workerScriptStats = statSync(workerScript, { throwIfNoEntry: false })
    if (workerScriptStats == null) {
      throw new Error(`Worker script file does not exist: '${workerScript}'`)
    }
    if (!workerScriptStats.isFile()) {
      throw new Error(`Worker script is not a regular file: '${workerScript}'`)
    }
    this.workerScript = workerScript
    this.workerOptions = workerOptions
  }

  /**
   * Adds a task element to the worker pool/set.
   * @param elementData -
   */
  public abstract addElement (elementData: D): Promise<R>
  /**
   * Starts the worker pool/set.
   */
  public abstract start (): Promise<void> | void
  /**
   * Stops the worker pool/set.
   */
  public abstract stop (): Promise<void>
}
