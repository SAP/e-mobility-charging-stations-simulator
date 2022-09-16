import { DynamicThreadPool } from 'poolifier';

import type { WorkerData, WorkerOptions } from '../types/Worker';
import Utils from '../utils/Utils';
import WorkerAbstract from './WorkerAbstract';
import { WorkerUtils } from './WorkerUtils';

export default class WorkerDynamicPool extends WorkerAbstract<WorkerData> {
  private readonly pool: DynamicThreadPool<WorkerData>;

  /**
   * Create a new `WorkerDynamicPool`.
   *
   * @param workerScript
   * @param workerOptions
   */
  constructor(workerScript: string, workerOptions?: WorkerOptions) {
    super(workerScript, workerOptions);
    this.workerOptions.poolOptions.errorHandler =
      this.workerOptions?.poolOptions?.errorHandler ?? WorkerUtils.defaultErrorHandler;
    this.workerOptions.poolOptions.exitHandler =
      this.workerOptions?.poolOptions?.exitHandler ?? WorkerUtils.defaultExitHandler;
    this.pool = new DynamicThreadPool<WorkerData>(
      this.workerOptions.poolMinSize,
      this.workerOptions.poolMaxSize,
      this.workerScript,
      this.workerOptions.poolOptions
    );
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
    this.workerOptions.elementStartDelay > 0 &&
      (await Utils.sleep(this.workerOptions.elementStartDelay));
  }
}
