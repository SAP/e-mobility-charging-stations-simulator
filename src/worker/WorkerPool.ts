import Configuration from '../utils/Configuration';
import Pool from 'worker-threads-pool';
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

  /**
   *
   * @return {Promise<void>}
   * @public
   */
  public async start(): Promise<void> { }

  /**
   *
   * @return {Promise}
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
