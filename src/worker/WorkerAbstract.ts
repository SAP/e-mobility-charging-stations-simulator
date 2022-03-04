import { WorkerData, WorkerOptions } from '../types/Worker';

import Constants from '../utils/Constants';

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
  constructor(workerScript: string, workerOptions: WorkerOptions = {
    workerStartDelay: Constants.WORKER_START_DELAY,
    elementStartDelay: Constants.ELEMENT_START_DELAY,
    poolMinSize: Constants.DEFAULT_WORKER_POOL_MIN_SIZE,
    poolMaxSize: Constants.DEFAULT_WORKER_POOL_MAX_SIZE,
    elementsPerWorker: Constants.DEFAULT_CHARGING_STATIONS_PER_WORKER,
    poolOptions: {},
    messageHandler: () => { /* This is intentional */ }
  }) {
    this.workerScript = workerScript;
    this.workerOptions = workerOptions;
  }

  public abstract start(): Promise<void>;
  public abstract stop(): Promise<void>;
  public abstract addElement(elementData: T): Promise<void>;
}
