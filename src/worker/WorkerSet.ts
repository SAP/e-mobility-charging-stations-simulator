// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import { WorkerMessageEvents, WorkerOptions, WorkerSetElement } from '../types/Worker';

import Utils from '../utils/Utils';
import { Worker } from 'worker_threads';
import WorkerAbstract from './WorkerAbstract';
import { WorkerUtils } from './WorkerUtils';

export default class WorkerSet<T> extends WorkerAbstract {
  public readonly maxElementsPerWorker: number;
  private readonly messageHandler: (message: unknown) => void | Promise<void>;
  private workerSet: Set<WorkerSetElement>;

  /**
   * Create a new `WorkerSet`.
   *
   * @param workerScript
   * @param maxElementsPerWorker
   * @param workerStartDelay
   * @param opts
   */
  constructor(workerScript: string, maxElementsPerWorker = 1, workerStartDelay?: number, opts?: WorkerOptions) {
    super(workerScript, workerStartDelay);
    this.maxElementsPerWorker = maxElementsPerWorker;
    this.messageHandler = opts?.messageHandler ?? (() => { });
    this.workerSet = new Set<WorkerSetElement>();
  }

  get size(): number {
    return this.workerSet.size;
  }

  /**
   *
   * @param elementData
   * @returns
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
    this.getLastWorker().postMessage({ id: WorkerMessageEvents.START_WORKER_ELEMENT, data: elementData });
    this.getLastWorkerSetElement().numberOfWorkerElements++;
  }

  /**
   *
   * @returns
   * @public
   */
  public async start(): Promise<void> {
    this.startWorker();
    // Start worker sequentially to optimize memory at startup
    await Utils.sleep(this.workerStartDelay);
  }

  /**
   *
   * @returns
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
    worker.on('message', (msg) => {
      (async () => {
        await this.messageHandler(msg);
      })().catch(() => {});
    });
    worker.on('error', () => { /* This is intentional */ });
    worker.on('exit', (code) => {
      WorkerUtils.defaultExitHandler(code);
      this.workerSet.delete(this.getWorkerSetElementByWorker(worker));
    });
    this.workerSet.add({ worker, numberOfWorkerElements: 0 });
  }

  private getLastWorkerSetElement(): WorkerSetElement {
    let workerSetElement: WorkerSetElement;
    // eslint-disable-next-line no-empty
    for (workerSetElement of this.workerSet) { /* This is intentional */ }
    return workerSetElement;
  }

  private getLastWorker(): Worker {
    return this.getLastWorkerSetElement().worker;
  }

  private getWorkerSetElementByWorker(worker: Worker): WorkerSetElement {
    let workerSetElt: WorkerSetElement;
    for (const workerSetElement of this.workerSet) {
      if (workerSetElement.worker.threadId === worker.threadId) {
        workerSetElt = workerSetElement;
        break;
      }
    }
    return workerSetElt;
  }
}
