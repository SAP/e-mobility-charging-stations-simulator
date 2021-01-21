import { Worker, WorkerOptions } from 'worker_threads';

import Configuration from '../utils/Configuration';
import Constants from '../utils/Constants';
import Pool from 'worker-threads-pool';
import WorkerData from '../types/WorkerData';

export default class Wrk {
  private _workerScript: string;
  private _workerData: WorkerData;
  private _worker: Worker;

  /**
   * Create a new `Wrk`.
   *
   * @param {string} workerScript
   * @param {WorkerData} workerData
   */
  constructor(workerScript: string, workerData: WorkerData) {
    this._workerData = workerData;
    this._workerScript = workerScript;
    if (Configuration.useWorkerPool()) {
      WorkerPool.maxConcurrentWorkers = Configuration.getWorkerPoolSize();
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
    // FIXME: also forbid to add an element if the current number of elements > max number of elements
    if (Configuration.useWorkerPool()) {
      return;
    }
    this._workerData = workerData;
    this._worker.postMessage({ id : Constants.START_WORKER_ELEMENT, workerData: workerData });
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
}
