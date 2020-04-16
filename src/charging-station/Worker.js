const Configuration = require('../utils/Configuration');
const EventEmitter = require('events');
const {Worker} = require('worker_threads');
const Pool = require('worker-threads-pool');

class Wrk {
  /**
   * Create a new `Wrk`.
   *
   * @param {String} workerScript
   * @param {Object} workerData
   */
  constructor(workerScript, workerData) {
    if (Configuration.useWorkerPool()) {
      this._pool = new Pool({max: Configuration.getWorkerPoolSize()});
    }
    this._workerData = workerData;
    this._workerScript = workerScript;
  }

  /**
   *
   * @return {Promise}
   * @private
   */
  _startWorkerWithPool() {
    return new Promise((resolve, reject) => {
      this._pool.acquire(this._workerScript, {workerData: this._workerData}, (err, worker) => {
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
  _startWorker() {
    return new Promise((resolve, reject) => {
      const worker = new Worker(this._workerScript, {workerData: this._workerData});
      worker.on('message', resolve);
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });
    });
  }

  /**
   *
   * @return {Promise}
   * @public
   */
  start() {
    if (Configuration.useWorkerPool()) {
      if (Configuration.getWorkerPoolSize() > 10) {
        EventEmitter.defaultMaxListeners = Configuration.getWorkerPoolSize() + 1;
      }
      return this._startWorkerWithPool();
    }
    return this._startWorker();
  }
}

module.exports = Wrk;
