// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import { Queue } from 'mnemonist';

export enum AsyncLockType {
  configuration = 'configuration',
  performance = 'performance',
}

type ResolveType = (value: void | PromiseLike<void>) => void;

export class AsyncLock {
  private static readonly asyncLocks = new Map<AsyncLockType, AsyncLock>();
  private acquired: boolean;
  private readonly resolveQueue: Queue<ResolveType>;

  private constructor() {
    this.acquired = false;
    this.resolveQueue = new Queue<ResolveType>();
  }

  public static async acquire(type: AsyncLockType): Promise<void> {
    const asyncLock = AsyncLock.getAsyncLock(type);
    if (!asyncLock.acquired) {
      asyncLock.acquired = true;
      return;
    }
    return new Promise((resolve) => {
      asyncLock.resolveQueue.enqueue(resolve);
    });
  }

  public static async release(type: AsyncLockType): Promise<void> {
    const asyncLock = AsyncLock.getAsyncLock(type);
    if (asyncLock.resolveQueue.size === 0 && asyncLock.acquired) {
      asyncLock.acquired = false;
      return;
    }
    const queuedResolve = asyncLock.resolveQueue.dequeue();
    return new Promise((resolve) => {
      queuedResolve();
      resolve();
    });
  }

  private static getAsyncLock(type: AsyncLockType): AsyncLock {
    if (!AsyncLock.asyncLocks.has(type)) {
      AsyncLock.asyncLocks.set(type, new AsyncLock());
    }
    return AsyncLock.asyncLocks.get(type);
  }
}
