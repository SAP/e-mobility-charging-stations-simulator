import Configuration from '../utils/Configuration';
import Pool from 'worker-threads-pool';
import { Worker } from 'worker_threads';
import WorkerData from '../types/WorkerData';

export default class Wrk {
  private _workerScript: string;
  private _workerData: WorkerData;
  private _pool: Pool;
  private _concurrentWorkers: number;

  /**
   * Create a new `Wrk`.
   *
   * @param {string} workerScript
   * @param {WorkerData} workerData
   * @param {number} numConcurrentWorkers
   */
  constructor(workerScript: string, workerData: WorkerData, numConcurrentWorkers: number) {
    this._workerData = workerData;
    this._workerScript = workerScript;
    if (Configuration.useWorkerPool()) {
      this._concurrentWorkers = Configuration.getWorkerPoolSize();
      this._pool = new Pool({ max: Configuration.getWorkerPoolSize() });
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
  async start(): Promise<unknown> {
    if (Configuration.useWorkerPool()) {
      return this._startWorkerWithPool();
    }
    return this._startWorker();
  }

  /**
   *
   * @return {Promise}
   * @private
   */
  private async _startWorkerWithPool() {
    return new Promise((resolve, reject) => {
      this._pool.acquire(this._workerScript, { workerData: this._workerData }, (err, worker) => {
        if (err) {
          return reject(err);
        }
        worker.once('message', resolve);
        worker.once('error', reject);
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
    });
  }
}
