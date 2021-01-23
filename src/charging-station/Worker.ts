import Configuration from '../utils/Configuration';
import Constants from '../utils/Constants';
import { Worker } from 'worker_threads';
import WorkerData from '../types/WorkerData';
import WorkerPool from './WorkerPool';

export default class Wrk {
  private workerScript: string;
  private workerData: WorkerData;
  private worker: Worker;
  private maxWorkerElements: number;
  private numWorkerElements: number;

  /**
   * Create a new `Wrk`.
   *
   * @param {string} workerScript
   * @param {WorkerData} workerData
   * @param {number} maxWorkerElements
   */
  constructor(workerScript: string, workerData: WorkerData, maxWorkerElements = 1) {
    this.workerData = workerData;
    this.workerScript = workerScript;
    if (Configuration.useWorkerPool()) {
      WorkerPool.maxConcurrentWorkers = Configuration.getWorkerPoolMaxSize();
    } else {
      this.maxWorkerElements = maxWorkerElements;
      this.numWorkerElements = 0;
    }
  }

  /**
   *
   * @return {Promise}
   * @public
   */
  async start(): Promise<Worker> {
    if (Configuration.useWorkerPool()) {
      await this.startWorkerPool();
    } else {
      await this.startWorker();
    }
    return this.worker;
  }

  /**
   *
   * @return {void}
   * @public
   */
  addWorkerElement(workerData: WorkerData): void {
    if (Configuration.useWorkerPool()) {
      throw Error('Cannot add Wrk element if the worker pool is enabled');
    }
    if (this.numWorkerElements >= this.maxWorkerElements) {
      throw Error('Cannot add Wrk element: max number of elements per worker reached');
    }
    this.workerData = workerData;
    this.worker.postMessage({ id: Constants.START_WORKER_ELEMENT, workerData: workerData });
    this.numWorkerElements++;
  }

  /**
   *
   * @return {number}
   * @public
   */
  public getWorkerPoolSize(): number {
    if (Configuration.useWorkerPool()) {
      return WorkerPool.getPoolSize();
    }
  }

  /**
   *
   * @return {Promise}
   * @private
   */
  private async startWorkerPool() {
    return new Promise((resolve, reject) => {
      WorkerPool.acquire(this.workerScript, { workerData: this.workerData }, (err, worker) => {
        if (err) {
          return reject(err);
        }
        worker.once('message', resolve);
        worker.once('error', reject);
        this.worker = worker;
      });
    });
  }

  /**
   *
   * @return {Promise}
   * @private
   */
  private async startWorker() {
    return new Promise((resolve, reject) => {
      const worker = new Worker(this.workerScript, { workerData: this.workerData });
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
