import Constants from '../utils/Constants';
import Utils from '../utils/Utils';
import { Worker } from 'worker_threads';
import WorkerData from '../types/WorkerData';
import { WorkerEvents } from '../types/WorkerEvents';
import Wrk from './Wrk';

export default class WorkerSet extends Wrk {
  public maxElementsPerWorker: number;
  private workers: Set<Worker>;
  private lastWorkerNumberOfElements: number;

  /**
   * Create a new `WorkerSet`.
   *
   * @param {string} workerScript
   * @param {number} maxElementsPerWorker
   */
  constructor(workerScript: string, maxElementsPerWorker = 1) {
    super(workerScript);
    this.workers = new Set<Worker>();
    this.maxElementsPerWorker = maxElementsPerWorker;
    this.lastWorkerNumberOfElements = 0;
  }

  get size(): number {
    return this.workers.size;
  }

  /**
   *
   * @return {Promise<void>}
   * @public
   */
  public async addElement(elementData: WorkerData): Promise<void> {
    if (!this.workers) {
      throw Error('Cannot add a WorkerSet element: workers set does not exist');
    }
    if (this.lastWorkerNumberOfElements >= this.maxElementsPerWorker) {
      void this.startWorker();
      this.lastWorkerNumberOfElements = 0;
      // Start worker sequentially to optimize memory at startup
      void Utils.sleep(Constants.START_WORKER_DELAY);
    }
    this.getLastWorker().postMessage({ id: WorkerEvents.START_WORKER_ELEMENT, workerData: elementData });
    this.lastWorkerNumberOfElements++;
  }

  /**
   *
   * @return {Promise<void>}
   * @public
   */
  public async start(): Promise<void> {
    await this.startWorker();
    // Start worker sequentially to optimize memory at startup
    await Utils.sleep(Constants.START_WORKER_DELAY);
  }

  /**
   *
   * @return {Promise}
   * @private
   */
  private async startWorker() {
    return new Promise((resolve, reject) => {
      const worker = new Worker(this.workerScript);
      worker.on('message', resolve);
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });
      this.workers.add(worker);
    });
  }

  private getLastWorker(): Worker {
    let worker: Worker;
    // eslint-disable-next-line no-empty
    for (worker of this.workers) { }
    return worker;
  }
}
