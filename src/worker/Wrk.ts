import { WorkerData } from '../types/Worker';

export default abstract class Wrk {
  protected workerScript: string;
  public abstract size: number;
  public abstract maxElementsPerWorker: number;

  /**
   * Create a new `Wrk`.
   *
   * @param {string} workerScript
   */
  constructor(workerScript: string) {
    this.workerScript = workerScript;
  }

  public abstract start(): Promise<void>;
  public abstract addElement(elementData: WorkerData): Promise<void>;
}
