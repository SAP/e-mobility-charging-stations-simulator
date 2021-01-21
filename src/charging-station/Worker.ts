import { Worker, WorkerOptions } from 'worker_threads';

import Configuration from '../utils/Configuration';
import Constants from '../utils/Constants';
import Pool from 'worker-threads-pool';
import WorkerData from '../types/WorkerData';

export default class Wrk {
  private _workerScript: string;
  private _workerData: WorkerData;
  private _worker: Worker;
  private _maxWorkerElements: number;
  private _numWorkerElements: number;

  /**
   * Create a new `Wrk`.
   *
   * @param {string} workerScript
   * @param {WorkerData} workerData
   * @param {number} maxWorkerElements
   */
  constructor(workerScript: string, workerData: WorkerData, maxWorkerElements = 1) {
    this._workerData = workerData;
    this._workerScript = workerScript;
    this._maxWorkerElements = maxWorkerElements;
    this._numWorkerElements = 0;
    if (Configuration.useWorkerPool()) {
      WorkerPool.maxConcurrentWorkers = Configuration.getWorkerPoolMaxSize();
    }
  }

  /**
   *
   * @return {Promise}
   * @public
   */
  async start(): Promise<Worker> {
    if (Configuration.useWorkerPool()) {
      await this._startWorkerWithPool();
    } else {
      await this._startWorker();
    }
    return this._worker;
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
    if (this._numWorkerElements >= this._maxWorkerElements) {
      throw Error('Cannot add Wrk element: max number of elements per worker reached');
    }
    this._workerData = workerData;
    this._worker.postMessage({ id: Constants.START_WORKER_ELEMENT, workerData: workerData });
    this._numWorkerElements++;
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
  private async _startWorkerWithPool() {
    return new Promise((resolve, reject) => {
      WorkerPool.acquire(this._workerScript, { workerData: this._workerData }, (err, worker) => {
        if (err) {
          return reject(err);
        }
        worker.once('message', resolve);
        worker.once('error', reject);
        this._worker = worker;
      });
    });
  }

  /**
   *
   * @return {Promise}
   * @private
   */
  private async _startWorker() {
    return new Promise((resolve, reject) => {
      const worker = new Worker(this._workerScript, { workerData: this._workerData });
      worker.on('message', resolve);
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });
      this._numWorkerElements++;
      this._worker = worker;
    });
  }
}


class WorkerPool {
  public static maxConcurrentWorkers: number;
  private static _instance: Pool;

  private constructor() { }

  public static getInstance(): Pool {
    if (!WorkerPool._instance) {
      WorkerPool._instance = new Pool({ max: WorkerPool.maxConcurrentWorkers });
    }
    return WorkerPool._instance;
  }

  public static acquire(filename: string, options: WorkerOptions, callback: (error: Error | null, worker: Worker) => void): void {
    WorkerPool.getInstance().acquire(filename, options, callback);
  }

  public static getPoolSize(): number {
    return WorkerPool.getInstance().size;
  }
}
