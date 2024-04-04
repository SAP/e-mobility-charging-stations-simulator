import type { EventEmitterAsyncResource } from 'node:events'

import { FixedThreadPool, type PoolInfo } from 'poolifier'

import { WorkerAbstract } from './WorkerAbstract.js'
import type { WorkerData, WorkerOptions } from './WorkerTypes.js'
import { randomizeDelay, sleep } from './WorkerUtils.js'

export class WorkerFixedPool<D extends WorkerData, R extends WorkerData> extends WorkerAbstract<
D,
R
> {
  private readonly pool: FixedThreadPool<D, R>

  /**
   * Creates a new `WorkerFixedPool`.
   *
   * @param workerScript -
   * @param workerOptions -
   */
  constructor (workerScript: string, workerOptions: WorkerOptions) {
    super(workerScript, workerOptions)
    this.pool = new FixedThreadPool<D, R>(
      this.workerOptions.poolMaxSize,
      this.workerScript,
      this.workerOptions.poolOptions
    )
  }

  get info (): PoolInfo {
    return this.pool.info
  }

  get size (): number {
    return this.pool.info.workerNodes
  }

  get maxElementsPerWorker (): number | undefined {
    return undefined
  }

  get emitter (): EventEmitterAsyncResource | undefined {
    return this.pool.emitter
  }

  /** @inheritDoc */
  public start (): void {
    this.pool.start()
  }

  /** @inheritDoc */
  public async stop (): Promise<void> {
    await this.pool.destroy()
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
}
