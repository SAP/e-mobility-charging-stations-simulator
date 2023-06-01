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
import { defaultErrorHandler, defaultExitHandler, sleep } from './WorkerUtils';

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

  /** @inheritDoc */
  public async addElement(elementData: WorkerData): Promise<void> {
    if (!this.workerSet) {
      throw new Error("Cannot add a WorkerSet element: workers' set does not exist");
    }
    let lastWorkerSetElement = this.getLastWorkerSetElement();
    if (
      this.workerSet.size === 0 ||
      lastWorkerSetElement.numberOfWorkerElements >= this.workerOptions.elementsPerWorker
    ) {
      this.startWorker();
      // Start worker sequentially to optimize memory at startup
      this.workerOptions.workerStartDelay > 0 && (await sleep(this.workerOptions.workerStartDelay));
      lastWorkerSetElement = this.getLastWorkerSetElement();
    }
    lastWorkerSetElement.worker.postMessage({
      id: WorkerMessageEvents.startWorkerElement,
      data: elementData,
    });
    ++lastWorkerSetElement.numberOfWorkerElements;
    // Start element sequentially to optimize memory at startup
    if (this.workerOptions.elementStartDelay > 0) {
      await sleep(this.workerOptions.elementStartDelay);
    }
  }

  /** @inheritDoc */
  public async start(): Promise<void> {
    this.startWorker();
    // Start worker sequentially to optimize memory at startup
    this.workerOptions.workerStartDelay > 0 && (await sleep(this.workerOptions.workerStartDelay));
  }

  /** @inheritDoc */
  public async stop(): Promise<void> {
    for (const workerSetElement of this.workerSet) {
      await workerSetElement.worker.terminate();
    }
    this.workerSet.clear();
  }

  /**
   * Start a new `Worker`.
   */
  private startWorker(): void {
    const worker = new Worker(this.workerScript);
    worker.on(
      'message',
      (this.workerOptions?.messageHandler ?? WorkerConstants.EMPTY_FUNCTION).bind(
        this
      ) as MessageHandler<Worker>
    );
    worker.on('error', defaultErrorHandler.bind(this) as (err: Error) => void);
    worker.on('error', () => this.startWorker());
    worker.on('exit', defaultExitHandler.bind(this) as (exitCode: number) => void);
    worker.on('exit', () => this.workerSet.delete(this.getWorkerSetElementByWorker(worker)));
    this.workerSet.add({ worker, numberOfWorkerElements: 0 });
  }

  private getLastWorkerSetElement(): WorkerSetElement {
    let workerSetElement: WorkerSetElement;
    for (workerSetElement of this.workerSet) {
      /* This is intentional */
    }
    return workerSetElement;
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
