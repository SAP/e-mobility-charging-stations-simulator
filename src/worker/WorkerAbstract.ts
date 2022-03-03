import { WorkerData, WorkerStartOptions } from '../types/Worker';

import Constants from '../utils/Constants';

export default abstract class WorkerAbstract<T extends WorkerData> {
  protected readonly workerScript: string;
  protected readonly workerStartDelay: number;
  protected readonly elementStartDelay: number;
  public abstract readonly size: number;
  public abstract readonly maxElementsPerWorker: number | null;

  /**
   * `WorkerAbstract` constructor.
   *
   * @param workerScript
   * @param workerStartOptions
   */
  constructor(workerScript: string, workerStartOptions: WorkerStartOptions = {
    workerStartDelay: Constants.WORKER_START_DELAY,
    elementStartDelay: Constants.ELEMENT_START_DELAY
  }) {
    this.workerScript = workerScript;
    this.workerStartDelay = workerStartOptions.workerStartDelay;
    this.elementStartDelay = workerStartOptions.elementStartDelay;
  }

  public abstract start(): Promise<void>;
  public abstract stop(): Promise<void>;
  public abstract addElement(elementData: T): Promise<void>;
}
