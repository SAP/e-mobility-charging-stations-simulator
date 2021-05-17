import { FixedThreadPool, PoolOptions } from 'poolifier';

import Utils from '../utils/Utils';
import { Worker } from 'worker_threads';
import WorkerAbstract from './WorkerAbstract';
import { WorkerData } from '../types/Worker';

export default class WorkerStaticPool<T> extends WorkerAbstract {
  private pool: StaticPool;

  /**
   * Create a new `WorkerStaticPool`.
   *
   * @param {string} workerScript
   * @param {number} numberOfThreads
   * @param {number} startWorkerDelay
   * @param {PoolOptions} opts
   */
  constructor(workerScript: string, numberOfThreads: number, startWorkerDelay?: number, opts?: PoolOptions<Worker>) {
    super(workerScript, startWorkerDelay);
    this.pool = StaticPool.getInstance(numberOfThreads, this.workerScript, opts);
  }

  get size(): number {
    return this.pool.workers.length;
  }

  get maxElementsPerWorker(): number | null {
    return null;
  }

  /**
   *
   * @returns {Promise<void>}
   * @public
   */
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  public async start(): Promise<void> { }

  /**
   *
   * @returns {Promise<void>}
   * @public
   */
  public async stop(): Promise<void> {
    return this.pool.destroy();
  }

  /**
   *
   * @param {T} elementData
   * @returns {Promise<void>}
   * @public
   */
  public async addElement(elementData: T): Promise<void> {
    await this.pool.execute(elementData);
    // Start worker sequentially to optimize memory at startup
    await Utils.sleep(this.workerStartDelay);
  }
}

class StaticPool extends FixedThreadPool<WorkerData> {
  private static instance: StaticPool;

  private constructor(numberOfThreads: number, workerScript: string, opts?: PoolOptions<Worker>) {
    super(numberOfThreads, workerScript, opts);
  }

  public static getInstance(numberOfThreads: number, workerScript: string, opts?: PoolOptions<Worker>): StaticPool {
    if (!StaticPool.instance) {
      opts.exitHandler = opts?.exitHandler ?? ((code) => {
        if (code !== 0) {
          console.error(`Worker stopped with exit code ${code}`);
        }
      });
      StaticPool.instance = new StaticPool(numberOfThreads, workerScript, opts);
    }
    return StaticPool.instance;
  }
}
