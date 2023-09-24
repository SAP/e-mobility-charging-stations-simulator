import type { EventEmitter } from 'node:events';

import { DynamicThreadPool, type PoolInfo } from 'poolifier';

import { WorkerAbstract } from './WorkerAbstract';
import type { WorkerData, WorkerOptions } from './WorkerTypes';
import { randomizeDelay, sleep } from './WorkerUtils';

export class WorkerDynamicPool extends WorkerAbstract<WorkerData> {
  private readonly pool: DynamicThreadPool<WorkerData>;

  /**
   * Creates a new `WorkerDynamicPool`.
   *
   * @param workerScript -
   * @param workerOptions -
   */
  constructor(workerScript: string, workerOptions: WorkerOptions) {
    super(workerScript, workerOptions);
    this.pool = new DynamicThreadPool<WorkerData>(
      this.workerOptions.poolMinSize,
      this.workerOptions.poolMaxSize,
      this.workerScript,
      this.workerOptions.poolOptions,
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

  get emitter(): EventEmitter | undefined {
    return this.pool?.emitter as EventEmitter;
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
    this.workerOptions.elementStartDelay! > 0 &&
      (await sleep(randomizeDelay(this.workerOptions.elementStartDelay!)));
  }
}
