// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import { EventEmitterAsyncResource } from 'node:events';
import { SHARE_ENV, Worker } from 'node:worker_threads';

import { WorkerAbstract } from './WorkerAbstract';
import { EMPTY_FUNCTION, workerSetVersion } from './WorkerConstants';
import {
  type SetInfo,
  type WorkerData,
  type WorkerMessage,
  WorkerMessageEvents,
  type WorkerOptions,
  type WorkerSetElement,
  WorkerSetEvents,
} from './WorkerTypes';
import { randomizeDelay, sleep } from './WorkerUtils';

export class WorkerSet extends WorkerAbstract<WorkerData> {
  public readonly emitter: EventEmitterAsyncResource | undefined;
  private readonly workerSet: Set<WorkerSetElement>;
  private started: boolean;
  private workerStartup: boolean;

  /**
   * Creates a new `WorkerSet`.
   *
   * @param workerScript -
   * @param workerOptions -
   */
  constructor(workerScript: string, workerOptions: WorkerOptions) {
    super(workerScript, workerOptions);
    if (
      this.workerOptions.elementsPerWorker === null ||
      this.workerOptions.elementsPerWorker === undefined
    ) {
      throw new TypeError('Elements per worker is not defined');
    }
    if (!Number.isSafeInteger(this.workerOptions.elementsPerWorker)) {
      throw new TypeError('Elements per worker must be an integer');
    }
    if (this.workerOptions.elementsPerWorker <= 0) {
      throw new RangeError('Elements per worker must be greater than zero');
    }
    this.workerSet = new Set<WorkerSetElement>();
    if (this.workerOptions.poolOptions?.enableEvents) {
      this.emitter = new EventEmitterAsyncResource({ name: 'workerset' });
    }
    this.started = false;
    this.workerStartup = false;
  }

  get info(): SetInfo {
    return {
      version: workerSetVersion,
      type: 'set',
      worker: 'thread',
      size: this.size,
      elementsExecuting: [...this.workerSet].reduce(
        (accumulator, workerSetElement) => accumulator + workerSetElement.numberOfWorkerElements,
        0,
      ),
      elementsPerWorker: this.maxElementsPerWorker!,
    };
  }

  get size(): number {
    return this.workerSet.size;
  }

  get maxElementsPerWorker(): number | undefined {
    return this.workerOptions.elementsPerWorker;
  }

  /** @inheritDoc */
  public async start(): Promise<void> {
    this.addWorkerSetElement();
    // Add worker set element sequentially to optimize memory at startup
    this.workerOptions.workerStartDelay! > 0 &&
      (await sleep(randomizeDelay(this.workerOptions.workerStartDelay!)));
    this.emitter?.emit(WorkerSetEvents.started, this.info);
    this.started = true;
  }

  /** @inheritDoc */
  public async stop(): Promise<void> {
    for (const workerSetElement of this.workerSet) {
      const worker = workerSetElement.worker;
      const waitWorkerExit = new Promise<void>((resolve) => {
        worker.once('exit', () => {
          resolve();
        });
      });
      await worker.terminate();
      await waitWorkerExit;
      this.emitter?.emit(WorkerSetEvents.stopped, this.info);
      this.emitter?.emitDestroy();
      this.started = false;
    }
  }

  /** @inheritDoc */
  public async addElement(elementData: WorkerData): Promise<void> {
    if (!this.started) {
      throw new Error('Cannot add a WorkerSet element: not started');
    }
    if (!this.workerSet) {
      throw new Error("Cannot add a WorkerSet element: 'workerSet' property does not exist");
    }
    const workerSetElement = await this.getWorkerSetElement();
    workerSetElement.worker.postMessage({
      event: WorkerMessageEvents.startWorkerElement,
      data: elementData,
    });
    ++workerSetElement.numberOfWorkerElements;
    // Add element sequentially to optimize memory at startup
    if (this.workerOptions.elementStartDelay! > 0) {
      await sleep(randomizeDelay(this.workerOptions.elementStartDelay!));
    }
  }

  /**
   * Adds a new `WorkerSetElement`.
   */
  private addWorkerSetElement(): WorkerSetElement {
    this.workerStartup = true;
    const worker = new Worker(this.workerScript, {
      env: SHARE_ENV,
      ...this.workerOptions.poolOptions?.workerOptions,
    });
    worker.on('message', this.workerOptions.poolOptions?.messageHandler ?? EMPTY_FUNCTION);
    worker.on('message', (message: WorkerMessage<WorkerData>) => {
      if (message.event === WorkerMessageEvents.startedWorkerElement) {
        this.emitter?.emit(WorkerSetEvents.elementStarted, this.info);
      } else if (message.event === WorkerMessageEvents.startWorkerElementError) {
        this.emitter?.emit(WorkerSetEvents.elementError, message.data);
      }
    });
    worker.on('error', this.workerOptions.poolOptions?.errorHandler ?? EMPTY_FUNCTION);
    worker.on('error', (error) => {
      this.emitter?.emit(WorkerSetEvents.error, error);
      if (
        this.workerOptions.poolOptions?.restartWorkerOnError &&
        this.started &&
        !this.workerStartup
      ) {
        this.addWorkerSetElement();
      }
    });
    worker.on('online', this.workerOptions.poolOptions?.onlineHandler ?? EMPTY_FUNCTION);
    worker.on('exit', this.workerOptions.poolOptions?.exitHandler ?? EMPTY_FUNCTION);
    worker.once('exit', () =>
      this.removeWorkerSetElement(this.getWorkerSetElementByWorker(worker)!),
    );
    const workerSetElement: WorkerSetElement = { worker, numberOfWorkerElements: 0 };
    this.workerSet.add(workerSetElement);
    this.workerStartup = false;
    return workerSetElement;
  }

  private removeWorkerSetElement(workerSetElement: WorkerSetElement): void {
    this.workerSet.delete(workerSetElement);
  }

  private async getWorkerSetElement(): Promise<WorkerSetElement> {
    let chosenWorkerSetElement: WorkerSetElement | undefined;
    for (const workerSetElement of this.workerSet) {
      if (workerSetElement.numberOfWorkerElements < this.workerOptions.elementsPerWorker!) {
        chosenWorkerSetElement = workerSetElement;
        break;
      }
    }
    if (!chosenWorkerSetElement) {
      chosenWorkerSetElement = this.addWorkerSetElement();
      // Add worker set element sequentially to optimize memory at startup
      this.workerOptions.workerStartDelay! > 0 &&
        (await sleep(randomizeDelay(this.workerOptions.workerStartDelay!)));
    }
    return chosenWorkerSetElement;
  }

  private getWorkerSetElementByWorker(worker: Worker): WorkerSetElement | undefined {
    let workerSetElt: WorkerSetElement | undefined;
    for (const workerSetElement of this.workerSet) {
      if (workerSetElement.worker.threadId === worker.threadId) {
        workerSetElt = workerSetElement;
        break;
      }
    }
    return workerSetElt;
  }
}
