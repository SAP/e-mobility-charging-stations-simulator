import Configuration from '../utils/Configuration';
import Pool from 'worker-threads-pool';
import { Worker } from 'worker_threads';

export default class Wrk {
  private _workerData;
  private _workerScript;
  private _pool;
  private _concurrentWorkers: number;

  /**
   * Create a new `Wrk`.
   *
   * @param {String} workerScript
   * @param {Object} workerData
   * @param {Number} numConcurrentWorkers
   */
  constructor(workerScript, workerData, numConcurrentWorkers) {
    this._workerData = workerData;
    this._workerScript = workerScript;
    this._numConcurrentWorkers = numConcurrentWorkers;
    if (Configuration.useWorkerPool()) {
      this._pool = new Pool({ max: Configuration.getWorkerPoolSize() });
    }
  }

  /**
   * @param {Number} numConcurrentWorkers
   * @private
   */
  set _numConcurrentWorkers(numConcurrentWorkers: number) {
    this._concurrentWorkers = numConcurrentWorkers;
  }

  get _numConcurrentWorkers(): number {
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
