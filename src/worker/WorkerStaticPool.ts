import { FixedThreadPool, PoolOptions } from 'poolifier';
import { WorkerData, WorkerStartOptions } from '../types/Worker';

import Utils from '../utils/Utils';
import { Worker } from 'worker_threads';
import WorkerAbstract from './WorkerAbstract';
import { WorkerUtils } from './WorkerUtils';

export default class WorkerStaticPool extends WorkerAbstract<WorkerData> {
  private readonly pool: FixedThreadPool<WorkerData>;

  /**
   * Create a new `WorkerStaticPool`.
   *
   * @param workerScript
   * @param numberOfThreads
   * @param workerStartOptions
   * @param opts
   */
  constructor(workerScript: string, numberOfThreads: number, workerStartOptions?: WorkerStartOptions, opts?: PoolOptions<Worker>) {
    super(workerScript, workerStartOptions);
    opts.exitHandler = opts?.exitHandler ?? WorkerUtils.defaultExitHandler;
    this.pool = new FixedThreadPool(numberOfThreads, this.workerScript, opts);
  }

  get size(): number {
    return this.pool.workers.length;
  }

  get maxElementsPerWorker(): number | null {
    return null;
  }

  /**
   *
   * @returns
   * @public
   */
  public async start(): Promise<void> {
    // This is intentional
  }

  /**
   *
   * @returns
   * @public
   */
  public async stop(): Promise<void> {
    return this.pool.destroy();
  }

  /**
   *
   * @param elementData
   * @returns
   * @public
   */
  public async addElement(elementData: WorkerData): Promise<void> {
    await this.pool.execute(elementData);
    // Start element sequentially to optimize memory at startup
    this.elementStartDelay > 0 && await Utils.sleep(this.elementStartDelay);
  }
}
