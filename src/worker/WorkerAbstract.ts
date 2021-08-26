import Constants from '../utils/Constants';
import { WorkerData } from '../types/Worker';

export default abstract class WorkerAbstract {
  protected readonly workerScript: string;
  protected readonly workerStartDelay: number;
  protected readonly messageListener: (message: any) => void;
  public abstract size: number;
  public abstract maxElementsPerWorker: number | null;

  /**
   * `WorkerAbstract` constructor.
   *
   * @param workerScript
   * @param workerStartDelay
   * @param messageListenerCallback
   */
  constructor(workerScript: string, workerStartDelay: number = Constants.WORKER_START_DELAY,
      messageListenerCallback: (message: any) => void = () => { /* This is intentional */ }) {
    this.workerScript = workerScript;
    this.workerStartDelay = workerStartDelay;
    this.messageListener = messageListenerCallback;
  }

  public abstract start(): Promise<void>;
  public abstract stop(): Promise<void>;
  public abstract addElement(elementData: WorkerData): Promise<void>;
}
