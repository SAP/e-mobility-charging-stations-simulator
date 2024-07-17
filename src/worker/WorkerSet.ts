// Partial Copyright Jerome Benoit. 2021-2024. All Rights Reserved.

import { randomUUID } from 'node:crypto'
import { EventEmitterAsyncResource } from 'node:events'
import { SHARE_ENV, Worker } from 'node:worker_threads'

import { WorkerAbstract } from './WorkerAbstract.js'
import { EMPTY_FUNCTION, workerSetVersion } from './WorkerConstants.js'
import {
  type SetInfo,
  type WorkerData,
  type WorkerMessage,
  WorkerMessageEvents,
  type WorkerOptions,
  type WorkerSetElement,
  WorkerSetEvents,
} from './WorkerTypes.js'
import { randomizeDelay, sleep } from './WorkerUtils.js'

interface ResponseWrapper<R extends WorkerData> {
  resolve: (value: R | PromiseLike<R>) => void
  reject: (reason?: unknown) => void
  workerSetElement: WorkerSetElement
}

export class WorkerSet<D extends WorkerData, R extends WorkerData> extends WorkerAbstract<D, R> {
  public readonly emitter: EventEmitterAsyncResource | undefined
  private readonly workerSet: Set<WorkerSetElement>
  private readonly promiseResponseMap: Map<
    `${string}-${string}-${string}-${string}`,
    ResponseWrapper<R>
  >

  private started: boolean
  private workerStartup: boolean

  /**
   * Creates a new `WorkerSet`.
   * @param workerScript -
   * @param workerOptions -
   */
  constructor (workerScript: string, workerOptions: WorkerOptions) {
    super(workerScript, workerOptions)
    if (this.workerOptions.elementsPerWorker == null) {
      throw new TypeError('Elements per worker is not defined')
    }
    if (!Number.isSafeInteger(this.workerOptions.elementsPerWorker)) {
      throw new TypeError('Elements per worker must be an integer')
    }
    if (this.workerOptions.elementsPerWorker <= 0) {
      throw new RangeError('Elements per worker must be greater than zero')
    }
    this.workerSet = new Set<WorkerSetElement>()
    this.promiseResponseMap = new Map<
      `${string}-${string}-${string}-${string}`,
      ResponseWrapper<R>
    >()
    if (this.workerOptions.poolOptions?.enableEvents === true) {
      this.emitter = new EventEmitterAsyncResource({ name: 'workerset' })
    }
    this.started = false
    this.workerStartup = false
  }

  get info (): SetInfo {
    return {
      version: workerSetVersion,
      type: 'set',
      worker: 'thread',
      started: this.started,
      size: this.size,
      elementsExecuting: [...this.workerSet].reduce(
        (accumulator, workerSetElement) => accumulator + workerSetElement.numberOfWorkerElements,
        0
      ),
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      elementsPerWorker: this.maxElementsPerWorker!,
    }
  }

  get size (): number {
    return this.workerSet.size
  }

  get maxElementsPerWorker (): number | undefined {
    return this.workerOptions.elementsPerWorker
  }

  /** @inheritDoc */
  public async start (): Promise<void> {
    this.addWorkerSetElement()
    // Add worker set element sequentially to optimize memory at startup
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.workerOptions.workerStartDelay! > 0 &&
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      (await sleep(randomizeDelay(this.workerOptions.workerStartDelay!)))
    this.emitter?.emit(WorkerSetEvents.started, this.info)
    this.started = true
  }

  /** @inheritDoc */
  public async stop (): Promise<void> {
    for (const workerSetElement of this.workerSet) {
      const worker = workerSetElement.worker
      const waitWorkerExit = new Promise<void>(resolve => {
        worker.once('exit', () => {
          resolve()
        })
      })
      worker.unref()
      await worker.terminate()
      await waitWorkerExit
    }
    this.emitter?.emit(WorkerSetEvents.stopped, this.info)
    this.started = false
    this.emitter?.emitDestroy()
  }

  /** @inheritDoc */
  public async addElement (elementData: D): Promise<R> {
    if (!this.started) {
      throw new Error('Cannot add a WorkerSet element: not started')
    }
    const workerSetElement = await this.getWorkerSetElement()
    const sendMessageToWorker = new Promise<R>((resolve, reject) => {
      const message = {
        uuid: randomUUID(),
        event: WorkerMessageEvents.addWorkerElement,
        data: elementData,
      } satisfies WorkerMessage<D>
      workerSetElement.worker.postMessage(message)
      this.promiseResponseMap.set(message.uuid, {
        resolve,
        reject,
        workerSetElement,
      })
    })
    const response = await sendMessageToWorker
    // Add element sequentially to optimize memory at startup
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (this.workerOptions.elementAddDelay! > 0) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await sleep(randomizeDelay(this.workerOptions.elementAddDelay!))
    }
    return response
  }

  /**
   * Adds a new `WorkerSetElement`.
   * @returns The new `WorkerSetElement`.
   */
  private addWorkerSetElement (): WorkerSetElement {
    this.workerStartup = true
    const worker = new Worker(this.workerScript, {
      env: SHARE_ENV,
      ...this.workerOptions.poolOptions?.workerOptions,
    })
    worker.on('message', this.workerOptions.poolOptions?.messageHandler ?? EMPTY_FUNCTION)
    worker.on('message', (message: WorkerMessage<R>) => {
      const { uuid, event, data } = message
      if (this.promiseResponseMap.has(uuid)) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const { resolve, reject, workerSetElement } = this.promiseResponseMap.get(uuid)!
        switch (event) {
          case WorkerMessageEvents.addedWorkerElement:
            this.emitter?.emit(WorkerSetEvents.elementAdded, this.info)
            ++workerSetElement.numberOfWorkerElements
            resolve(data)
            break
          case WorkerMessageEvents.workerElementError:
            this.emitter?.emit(WorkerSetEvents.elementError, data)
            reject(data)
            break
          default:
            reject(
              new Error(
                `Unknown worker message event: '${event}' received with data: '${JSON.stringify(
                  data,
                  undefined,
                  2
                )}'`
              )
            )
        }
        this.promiseResponseMap.delete(uuid)
      }
    })
    worker.on('error', this.workerOptions.poolOptions?.errorHandler ?? EMPTY_FUNCTION)
    worker.once('error', error => {
      this.emitter?.emit(WorkerSetEvents.error, error)
      if (
        this.workerOptions.poolOptions?.restartWorkerOnError === true &&
        this.started &&
        !this.workerStartup
      ) {
        this.addWorkerSetElement()
      }
      worker.unref()
      // eslint-disable-next-line promise/no-promise-in-callback
      worker.terminate().catch((error: unknown) => this.emitter?.emit(WorkerSetEvents.error, error))
    })
    worker.on('online', this.workerOptions.poolOptions?.onlineHandler ?? EMPTY_FUNCTION)
    worker.on('exit', this.workerOptions.poolOptions?.exitHandler ?? EMPTY_FUNCTION)
    worker.once('exit', () => {
      this.removeWorkerSetElement(this.getWorkerSetElementByWorker(worker))
    })
    const workerSetElement: WorkerSetElement = {
      worker,
      numberOfWorkerElements: 0,
    }
    this.workerSet.add(workerSetElement)
    this.workerStartup = false
    return workerSetElement
  }

  private removeWorkerSetElement (workerSetElement: WorkerSetElement | undefined): void {
    if (workerSetElement == null) {
      return
    }
    this.workerSet.delete(workerSetElement)
  }

  private async getWorkerSetElement (): Promise<WorkerSetElement> {
    let chosenWorkerSetElement: WorkerSetElement | undefined
    for (const workerSetElement of this.workerSet) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      if (workerSetElement.numberOfWorkerElements < this.workerOptions.elementsPerWorker!) {
        chosenWorkerSetElement = workerSetElement
        break
      }
    }
    if (chosenWorkerSetElement == null) {
      chosenWorkerSetElement = this.addWorkerSetElement()
      // Add worker set element sequentially to optimize memory at startup
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.workerOptions.workerStartDelay! > 0 &&
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        (await sleep(randomizeDelay(this.workerOptions.workerStartDelay!)))
    }
    return chosenWorkerSetElement
  }

  private getWorkerSetElementByWorker (worker: Worker): WorkerSetElement | undefined {
    let workerSetElt: WorkerSetElement | undefined
    for (const workerSetElement of this.workerSet) {
      if (workerSetElement.worker.threadId === worker.threadId) {
        workerSetElt = workerSetElement
        break
      }
    }
    return workerSetElt
  }
}
