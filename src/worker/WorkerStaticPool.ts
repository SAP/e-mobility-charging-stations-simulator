import { FixedThreadPool, PoolOptions } from 'poolifier';

import Constants from '../utils/Constants';
import Utils from '../utils/Utils';
import { Worker } from 'worker_threads';
import { WorkerData } from '../types/Worker';
import Wrk from './Wrk';

export default class WorkerStaticPool<T> extends Wrk {
  private pool: StaticPool;

  /**
   * Create a new `WorkerStaticPool`.
   *
   * @param {string} workerScript
   */
  constructor(workerScript: string, numThreads: number) {
    super(workerScript);
    this.pool = StaticPool.getInstance(numThreads, this.workerScript);
  }

  get size(): number {
    return this.pool.workers.length;
  }

  get maxElementsPerWorker(): number {
    return 1;
  }

  /**
   *
   * @return {Promise<void>}
   * @public
   */
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  public async start(): Promise<void> { }

  /**
   *
   * @return {Promise<void>}
   * @public
   */
  public async stop(): Promise<void> {
    return this.pool.destroy();
  }

  /**
   *
   * @return {Promise<void>}
   * @public
   */
  public async addElement(elementData: T): Promise<void> {
    await this.pool.execute(elementData);
    // Start worker sequentially to optimize memory at startup
    await Utils.sleep(Constants.START_WORKER_DELAY);
  }
}

class StaticPool extends FixedThreadPool<WorkerData> {
  private static instance: StaticPool;

  private constructor(numThreads: number, workerScript: string, opts?: PoolOptions<Worker>) {
    super(numThreads, workerScript, opts);
  }

  public static getInstance(numThreads: number, workerScript: string): StaticPool {
    if (!StaticPool.instance) {
      StaticPool.instance = new StaticPool(numThreads, workerScript,
        {
          exitHandler: (code) => {
            if (code !== 0) {
              console.error(`Worker stopped with exit code ${code}`);
            }
          }
        }
      );
    }
    return StaticPool.instance;
  }
}
