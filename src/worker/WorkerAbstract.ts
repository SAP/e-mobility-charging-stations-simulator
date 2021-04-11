import { WorkerData } from '../types/Worker';

export default abstract class WorkerAbstract {
  protected workerScript: string;
  public abstract size: number;
  public abstract maxElementsPerWorker: number;

  /**
   * `WorkerAbstract` constructor.
   *
   * @param {string} workerScript
   */
  constructor(workerScript: string) {
    this.workerScript = workerScript;
  }

  public abstract start(): Promise<void>;
  public abstract stop(): Promise<void>;
  public abstract addElement(elementData: WorkerData): Promise<void>;
}
