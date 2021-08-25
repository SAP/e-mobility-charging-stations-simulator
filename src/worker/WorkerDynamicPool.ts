import { DynamicThreadPool, PoolOptions } from 'poolifier';

import Utils from '../utils/Utils';
import { Worker } from 'worker_threads';
import WorkerAbstract from './WorkerAbstract';
import { WorkerData } from '../types/Worker';
import { WorkerUtils } from './WorkerUtils';

export default class WorkerDynamicPool<T> extends WorkerAbstract {
  private pool: DynamicThreadPool<WorkerData>;

  /**
   * Create a new `WorkerDynamicPool`.
   *
   * @param {string} workerScript
   * @param {number} min
   * @param {number} max
   * @param {number} workerStartDelay
   * @param {PoolOptions} opts
   */
  constructor(workerScript: string, min: number, max: number, workerStartDelay?: number, opts?: PoolOptions<Worker>) {
    super(workerScript, workerStartDelay);
    opts.exitHandler = opts?.exitHandler ?? WorkerUtils.defaultExitHandler;
    this.pool = new DynamicThreadPool<WorkerData>(min, max, this.workerScript, opts);
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
  public async start(): Promise<void> {
    // This is intentional
  }

  /**
   *
   * @returns {Promise<void>}
   * @public
   */
  // eslint-disable-next-line @typescript-eslint/require-await
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
