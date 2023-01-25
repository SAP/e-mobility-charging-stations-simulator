import type { Worker } from 'worker_threads';

import { type ErrorHandler, type ExitHandler, FixedThreadPool } from 'poolifier';

import WorkerAbstract from './WorkerAbstract';
import { WorkerUtils } from './WorkerUtils';
import type { WorkerData, WorkerOptions } from '../types/Worker';
import Utils from '../utils/Utils';

export default class WorkerStaticPool extends WorkerAbstract<WorkerData> {
  private readonly pool: FixedThreadPool<WorkerData>;

  /**
   * Create a new `WorkerStaticPool`.
   *
   * @param workerScript -
   * @param workerOptions -
   */
  constructor(workerScript: string, workerOptions?: WorkerOptions) {
    super(workerScript, workerOptions);
    this.workerOptions.poolOptions.errorHandler = (
      this.workerOptions?.poolOptions?.errorHandler ?? WorkerUtils.defaultErrorHandler
    ).bind(this) as ErrorHandler<Worker>;
    this.workerOptions.poolOptions.exitHandler = (
      this.workerOptions?.poolOptions?.exitHandler ?? WorkerUtils.defaultExitHandler
    ).bind(this) as ExitHandler<Worker>;
    this.workerOptions.poolOptions.messageHandler.bind(this);
    this.pool = new FixedThreadPool(
      this.workerOptions.poolMaxSize,
      this.workerScript,
      this.workerOptions.poolOptions
    );
  }

  get size(): number {
    return this.pool.workers.length;
  }

  get maxElementsPerWorker(): number | undefined {
    return undefined;
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
   * @param elementData -
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
