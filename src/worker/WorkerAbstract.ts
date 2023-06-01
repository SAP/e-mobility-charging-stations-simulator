import fs from 'node:fs';

import { WorkerConstants } from './WorkerConstants';
import type { WorkerData, WorkerOptions } from './WorkerTypes';

export abstract class WorkerAbstract<T extends WorkerData> {
  protected readonly workerScript: string;
  protected readonly workerOptions: WorkerOptions;
  public abstract readonly size: number;
  public abstract readonly maxElementsPerWorker: number | undefined;

  /**
   * `WorkerAbstract` constructor.
   *
   * @param workerScript -
   * @param workerOptions -
   */
  constructor(
    workerScript: string,
    workerOptions: WorkerOptions = {
      workerStartDelay: WorkerConstants.DEFAULT_WORKER_START_DELAY,
      elementStartDelay: WorkerConstants.DEFAULT_ELEMENT_START_DELAY,
      poolMinSize: WorkerConstants.DEFAULT_POOL_MIN_SIZE,
      poolMaxSize: WorkerConstants.DEFAULT_POOL_MAX_SIZE,
      elementsPerWorker: WorkerConstants.DEFAULT_ELEMENTS_PER_WORKER,
      poolOptions: {},
      messageHandler: WorkerConstants.EMPTY_FUNCTION,
    }
  ) {
    if (workerScript === null || workerScript === undefined) {
      throw new Error('Worker script is not defined');
    }
    if (typeof workerScript === 'string' && workerScript.trim().length === 0) {
      throw new Error('Worker script is empty');
    }
    if (!fs.existsSync(workerScript)) {
      throw new Error('Worker script file does not exist');
    }
    this.workerScript = workerScript;
    this.workerOptions = workerOptions;
  }

  /**
   * Start the worker pool/set.
   */
  public abstract start(): Promise<void>;
  /**
   * Stop the worker pool/set.
   */
  public abstract stop(): Promise<void>;
  /**
   * Add a task element to the worker pool/set.
   *
   * @param elementData -
   */
  public abstract addElement(elementData: T): Promise<void>;
}
