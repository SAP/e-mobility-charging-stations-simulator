import type { EventEmitterAsyncResource } from 'node:events';
import { existsSync } from 'node:fs';

import type { PoolInfo } from 'poolifier';

import type { SetInfo, WorkerData, WorkerOptions } from './WorkerTypes';
import { defaultErrorHandler, defaultExitHandler } from './WorkerUtils';

export abstract class WorkerAbstract<T extends WorkerData> {
  protected readonly workerScript: string;
  protected readonly workerOptions: WorkerOptions;
  public abstract readonly info: PoolInfo | SetInfo;
  public abstract readonly size: number;
  public abstract readonly maxElementsPerWorker: number | undefined;
  public abstract readonly emitter: EventEmitterAsyncResource | undefined;

  /**
   * `WorkerAbstract` constructor.
   *
   * @param workerScript -
   * @param workerOptions -
   */
  constructor(workerScript: string, workerOptions: WorkerOptions) {
    if (workerScript == null) {
      throw new Error('Worker script is not defined');
    }
    if (typeof workerScript === 'string' && workerScript.trim().length === 0) {
      throw new Error('Worker script is empty');
    }
    if (!existsSync(workerScript)) {
      throw new Error('Worker script file does not exist');
    }
    this.workerScript = workerScript;
    this.workerOptions = workerOptions;
    this.workerOptions.poolOptions!.errorHandler =
      this.workerOptions.poolOptions?.errorHandler ?? defaultErrorHandler;
    this.workerOptions.poolOptions!.exitHandler =
      this.workerOptions.poolOptions?.exitHandler ?? defaultExitHandler;
  }

  /**
   * Starts the worker pool/set.
   */
  public abstract start(): Promise<void>;
  /**
   * Stops the worker pool/set.
   */
  public abstract stop(): Promise<void>;
  /**
   * Adds a task element to the worker pool/set.
   *
   * @param elementData -
   */
  public abstract addElement(elementData: T): Promise<void>;
}
