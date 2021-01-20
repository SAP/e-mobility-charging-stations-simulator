import { Worker, WorkerOptions } from 'worker_threads';

import Configuration from '../utils/Configuration';
import Pool from 'worker-threads-pool';
import WorkerData from '../types/WorkerData';
import Constants from '../utils/Constants';

export default class Wrk {
  private _workerScript: string;
  private _workerData: WorkerData;
  private _index: number;
  private _concurrentWorkers: number;
  private _worker: Worker;

  /**
   * Create a new `Wrk`.
   *
   * @param {string} workerScript
   * @param {WorkerData} workerData
   * @param {number} numConcurrentWorkers
   */
  constructor(workerScript: string, workerData: WorkerData, numConcurrentWorkers: number) {
    this._workerData = workerData;
    this._index = workerData.index;
    this._workerScript = workerScript;
    if (Configuration.useWorkerPool()) {
      this._concurrentWorkers = Configuration.getWorkerPoolSize();
      WorkerPool.concurrentWorkers = this._concurrentWorkers;
    } else {
      this._concurrentWorkers = numConcurrentWorkers;
    }
  }

  /**
   * @return {number}
   * @public
   */
  public get concurrentWorkers(): number {
    return this._concurrentWorkers;
  }

  /**
   *
   * @return {Promise}
   * @public
   */
  async start(): Promise<Worker> {
    if (Configuration.useWorkerPool()) {
      this._startWorkerWithPool();
    } else {
      this._startWorker();
    }
    return this._worker;
  }

    /**
   *
   * @return {Promise}
   * @public
   */
  async startNewChargingStation(workerData: WorkerData, numConcurrentWorkers: number): Promise<void> {
    this._workerData = workerData;
    this._index = workerData.index;
    this._concurrentWorkers = numConcurrentWorkers;
    this._worker.postMessage({ id : Constants.START_NEW_CHARGING_STATION, workerData: workerData });
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
          reject(new Error(`Worker id ${this._index} stopped with exit code ${code}`));
        }
      });
      this._worker = worker;
    });
  }
}

class WorkerPool {
  public static concurrentWorkers: number;
  private static _instance: Pool;

  private constructor() { }

  public static getInstance(): Pool {
    if (!WorkerPool._instance || (WorkerPool._instance?.size === WorkerPool.concurrentWorkers)) {
      WorkerPool._instance = new Pool({ max: WorkerPool.concurrentWorkers });
    }
    return WorkerPool._instance;
  }

  public static acquire(filename: string, options: WorkerOptions, callback: (error: Error | null, worker: Worker) => void): void {
    WorkerPool.getInstance().acquire(filename, options, callback);
  }
}
