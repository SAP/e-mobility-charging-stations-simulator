import Configuration from '../utils/Configuration';
import Constants from '../utils/Constants';
import { Worker } from 'worker_threads';
import WorkerData from '../types/WorkerData';
import Wrk from './Worker';

export default class WorkerGroup extends Wrk {
  private worker: Worker;
  private lastElementData: WorkerData;
  private maxWorkerElements: number;
  private numWorkerElements: number;

  /**
   * Create a new `WorkerGroup`.
   *
   * @param {string} workerScript
   * @param {WorkerData} workerData
   * @param {number} maxWorkerElements
   */
  constructor(workerScript: string, initialElementData: WorkerData, maxWorkerElements = 1) {
    super(workerScript);
    this.lastElementData = initialElementData;
    this.maxWorkerElements = maxWorkerElements;
    this.numWorkerElements = 0;
  }

  get size(): number {
    return this.numWorkerElements;
  }

  /**
   *
   * @return {void}
   * @public
   */
  public addElement(elementData: WorkerData): void {
    if (Configuration.useWorkerPool()) {
      throw Error('Cannot add a WorkerGroup element: the worker pool is enabled in configuration');
    }
    if (!this.worker) {
      throw Error('Cannot add a WorkerGroup element: worker does not exist');
    }
    if (this.numWorkerElements >= this.maxWorkerElements) {
      throw Error('Cannot add a WorkerGroup element: max number of elements per worker reached');
    }
    this.lastElementData = elementData;
    this.worker.postMessage({ id: Constants.START_WORKER_ELEMENT, workerData: this.lastElementData });
    this.numWorkerElements++;
  }

  /**
   *
   * @return {Promise<Worker>}
   * @public
   */
  public async start(): Promise<void> {
    await this.startWorker();
  }

  /**
   *
   * @return {Promise}
   * @private
   */
  private async startWorker() {
    return new Promise((resolve, reject) => {
      const worker = new Worker(this.workerScript, { workerData: this.lastElementData });
      worker.on('message', resolve);
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });
      this.numWorkerElements++;
      this.worker = worker;
    });
  }
}
