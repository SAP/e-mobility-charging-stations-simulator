// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import { EventEmitter } from 'node:events';
import { SHARE_ENV, Worker } from 'node:worker_threads';

import type { ThreadPoolOptions } from 'poolifier';

import { WorkerAbstract } from './WorkerAbstract';
import { WorkerConstants } from './WorkerConstants';
import {
  type SetInfo,
  type WorkerData,
  type WorkerMessage,
  WorkerMessageEvents,
  type WorkerOptions,
  type WorkerSetElement,
  WorkerSetEvents,
} from './WorkerTypes';
import { sleep } from './WorkerUtils';

const DEFAULT_POOL_OPTIONS: ThreadPoolOptions = {
  enableEvents: true,
  restartWorkerOnError: true,
};

export class WorkerSet extends WorkerAbstract<WorkerData> {
  public readonly emitter!: EventEmitter;
  private readonly workerSet: Set<WorkerSetElement>;

  /**
   * Creates a new `WorkerSet`.
   *
   * @param workerScript -
   * @param workerOptions -
   */
  constructor(workerScript: string, workerOptions: WorkerOptions) {
    super(workerScript, workerOptions);
    this.workerOptions.poolOptions = {
      ...DEFAULT_POOL_OPTIONS,
      ...this.workerOptions.poolOptions,
    };
    this.workerSet = new Set<WorkerSetElement>();
    if (this.workerOptions.poolOptions?.enableEvents) {
      this.emitter = new EventEmitter();
    }
  }

  get info(): SetInfo {
    return {
      version: WorkerConstants.version,
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
    this.workerOptions.workerStartDelay! > 0 && (await sleep(this.workerOptions.workerStartDelay!));
  }

  /** @inheritDoc */
  public async stop(): Promise<void> {
    for (const workerSetElement of this.workerSet) {
      const workerExitPromise = new Promise<void>((resolve) => {
        workerSetElement.worker.on('exit', () => {
          resolve();
        });
      });
      await workerSetElement.worker.terminate();
      await workerExitPromise;
    }
    this.workerSet.clear();
  }

  /** @inheritDoc */
  public async addElement(elementData: WorkerData): Promise<void> {
    if (!this.workerSet) {
      throw new Error("Cannot add a WorkerSet element: workers' set does not exist");
    }
    const workerSetElement = await this.getWorkerSetElement();
    workerSetElement.worker.postMessage({
      event: WorkerMessageEvents.startWorkerElement,
      data: elementData,
    });
    ++workerSetElement.numberOfWorkerElements;
    // Add element sequentially to optimize memory at startup
    if (this.workerOptions.elementStartDelay! > 0) {
      await sleep(this.workerOptions.elementStartDelay!);
    }
  }

  /**
   * Adds a new `WorkerSetElement`.
   */
  private addWorkerSetElement(): WorkerSetElement {
    const worker = new Worker(this.workerScript, {
      env: SHARE_ENV,
      ...this.workerOptions.poolOptions?.workerOptions,
    });
    worker.on(
      'message',
      this.workerOptions.poolOptions?.messageHandler ?? WorkerConstants.EMPTY_FUNCTION,
    );
    worker.on('message', (message: WorkerMessage<WorkerData>) => {
      if (message.event === WorkerMessageEvents.startedWorkerElement) {
        this.emitter?.emit(WorkerSetEvents.elementStarted, message.data);
      } else if (message.event === WorkerMessageEvents.startWorkerElementError) {
        this.emitter?.emit(WorkerSetEvents.elementError, message.data);
      }
    });
    worker.on(
      'error',
      this.workerOptions.poolOptions?.errorHandler ?? WorkerConstants.EMPTY_FUNCTION,
    );
    worker.on('error', (error) => {
      this.emitter?.emit(WorkerSetEvents.error, error);
      if (this.workerOptions.poolOptions?.restartWorkerOnError) {
        this.addWorkerSetElement();
      }
    });
    worker.on(
      'online',
      this.workerOptions.poolOptions?.onlineHandler ?? WorkerConstants.EMPTY_FUNCTION,
    );
    worker.on(
      'exit',
      this.workerOptions.poolOptions?.exitHandler ?? WorkerConstants.EMPTY_FUNCTION,
    );
    worker.once('exit', () =>
      this.removeWorkerSetElement(this.getWorkerSetElementByWorker(worker)!),
    );
    const workerSetElement: WorkerSetElement = { worker, numberOfWorkerElements: 0 };
    this.workerSet.add(workerSetElement);
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
        (await sleep(this.workerOptions.workerStartDelay!));
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
