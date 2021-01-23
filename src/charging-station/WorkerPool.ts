import { Worker, WorkerOptions } from 'worker_threads';

import Pool from 'worker-threads-pool';

export default class WorkerPool {
  public static maxConcurrentWorkers: number;
  private static instance: Pool;

  private constructor() { }

  public static getInstance(): Pool {
    if (!WorkerPool.instance) {
      WorkerPool.instance = new Pool({ max: WorkerPool.maxConcurrentWorkers });
    }
    return WorkerPool.instance;
  }

  public static acquire(filename: string, options: WorkerOptions, callback: (error: Error | null, worker: Worker) => void): void {
    WorkerPool.getInstance().acquire(filename, options, callback);
  }

  public static getPoolSize(): number {
    return WorkerPool.getInstance().size;
  }
}
