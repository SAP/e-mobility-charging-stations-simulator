import Configuration from '../utils/Configuration';
import Constants from '../utils/Constants';
import Pool from 'worker-threads-pool';
import Utils from '../utils/Utils';
import WorkerData from '../types/WorkerData';
import Wrk from './Worker';

export default class WorkerPool extends Wrk {
  private pool: Pool;

  /**
   * Create a new `WorkerPool`.
   *
   * @param {string} workerScript
   */
  constructor(workerScript: string) {
    super(workerScript);
    this.pool = UniquePool.getInstance();
  }

  get size(): number {
    return this.pool.size;
  }

  get maxElementsPerWorker(): number {
    return 1;
  }

  /**
   *
   * @return {Promise<void>}
   * @public
   */
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  public async start(): Promise<void> { }

  /**
   *
   * @return {Promise<void>}
   * @public
   */
  public async addElement(elementData: WorkerData): Promise<void> {
    return new Promise((resolve, reject) => {
      this.pool.acquire(this.workerScript, { workerData: elementData }, (err, worker) => {
        if (err) {
          return reject(err);
        }
        worker.once('message', resolve);
        worker.once('error', reject);
      });
      // Start worker sequentially to optimize memory at startup
      void Utils.sleep(Constants.START_WORKER_DELAY);
    });
  }
}

class UniquePool {
  private static instance: Pool;

  private constructor() { }

  public static getInstance(): Pool {
    if (!UniquePool.instance) {
      UniquePool.instance = new Pool({ max: Configuration.getWorkerPoolMaxSize() });
    }
    return UniquePool.instance;
  }
}
