// Partial Copyright Jerome Benoit. 2021-2024. All Rights Reserved.

import { Queue } from 'mnemonist'

import { isAsyncFunction } from './Utils.js'

export enum AsyncLockType {
  configuration = 'configuration',
  performance = 'performance',
}

type ResolveType = (value: PromiseLike<void> | void) => void

export class AsyncLock {
  private static readonly asyncLocks = new Map<AsyncLockType, AsyncLock>()
  private acquired: boolean
  private readonly resolveQueue: Queue<ResolveType>

  private constructor () {
    this.acquired = false
    this.resolveQueue = new Queue<ResolveType>()
  }

  public static async runExclusive<T>(type: AsyncLockType, fn: () => Promise<T> | T): Promise<T> {
    try {
      await AsyncLock.acquire(type)
      if (isAsyncFunction(fn)) {
        return await fn()
      } else {
        return fn() as T
      }
    } finally {
      AsyncLock.release(type)
    }
  }

  private static async acquire (type: AsyncLockType): Promise<void> {
    const asyncLock = AsyncLock.getAsyncLock(type)
    if (!asyncLock.acquired) {
      asyncLock.acquired = true
      return
    }
    await new Promise<void>(resolve => {
      asyncLock.resolveQueue.enqueue(resolve)
    })
  }

  private static getAsyncLock (type: AsyncLockType): AsyncLock {
    if (!AsyncLock.asyncLocks.has(type)) {
      AsyncLock.asyncLocks.set(type, new AsyncLock())
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return AsyncLock.asyncLocks.get(type)!
  }

  private static release (type: AsyncLockType): void {
    const asyncLock = AsyncLock.getAsyncLock(type)
    const nextResolve = asyncLock.resolveQueue.dequeue()
    if (nextResolve != null) {
      nextResolve()
      return
    }
    asyncLock.acquired = false
  }
}
