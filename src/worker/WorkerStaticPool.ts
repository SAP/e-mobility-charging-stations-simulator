import type { Worker } from 'node:worker_threads';

import { type ErrorHandler, type ExitHandler, FixedThreadPool } from 'poolifier';

import { WorkerAbstract } from './WorkerAbstract';
import type { WorkerData, WorkerOptions } from './WorkerTypes';
import { defaultErrorHandler, defaultExitHandler, sleep } from './WorkerUtils';

export class WorkerStaticPool extends WorkerAbstract<WorkerData> {
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
      this.workerOptions?.poolOptions?.errorHandler ?? defaultErrorHandler
    ).bind(this) as ErrorHandler<Worker>;
    this.workerOptions.poolOptions.exitHandler = (
      this.workerOptions?.poolOptions?.exitHandler ?? defaultExitHandler
    ).bind(this) as ExitHandler<Worker>;
    this.workerOptions.poolOptions.messageHandler.bind(this);
    this.pool = new FixedThreadPool(
      this.workerOptions.poolMaxSize,
      this.workerScript,
      this.workerOptions.poolOptions
    );
  }

  get size(): number {
    return this.pool.workerNodes.length;
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
    this.workerOptions.elementStartDelay > 0 && (await sleep(this.workerOptions.elementStartDelay));
  }
}
