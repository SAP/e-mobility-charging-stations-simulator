// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import { Worker } from 'node:worker_threads';

import { WorkerAbstract } from './WorkerAbstract';
import { WorkerConstants } from './WorkerConstants';
import {
  type MessageHandler,
  type WorkerData,
  WorkerMessageEvents,
  type WorkerOptions,
  type WorkerSetElement,
} from './WorkerTypes';
import { WorkerUtils } from './WorkerUtils';

export class WorkerSet extends WorkerAbstract<WorkerData> {
  private readonly workerSet: Set<WorkerSetElement>;

  /**
   * Create a new `WorkerSet`.
   *
   * @param workerScript -
   * @param workerOptions -
   */
  constructor(workerScript: string, workerOptions?: WorkerOptions) {
    super(workerScript, workerOptions);
    this.workerSet = new Set<WorkerSetElement>();
  }

  get size(): number {
    return this.workerSet.size;
  }

  get maxElementsPerWorker(): number | undefined {
    return this.workerOptions.elementsPerWorker;
  }

  /**
   *
   * @param elementData -
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
      await WorkerUtils.sleep(this.workerOptions.elementStartDelay);
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
   * Start a new `Worker`.
   */
  private async startWorker(): Promise<void> {
    const worker = new Worker(this.workerScript);
    worker.on(
      'message',
      (this.workerOptions?.messageHandler ?? WorkerConstants.EMPTY_FUNCTION).bind(
        this
      ) as MessageHandler<Worker>
    );
    worker.on('error', WorkerUtils.defaultErrorHandler.bind(this) as (err: Error) => void);
    worker.on('exit', (code) => {
      WorkerUtils.defaultExitHandler(code);
      this.workerSet.delete(this.getWorkerSetElementByWorker(worker));
    });
    this.workerSet.add({ worker, numberOfWorkerElements: 0 });
    // Start worker sequentially to optimize memory at startup
    this.workerOptions.workerStartDelay > 0 &&
      (await WorkerUtils.sleep(this.workerOptions.workerStartDelay));
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
