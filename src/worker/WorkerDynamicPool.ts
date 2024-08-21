import type { EventEmitterAsyncResource } from 'node:events'

import { DynamicThreadPool, type PoolInfo } from 'poolifier'

import type { WorkerData, WorkerOptions } from './WorkerTypes.js'

import { WorkerAbstract } from './WorkerAbstract.js'
import { randomizeDelay, sleep } from './WorkerUtils.js'

export class WorkerDynamicPool<D extends WorkerData, R extends WorkerData> extends WorkerAbstract<
  D,
  R
> {
  private readonly pool: DynamicThreadPool<D, R>

  /**
   * Creates a new `WorkerDynamicPool`.
   * @param workerScript -
   * @param workerOptions -
   */
  constructor (workerScript: string, workerOptions: WorkerOptions) {
    super(workerScript, workerOptions)
    this.pool = new DynamicThreadPool<D, R>(
      this.workerOptions.poolMinSize,
      this.workerOptions.poolMaxSize,
      this.workerScript,
      this.workerOptions.poolOptions
    )
  }

  /** @inheritDoc */
  public async addElement (elementData: D): Promise<R> {
    const response = await this.pool.execute(elementData)
    // Start element sequentially to optimize memory at startup
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.workerOptions.elementAddDelay! > 0 &&
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      (await sleep(randomizeDelay(this.workerOptions.elementAddDelay!)))
    return response
  }

  /** @inheritDoc */
  public start (): void {
    this.pool.start()
  }

  /** @inheritDoc */
  public async stop (): Promise<void> {
    await this.pool.destroy()
  }

  get emitter (): EventEmitterAsyncResource | undefined {
    return this.pool.emitter
  }

  get info (): PoolInfo {
    return this.pool.info
  }

  get maxElementsPerWorker (): number | undefined {
    return undefined
  }

  get size (): number {
    return this.pool.info.workerNodes
  }
}
