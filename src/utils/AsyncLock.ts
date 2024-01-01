// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import Queue from 'mnemonist/queue.js'

import { Constants } from './Constants.js'

export enum AsyncLockType {
  configuration = 'configuration',
  performance = 'performance',
}

type ResolveType = (value: void | PromiseLike<void>) => void

export class AsyncLock {
  private static readonly asyncLocks = new Map<AsyncLockType, AsyncLock>()
  private acquired: boolean
  private readonly resolveQueue: Queue<ResolveType>

  private constructor () {
    this.acquired = false
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    this.resolveQueue = new Queue<ResolveType>()
  }

  public static async runExclusive<T>(type: AsyncLockType, fn: () => T | Promise<T>): Promise<T> {
    return await AsyncLock.acquire(type)
      .then(fn)
      .finally(() => {
        AsyncLock.release(type).catch(Constants.EMPTY_FUNCTION)
      })
  }

  private static async acquire (type: AsyncLockType): Promise<void> {
    const asyncLock = AsyncLock.getAsyncLock(type)
    if (!asyncLock.acquired) {
      asyncLock.acquired = true
      return
    }
    await new Promise<void>((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      asyncLock.resolveQueue.enqueue(resolve)
    })
  }

  private static async release (type: AsyncLockType): Promise<void> {
    const asyncLock = AsyncLock.getAsyncLock(type)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (asyncLock.resolveQueue.size === 0 && asyncLock.acquired) {
      asyncLock.acquired = false
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const queuedResolve = asyncLock.resolveQueue.dequeue()!
    await new Promise<void>((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      queuedResolve()
      resolve()
    })
  }

  private static getAsyncLock (type: AsyncLockType): AsyncLock {
    if (!AsyncLock.asyncLocks.has(type)) {
      AsyncLock.asyncLocks.set(type, new AsyncLock())
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return AsyncLock.asyncLocks.get(type)!
  }
}
