import fs from 'fs';

import type { WorkerData, WorkerOptions } from '../types/Worker';
import WorkerConstants from './WorkerConstants';

export default abstract class WorkerAbstract<T extends WorkerData> {
  protected readonly workerScript: string;
  protected readonly workerOptions: WorkerOptions;
  public abstract readonly size: number;
  public abstract readonly maxElementsPerWorker: number | null;

  /**
   * `WorkerAbstract` constructor.
   *
   * @param workerScript
   * @param workerOptions
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
      messageHandler: () => {
        /* This is intentional */
      },
    }
  ) {
    if (!workerScript) {
      throw new Error('Worker script is not defined');
    }
    if (!fs.existsSync(workerScript)) {
      throw new Error('Worker script file does not exist');
    }
    this.workerScript = workerScript;
    this.workerOptions = workerOptions;
  }

  public abstract start(): Promise<void>;
  public abstract stop(): Promise<void>;
  public abstract addElement(elementData: T): Promise<void>;
}
