// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import { WorkerEvents, WorkerSetElement } from '../types/Worker';

import Utils from '../utils/Utils';
import { Worker } from 'worker_threads';
import WorkerAbstract from './WorkerAbstract';
import { WorkerUtils } from './WorkerUtils';

export default class WorkerSet<T> extends WorkerAbstract {
  public maxElementsPerWorker: number;
  private workerSet: Set<WorkerSetElement>;

  /**
   * Create a new `WorkerSet`.
   *
   * @param {string} workerScript
   * @param {number} maxElementsPerWorker
   * @param {number} workerStartDelay
   */
  constructor(workerScript: string, maxElementsPerWorker = 1, workerStartDelay?: number) {
    super(workerScript, workerStartDelay);
    this.workerSet = new Set<WorkerSetElement>();
    this.maxElementsPerWorker = maxElementsPerWorker;
  }

  get size(): number {
    return this.workerSet.size;
  }

  /**
   *
   * @param {T} elementData
   * @returns {Promise<void>}
   * @public
   */
  public async addElement(elementData: T): Promise<void> {
    if (!this.workerSet) {
      throw new Error('Cannot add a WorkerSet element: workers\' set does not exist');
    }
    if (this.getLastWorkerSetElement().numberOfWorkerElements >= this.maxElementsPerWorker) {
      this.startWorker();
      // Start worker sequentially to optimize memory at startup
      await Utils.sleep(this.workerStartDelay);
    }
    this.getLastWorker().postMessage({ id: WorkerEvents.START_WORKER_ELEMENT, workerData: elementData });
    this.getLastWorkerSetElement().numberOfWorkerElements++;
  }

  /**
   *
   * @returns {Promise<void>}
   * @public
   */
  public async start(): Promise<void> {
    this.startWorker();
    // Start worker sequentially to optimize memory at startup
    await Utils.sleep(this.workerStartDelay);
  }

  /**
   *
   * @returns {Promise<void>}
   * @public
   */
  public async stop(): Promise<void> {
    for (const workerSetElement of this.workerSet) {
      await workerSetElement.worker.terminate();
    }
    this.workerSet.clear();
  }

  /**
   *
   * @private
   */
  private startWorker(): void {
    const worker = new Worker(this.workerScript);
    worker.on('message', () => { });
    worker.on('error', () => { });
    worker.on('exit', (code) => {
      WorkerUtils.defaultExitHandler(code);
      this.workerSet.delete(this.getWorkerSetElementByWorker(worker));
    });
    this.workerSet.add({ worker, numberOfWorkerElements: 0 });
  }

  private getLastWorkerSetElement(): WorkerSetElement {
    let workerSetElement: WorkerSetElement;
    // eslint-disable-next-line no-empty
    for (workerSetElement of this.workerSet) { }
    return workerSetElement;
  }

  private getLastWorker(): Worker {
    return this.getLastWorkerSetElement().worker;
  }

  private getWorkerSetElementByWorker(worker: Worker): WorkerSetElement {
    let workerSetElt: WorkerSetElement;
    this.workerSet.forEach((workerSetElement) => {
      if (workerSetElement.worker.threadId === worker.threadId) {
        workerSetElt = workerSetElement;
      }
    });
    return workerSetElt;
  }
}
