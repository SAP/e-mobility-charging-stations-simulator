// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import EventEmitterAsyncResource from 'node:events';
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
  public readonly emitter: EventEmitterAsyncResource;
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
    this.emitter = new EventEmitterAsyncResource();
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
    const workerSetElement = await this.getWorkerSetElement();
    workerSetElement.worker.postMessage({
      id: WorkerMessageEvents.startWorkerElement,
      data: elementData,
    });
    ++workerSetElement.numberOfWorkerElements;
    // Add element sequentially to optimize memory at startup
    if (this.workerOptions.elementStartDelay > 0) {
      await sleep(this.workerOptions.elementStartDelay);
    }
  }

  /** @inheritDoc */
  public async start(): Promise<void> {
    this.addWorkerSetElement();
    // Add worker set element sequentially to optimize memory at startup
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
   * Add a new `WorkerSetElement`.
   */
  private addWorkerSetElement(): WorkerSetElement {
    const worker = new Worker(this.workerScript);
    worker.on(
      'message',
      (this.workerOptions?.messageHandler ?? WorkerConstants.EMPTY_FUNCTION).bind(
        this
      ) as MessageHandler<Worker>
    );
    worker.on('error', defaultErrorHandler.bind(this) as (err: Error) => void);
    worker.on('error', (error) => {
      this.emitter.emit('error', error);
      this.addWorkerSetElement();
    });
    worker.on('exit', defaultExitHandler.bind(this) as (exitCode: number) => void);
    worker.on('exit', () => this.workerSet.delete(this.getWorkerSetElementByWorker(worker)));
    const workerSetElement: WorkerSetElement = { worker, numberOfWorkerElements: 0 };
    this.workerSet.add(workerSetElement);
    return workerSetElement;
  }

  private async getWorkerSetElement(): Promise<WorkerSetElement> {
    let chosenWorkerSetElement: WorkerSetElement;
    for (const workerSetElement of this.workerSet) {
      if (workerSetElement.numberOfWorkerElements < this.workerOptions.elementsPerWorker) {
        chosenWorkerSetElement = workerSetElement;
        break;
      }
    }
    if (!chosenWorkerSetElement) {
      chosenWorkerSetElement = this.addWorkerSetElement();
      // Add worker set element sequentially to optimize memory at startup
      this.workerOptions.workerStartDelay > 0 && (await sleep(this.workerOptions.workerStartDelay));
    }
    return chosenWorkerSetElement;
  }

  private getWorkerSetElementByWorker(worker: Worker): WorkerSetElement | undefined {
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
