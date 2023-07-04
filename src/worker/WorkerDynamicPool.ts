import { DynamicThreadPool, type PoolEmitter, type PoolInfo } from 'poolifier';

import { WorkerAbstract } from './WorkerAbstract';
import type { WorkerData, WorkerOptions } from './WorkerTypes';
import { sleep } from './WorkerUtils';

export class WorkerDynamicPool extends WorkerAbstract<WorkerData> {
  private readonly pool: DynamicThreadPool<WorkerData>;

  /**
   * Creates a new `WorkerDynamicPool`.
   *
   * @param workerScript -
   * @param workerOptions -
   */
  constructor(workerScript: string, workerOptions?: WorkerOptions) {
    super(workerScript, workerOptions);
    this.pool = new DynamicThreadPool<WorkerData>(
      this.workerOptions.poolMinSize,
      this.workerOptions.poolMaxSize,
      this.workerScript,
      this.workerOptions.poolOptions
    );
  }

  get info(): PoolInfo {
    return this.pool.info;
  }

  get size(): number {
    return this.pool.info.workerNodes;
  }

  get maxElementsPerWorker(): number | undefined {
    return undefined;
  }

  get emitter(): PoolEmitter | undefined {
    return this.pool?.emitter;
  }

  /** @inheritDoc */
  public async start(): Promise<void> {
    // This is intentional
  }

  /** @inheritDoc */
  public async stop(): Promise<void> {
    return this.pool.destroy();
  }

  /** @inheritDoc */
  public async addElement(elementData: WorkerData): Promise<void> {
    await this.pool.execute(elementData);
    // Start element sequentially to optimize memory at startup
    this.workerOptions.elementStartDelay > 0 && (await sleep(this.workerOptions.elementStartDelay));
  }
}
