// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import { Worker } from 'worker_threads';

import { WorkerData, WorkerMessageEvents, WorkerOptions, WorkerSetElement } from '../types/Worker';
import Utils from '../utils/Utils';
import WorkerAbstract from './WorkerAbstract';
import { WorkerUtils } from './WorkerUtils';

export default class WorkerSet extends WorkerAbstract<WorkerData> {
  private readonly workerSet: Set<WorkerSetElement>;
  private readonly messageHandler: (message: unknown) => void | Promise<void>;

  /**
   * Create a new `WorkerSet`.
   *
   * @param workerScript
   * @param workerOptions
   */
  constructor(workerScript: string, workerOptions?: WorkerOptions) {
    super(workerScript, workerOptions);
    this.workerSet = new Set<WorkerSetElement>();
    this.messageHandler =
      workerOptions?.messageHandler ??
      (() => {
        /* This is intentional */
      });
  }

  get size(): number {
    return this.workerSet.size;
  }

  get maxElementsPerWorker(): number | null {
    return this.workerOptions.elementsPerWorker;
  }

  /**
   *
   * @param elementData
   * @returns
   * @public
   */
  public async addElement(elementData: WorkerData): Promise<void> {
    if (!this.workerSet) {
      throw new Error("Cannot add a WorkerSet element: workers' set does not exist");
    }
    if (
      this.workerSet.size === 0 ||
      this.getLastWorkerSetElement().numberOfWorkerElements >= this.workerOptions.elementsPerWorker
    ) {
      await this.startWorker();
    }
    this.getLastWorker().postMessage({
      id: WorkerMessageEvents.START_WORKER_ELEMENT,
      data: elementData,
    });
    this.getLastWorkerSetElement().numberOfWorkerElements++;
    // Start element sequentially to optimize memory at startup
    if (this.workerOptions.elementStartDelay > 0) {
      await Utils.sleep(this.workerOptions.elementStartDelay);
    }
  }

  /**
   *
   * @returns
   * @public
   */
  public async start(): Promise<void> {
    await this.startWorker();
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
  private async startWorker(): Promise<void> {
    const worker = new Worker(this.workerScript);
    worker.on('message', (msg) => {
      (async () => {
        await this.messageHandler(msg);
      })().catch(() => {
        /* This is intentional */
      });
    });
    worker.on('error', WorkerUtils.defaultErrorHandler);
    worker.on('exit', (code) => {
      WorkerUtils.defaultExitHandler(code);
      this.workerSet.delete(this.getWorkerSetElementByWorker(worker));
    });
    this.workerSet.add({ worker, numberOfWorkerElements: 0 });
    // Start worker sequentially to optimize memory at startup
    this.workerOptions.workerStartDelay > 0 &&
      (await Utils.sleep(this.workerOptions.workerStartDelay));
  }

  private getLastWorkerSetElement(): WorkerSetElement {
    let workerSetElement: WorkerSetElement;
    for (workerSetElement of this.workerSet) {
      /* This is intentional */
    }
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
